import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, streamObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import {
  AiMode,
  GenerateStreamEvent,
  GeneratedCarouselPlan,
  SlideCountMode,
  StreamPreviewState,
  VerbatimLayoutStyle,
  WordCountMode,
  buildLocalAiPlan,
  buildVerbatimPlan,
  ensureSlideFitsTemplate,
  extractArticleCredits,
  normalizeCreditRole,
} from '@/lib/autoLayout';

export const maxDuration = 60;

function getMediaSchema(slideCount: SlideCountMode, wordCount: WordCountMode) {
  const slideInstruction =
    slideCount === 'auto'
      ? 'Buatlah jumlah slide sesuai kebutuhan (ideal 3-6 elemen array).'
      : `Buatlah TEPAT ${slideCount} slide/elemen array (tidak boleh kurang atau lebih).`;

  let wordCountInstruction = '';
  let templateFitRule = '';
  if (wordCount === 'singkat') {
    wordCountInstruction =
      'Tiap slide (elemen) WAJIB berisi sekitar 20-30 kata (1-2 kalimat, maks 200 karakter). Ringkas dan langsung pada inti.';
    templateFitRule =
      'Semua template isi berita boleh dipakai (foto-atas, foto-bawah, panel, teks, dua-kolom, atau kutipan khusus ucapan langsung).';
  } else if (wordCount === 'sedang') {
    wordCountInstruction =
      'Tiap slide (elemen) WAJIB berisi sekitar 35-48 kata (2-3 kalimat, maks 280 karakter; khusus kutipan maks 30 kata / 190 karakter). Nyaman dibaca dan muat tanpa terpotong.';
    templateFitRule =
      'Gunakan foto-atas, panel, teks, atau dua-kolom (hindari foto-bawah jika lebih dari 30 kata). Gunakan kutipan HANYA untuk ucapan langsung narasumber (maks 30 kata).';
  } else {
    wordCountInstruction =
      'Tiap slide (elemen) berisi sekitar 55-75 kata (1 paragraf padat, maks 460 karakter; khusus kutipan maks 30 kata / 190 karakter).';
    templateFitRule =
      'KARENA TEKS PANJANG, WAJIB gunakan template "teks" atau "dua-kolom" untuk slide paragraf (jangan pakai foto-atas/foto-bawah/panel yang ruang teksnya sempit, kecuali "kutipan" pendek maks 30 kata).';
  }

  return z.object({
    kicker: z
      .string()
      .describe('Label kategori berita singkat 1-2 kata HURUF KAPITAL (mis. BERITA UTAMA, KAMPUS, BUDAYA, EKONOMI).'),
    cover: z
      .string()
      .describe(
        'Judul berita tajam & informatif, maksimal 7 kata (maks 65 karakter) agar muat sempurna tanpa terpotong. Gunakan \\n untuk pindah baris (tanpa tag HTML). HURUF KAPITAL SEMUA.',
      ),
    coverTemplate: z
      .enum(['foto-bawah', 'foto-tengah', 'blok-warna', 'bingkai', 'poster'])
      .describe('Pilihan template layout cover yang paling cocok.'),
    credits: z
      .array(
        z.object({
          role: z
            .string()
            .describe('Peran persis sesuai artikel: Penulis, Penyunting, Layouter, Editor, Foto, Reporter, Ilustrasi, atau Sumber.'),
          name: z.string().describe('Nama lengkap sesuai yang tertulis di artikel.'),
        }),
      )
      .describe(
        'Daftar kredit redaksi (Penulis, Penyunting, Layouter, Editor, Fotografer, Sumber) yang TERTULIS di artikel. Jika tidak tertulis di artikel, kembalikan array kosong [].',
      ),
    contents: z
      .array(
        z.object({
          title: z
            .string()
            .describe(
              'Subjudul singkat maks 6 kata / 55 karakter. KHUSUS jika template="kutipan", isi dengan Nama & Jabatan/Identitas narasumber (mis. "Naufal — Ketua Pelaksana GBN 2026").',
            ),
          body: z
            .string()
            .describe(
              `Isi slide. ${wordCountInstruction} KHUSUS jika template="kutipan", isi HANYA kalimat ucapan langsung narasumber (tanpa tanda kutip pembuka/penutup dan tanpa kata "ujar/kata ...").`,
            ),
          template: z
            .enum(['foto-atas', 'teks', 'foto-bawah', 'panel', 'kutipan', 'dua-kolom'])
            .describe(
              `${templateFitRule} PENTING: template "kutipan" HANYA untuk ucapan langsung narasumber (bukan kalimat tidak langsung/mention dan bukan judul tema).`,
            ),
        }),
      )
      .describe(`Array berisi isi berita (JANGAN masukkan baris Penulis/Penyunting/Layouter ke sini). ${slideInstruction}`),
    outroTitle: z
      .string()
      .describe('Judul penutup singkat maks 4 kata / 35 karakter (mis. "Ikuti Kabar Selanjutnya").'),
    outro: z
      .string()
      .describe(
        'Kalimat penutup ringkas atau ajakan diskusi/ikuti pembaruan berita, maks 16 kata / 100 karakter agar muat di atas kotak QR.',
      ),
    outroTemplate: z
      .enum(['qr-tengah', 'cta-foto', 'minimal', 'banner'])
      .describe('Pilihan template layout untuk halaman penutup.'),
  });
}

type MediaSchemaOut = z.infer<ReturnType<typeof getMediaSchema>>;

const SYSTEM_PROMPT = `Kamu adalah Editor Senior Media Sosial yang merangkum artikel berita menjadi Carousel Instagram 1080x1350 yang rapi, faktual, dan mudah dibaca.

ATURAN 1 — GROUNDING (ANTI-HALUSINASI):
- Seluruh isi, nama, angka, dan kredit HANYA BOLEH berasal dari teks artikel berita yang dikirimkan.
- DILARANG menambah fakta, opini, nama redaksi, atau detail fiktif dari luar artikel.

ATURAN 2 — EKSTRAKSI KREDIT (PENULIS, PENYUNTING, LAYOUTER, FOTO, DLL):
- Jika di dalam artikel tertulis kredit seperti "Penulis : ...", "Penyunting : ...", "Layouter : ...", "Editor : ...", "Foto : ...", masukkan seluruhnya ke array "credits" (maksimal 4 baris).
- JANGAN masukkan baris kredit tersebut ke dalam slide "contents".
- Jika artikel tidak mencantumkan kredit siapa pun, kembalikan "credits": [].

ATURAN 3 — BEDAKAN QUOTE vs MENTION:
- Template "kutipan" HANYA BOLEH dipakai jika artikel memuat UCAPAN LANGSUNG narasumber (kalimat langsung bertanda petik dengan verba ujaran seperti ujar, kata, tutur, ungkap, ucap).
- JANGAN pakai template "kutipan" untuk:
  (a) Kalimat tidak langsung / mention biasa (contoh: "Naufal menjelaskan bahwa...", "Ian dan Alea mengungkapkan bahwa...").
  (b) Nama tema, acara, atau istilah bertanda kutip (contoh: tema "Merdeka Berkarya Nusantara Berbudaya").
- Pada template "kutipan": "title" = nama & identitas narasumber, "body" = ucapan langsungnya saja (maks 30 kata / 190 karakter, tanpa tanda kutip luar dan tanpa embel-embel "ujar ...").

ATURAN 4 — KESESUAIAN PANJANG TEKS DENGAN KANVAS:
- Pastikan teks benar-benar MUAT di kanvas tanpa terpotong ("…"):
  * Cover maksimal 7 kata (<= 65 karakter).
  * Subjudul maksimal 6 kata (<= 55 karakter).
  * Outro maksimal 16 kata (<= 100 karakter).
  * Pilih template isi yang kapasitasnya cukup untuk panjang teksnya (teks panjang -> "teks" atau "dua-kolom").
- Improvisasi sederhana saja: susun alur antar-slide mengalir alami (inti berita -> detail/fakta -> kutipan langsung jika ada -> dinamika/respons -> penutup) tanpa mengulang fakta yang sama.`;

const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'] as const;

const cleanBreak = (str: string) => str.replace(/<br\s*\/?>/gi, '\n').trim();

function clampText(text: string, maxChars: number): string {
  const t = cleanBreak(text);
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > maxChars * 0.5 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function formatFriendlyError(rawMessage: string): string {
  if (rawMessage.includes('503') || rawMessage.includes('high demand') || rawMessage.includes('UNAVAILABLE')) {
    return 'Server AI Google sedang sibuk (overload). Silakan tunggu 30 detik lalu coba lagi.';
  }
  if (rawMessage.includes('401') || rawMessage.includes('API key') || rawMessage.includes('API_KEY_INVALID')) {
    return 'API Key tidak valid. Periksa kembali file .env.local Anda.';
  }
  return rawMessage || 'Terjadi kesalahan saat memproses dengan AI.';
}

function buildFinalPrompt(prompt: string, context: string): string {
  let finalPrompt = `${SYSTEM_PROMPT}\n\n`;
  if (context && context.trim() !== '') {
    finalPrompt += `SUDUT PANDANG / KONTEKS TAMBAHAN DARI USER:\n"${context.trim()}"\n\n(Tulis rangkuman berita ini dengan menyesuaikan sudut pandang/konteks di atas tanpa melanggar aturan grounding).\n\n`;
  }
  finalPrompt += `Berikut adalah teks beritanya:\n"${prompt}"`;
  return finalPrompt;
}

function assemblePlanFromAi(
  aiOut: MediaSchemaOut,
  rawPrompt: string,
  handle: string,
): { plan: GeneratedCarouselPlan; upgradedCount: number; creditCount: number } {
  const { credits: parsedCredits } = extractArticleCredits(rawPrompt);
  const aiCredits = (aiOut.credits ?? [])
    .map(c => ({ role: normalizeCreditRole(c.role), name: c.name.trim() }))
    .filter(c => c.name && !/^(tim redaksi|meja berita|redaksi|dokumentasi)$/i.test(c.name));

  const mergedCredits = [...parsedCredits];
  for (const ac of aiCredits) {
    if (!mergedCredits.some(c => c.role === ac.role && c.name.toLowerCase() === ac.name.toLowerCase())) {
      mergedCredits.push(ac);
    }
  }

  let upgradedCount = 0;
  const slides = aiOut.contents.map(item => {
    const fitted = ensureSlideFitsTemplate({
      title: cleanBreak(item.title),
      body: cleanBreak(item.body),
      template: item.template,
    });
    if (fitted.template !== item.template) upgradedCount++;
    return fitted;
  });

  const finalCredits = mergedCredits.slice(0, 4);
  return {
    upgradedCount,
    creditCount: finalCredits.length,
    plan: {
      cover: {
        kicker: (aiOut.kicker || 'BERITA UTAMA').toUpperCase().slice(0, 26),
        title: clampText(aiOut.cover, 72),
        template: aiOut.coverTemplate,
        credits: finalCredits,
      },
      slides,
      penutup: {
        title: clampText(aiOut.outroTitle || 'Baca Selengkapnya', 42),
        body: clampText(aiOut.outro, 105),
        handle,
        template: aiOut.outroTemplate,
      },
    },
  };
}

async function tryGenerate(
  apiKey: string,
  prompt: string,
  slideCount: SlideCountMode,
  wordCount: WordCountMode,
  context: string,
): Promise<{ object: MediaSchemaOut; modelUsed: string }> {
  let lastError: unknown = null;
  const currentSchema = getMediaSchema(slideCount, wordCount);
  const google = createGoogleGenerativeAI({ apiKey });
  const finalPrompt = buildFinalPrompt(prompt, context);

  for (const modelName of MODELS) {
    try {
      const result = await generateObject({
        model: google(modelName),
        schema: currentSchema,
        prompt: finalPrompt,
        temperature: 0.5,
      });
      return { object: result.object, modelUsed: modelName };
    } catch (error: unknown) {
      const err = error as { status?: number; statusCode?: number; data?: { error?: { code?: number } } };
      lastError = error;
      const status = err?.status || err?.statusCode || err?.data?.error?.code;
      if (status === 401) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  await new Promise(resolve => setTimeout(resolve, 2000));
  try {
    const result = await generateObject({
      model: google('gemini-3.5-flash-lite'),
      schema: currentSchema,
      prompt: finalPrompt,
      temperature: 0.5,
    });
    return { object: result.object, modelUsed: 'gemini-3.5-flash-lite' };
  } catch (finalError) {
    throw lastError || finalError;
  }
}

async function tryStreamGenerate(
  apiKey: string,
  prompt: string,
  slideCount: SlideCountMode,
  wordCount: WordCountMode,
  context: string,
  emit: (ev: Omit<Extract<GenerateStreamEvent, { type: 'progress' }>, 'type' | 'elapsedMs'>) => void,
): Promise<{ object: MediaSchemaOut; modelUsed: string }> {
  let lastError: unknown = null;
  const currentSchema = getMediaSchema(slideCount, wordCount);
  const google = createGoogleGenerativeAI({ apiKey });
  const finalPrompt = buildFinalPrompt(prompt, context);
  const expectedSlides = slideCount === 'auto' ? 4 : parseInt(slideCount, 10);

  const attemptModels: string[] = [...MODELS, 'gemini-3.5-flash-lite'];

  for (let attempt = 0; attempt < attemptModels.length; attempt++) {
    const modelName = attemptModels[attempt];
    const isFinalRetry = attempt === attemptModels.length - 1;

    emit({
      step: 'connect',
      percent: 24,
      message: isFinalRetry
        ? `Percobaan ulang ke model ${modelName}…`
        : `Menghubungi Google Gemini (${modelName})…`,
      log: isFinalRetry
        ? `Retry akhir menggunakan ${modelName} setelah jeda pemulihan 2 detik…`
        : `Mengirim prompt + skema Zod ke ${modelName} (slide: ${slideCount}, kepadatan: ${wordCount}, grounding: aktif)…`,
    });

    try {
      const streamRes = streamObject({
        model: google(modelName),
        schema: currentSchema,
        prompt: finalPrompt,
        temperature: 0.5,
      });

      let loggedCover = false;
      const loggedSlides = new Set<number>();
      let loggedOutro = false;
      let lastEmitTime = 0;

      for await (const part of streamRes.fullStream) {
        if (part.type === 'error') {
          throw part.error;
        }

        if (part.type === 'object') {
          const p = part.object;
          const rawContents = Array.isArray(p.contents) ? p.contents : [];
          const preview: StreamPreviewState = {
            kicker: p.kicker ? String(p.kicker) : undefined,
            cover: p.cover ? cleanBreak(String(p.cover)).replace(/\n/g, ' ') : undefined,
            slides: rawContents
              .filter((it): it is NonNullable<typeof it> => Boolean(it && (it.title || it.body)))
              .map(it => ({
                title: it.title ? cleanBreak(String(it.title)) : 'Menyusun subjudul…',
                template: it.template ? String(it.template) : '…',
              })),
            hasOutro: Boolean(p.outro),
          };

          const curCount = preview.slides.length;
          const pct = p.outro
            ? 88
            : curCount > 0
              ? Math.min(84, 38 + Math.round((curCount / Math.max(1, expectedSlides)) * 44))
              : p.cover
                ? 34
                : 28;

          let milestoneLog: string | undefined;

          if (!loggedCover && p.cover && rawContents.length > 0) {
            loggedCover = true;
            milestoneLog = `✓ Cover dirumuskan [${p.coverTemplate || 'foto-bawah'}]: "${cleanBreak(String(p.cover)).replace(/\n/g, ' ')}"`;
          }

          if (!milestoneLog) {
            for (let i = 0; i < rawContents.length; i++) {
              const item = rawContents[i];
              const nextStarted = i + 1 < rawContents.length || Boolean(p.outroTitle || p.outro);
              if (!loggedSlides.has(i) && item && item.body && item.template && nextStarted) {
                loggedSlides.add(i);
                const wCount = String(item.body).trim().split(/\s+/).filter(Boolean).length;
                milestoneLog = `✓ Slide Isi #${i + 1} selesai [${item.template}] — "${cleanBreak(String(item.title || 'Tanpa subjudul'))}" (${wCount} kata)`;
                break;
              }
            }
          }

          if (!milestoneLog && !loggedOutro && p.outro && p.outroTemplate) {
            loggedOutro = true;
            milestoneLog = `✓ Halaman Penutup selesai [${p.outroTemplate}]`;
          }

          const now = Date.now();
          if (milestoneLog || now - lastEmitTime >= 150) {
            lastEmitTime = now;
            const activeMsg = p.outro
              ? 'Merampungkan halaman penutup…'
              : curCount > 0
                ? `Menyusun Slide Isi #${curCount} secara real-time…`
                : p.cover
                  ? 'Merumuskan judul cover utama…'
                  : `Menerima aliran token dari ${modelName}…`;

            emit({
              step: 'streaming',
              percent: pct,
              message: activeMsg,
              log: milestoneLog,
              preview,
            });
          }
        }

        if (part.type === 'finish') {
          const inTok = part.usage?.inputTokens;
          const outTok = part.usage?.outputTokens;
          if (inTok !== undefined || outTok !== undefined) {
            emit({
              step: 'streaming',
              percent: 90,
              message: 'Validasi skema JSON selesai…',
              log: `Token terpakai (${modelName}): input ${inTok ?? '-'} · output ${outTok ?? '-'} token.`,
            });
          }
        }
      }

      const finalObject = await streamRes.object;
      return { object: finalObject, modelUsed: modelName };
    } catch (error: unknown) {
      const err = error as { message?: string; status?: number; statusCode?: number; data?: { error?: { code?: number } } };
      lastError = error;
      const msg = err?.message || 'Unknown error';
      const status = err?.status || err?.statusCode || err?.data?.error?.code;

      if (status === 401 || msg.includes('401') || msg.includes('API_KEY_INVALID') || msg.includes('API key')) {
        throw error;
      }

      if (attempt < attemptModels.length - 1) {
        const nextModel = attemptModels[attempt + 1];
        const waitMs = attempt === attemptModels.length - 2 ? 2000 : 1000;
        emit({
          step: 'connect',
          percent: 22,
          message: `Model ${modelName} sibuk, beralih ke ${nextModel}…`,
          log: `⚠ ${modelName} gagal (${msg.slice(0, 90)}). Menunggu ${waitMs / 1000}d lalu fallback ke ${nextModel}…`,
        });
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  throw lastError || new Error('Seluruh percobaan model AI gagal.');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = String(body?.prompt ?? body?.article ?? '').trim();
    const mode: AiMode = body?.mode === 'ai' ? 'ai' : 'verbatim';
    const slideCount: SlideCountMode = (['auto', '2', '3', '4', '5', '6'].includes(body?.slideCount)
      ? body.slideCount
      : 'auto') as SlideCountMode;
    const wordCount: WordCountMode = (['singkat', 'sedang', 'panjang'].includes(body?.wordCount)
      ? body.wordCount
      : 'sedang') as WordCountMode;
    const context = String(body?.context ?? body?.instruction ?? '').trim();
    const layoutStyle: VerbatimLayoutStyle = body?.layoutStyle === 'text-focused' ? 'text-focused' : 'varied';
    const handle = String(body?.handle ?? '@akunmedia').trim() || '@akunmedia';
    const useFallback = Boolean(body?.useFallback);
    const wantsStream = Boolean(body?.stream);

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt / teks berita wajib diisi.' }, { status: 400 });
    }

    // Mode streaming real-time (NDJSON) untuk progress bar user & log presentasi dev
    if (wantsStream) {
      const encoder = new TextEncoder();
      const t0 = Date.now();

      const stream = new ReadableStream({
        async start(controller) {
          const send = (ev: GenerateStreamEvent) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
          };

          try {
            const words = prompt.split(/\s+/).filter(Boolean).length;
            const paras = prompt.split(/\n+/).filter(p => p.trim()).length;
            const { credits: detectedCredits } = extractArticleCredits(prompt);

            send({
              type: 'progress',
              step: 'validate',
              percent: 12,
              elapsedMs: Date.now() - t0,
              message: 'Memvalidasi naskah & mengekstrak kredit redaksi…',
              log: `Naskah diterima: ${words} kata (${paras} paragraf). Kredit terdeteksi: ${
                detectedCredits.length > 0
                  ? detectedCredits.map(c => `${c.role} (${c.name})`).join(', ')
                  : 'tidak ada baris kredit eksplisit'
              }.`,
            });

            if (mode === 'verbatim') {
              await new Promise(r => setTimeout(r, 120));
              send({
                type: 'progress',
                step: 'connect',
                percent: 42,
                elapsedMs: Date.now() - t0,
                message: 'Memecah paragraf verbatim tanpa mengubah kata…',
                log: `Mode 1 (Verbatim 100%) aktif — gaya distribusi template: ${layoutStyle}.`,
              });

              const plan = buildVerbatimPlan(prompt, layoutStyle, handle);
              await new Promise(r => setTimeout(r, 120));

              send({
                type: 'progress',
                step: 'layout',
                percent: 88,
                elapsedMs: Date.now() - t0,
                message: 'Memverifikasi kapasitas kanvas 1080×1350…',
                log: `Teks asli berhasil dibagi ke 1 Cover + ${plan.slides.length} Slide Isi + 1 Penutup tanpa perubahan kata.`,
              });

              const durationMs = Date.now() - t0;
              send({
                type: 'progress',
                step: 'done',
                percent: 100,
                elapsedMs: durationMs,
                message: 'Layout selesai dibuat!',
                log: `Proses selesai dalam ${(durationMs / 1000).toFixed(2)} detik.`,
              });
              send({ type: 'result', plan, source: 'verbatim', modelUsed: 'verbatim-engine', durationMs });
              controller.close();
              return;
            }

            if (useFallback) {
              await new Promise(r => setTimeout(r, 120));
              send({
                type: 'progress',
                step: 'connect',
                percent: 45,
                elapsedMs: Date.now() - t0,
                message: 'Menjalankan simulasi perangkum lokal…',
                log: 'Menggunakan mesin lokal (tanpa panggilan API eksternal).',
              });

              const plan = buildLocalAiPlan(prompt, context, handle, slideCount, wordCount);
              await new Promise(r => setTimeout(r, 120));

              const durationMs = Date.now() - t0;
              send({
                type: 'progress',
                step: 'done',
                percent: 100,
                elapsedMs: durationMs,
                message: 'Simulasi layout selesai!',
                log: `Berhasil merakit 1 Cover + ${plan.slides.length} Slide Isi + 1 Penutup dalam ${(durationMs / 1000).toFixed(2)} detik.`,
              });
              send({ type: 'result', plan, source: 'fallback', modelUsed: 'local-fallback', durationMs });
              controller.close();
              return;
            }

            const apiKey = String(
              process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
                process.env.GEMINI_API_KEY ||
                process.env.GOOGLE_API_KEY ||
                '',
            ).trim();

            if (!apiKey) {
              send({
                type: 'error',
                error:
                  'API Key belum dikonfigurasi. Tambahkan GOOGLE_GENERATIVE_AI_API_KEY di file .env.local lalu restart server.',
                needsKey: true,
                elapsedMs: Date.now() - t0,
              });
              controller.close();
              return;
            }

            const { object: aiOut, modelUsed } = await tryStreamGenerate(
              apiKey,
              prompt,
              slideCount,
              wordCount,
              context,
              ev => send({ type: 'progress', elapsedMs: Date.now() - t0, ...ev }),
            );

            const { plan, upgradedCount, creditCount } = assemblePlanFromAi(aiOut, prompt, handle);
            send({
              type: 'progress',
              step: 'layout',
              percent: 95,
              elapsedMs: Date.now() - t0,
              message: 'Menyesuaikan kapasitas teks ke kanvas 1080×1350…',
              log: `Validasi kanvas selesai: 1 Cover + ${plan.slides.length} Slide Isi + 1 Penutup · ${creditCount} kredit redaksi${
                upgradedCount > 0 ? ` (${upgradedCount} slide otomatis disesuaikan templatenya agar tidak terpotong)` : ''
              }.`,
            });

            const durationMs = Date.now() - t0;
            send({
              type: 'progress',
              step: 'done',
              percent: 100,
              elapsedMs: durationMs,
              message: 'Selesai! Membuka editor…',
              log: `✓ Generasi tuntas via ${modelUsed} dalam ${(durationMs / 1000).toFixed(2)} detik.`,
            });
            send({ type: 'result', plan, source: 'gemini', modelUsed, durationMs });
          } catch (error: unknown) {
            const err = error as { message?: string };
            send({
              type: 'error',
              error: formatFriendlyError(err?.message || 'Unknown error'),
              elapsedMs: Date.now() - t0,
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Jalur JSON non-stream (kompatibilitas cadangan)
    if (mode === 'verbatim') {
      return NextResponse.json({
        plan: buildVerbatimPlan(prompt, layoutStyle, handle),
        source: 'verbatim',
      });
    }

    if (useFallback) {
      return NextResponse.json({
        plan: buildLocalAiPlan(prompt, context, handle, slideCount, wordCount),
        source: 'fallback',
      });
    }

    const apiKey = String(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        '',
    ).trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'API Key belum dikonfigurasi. Tambahkan GOOGLE_GENERATIVE_AI_API_KEY di file .env.local lalu restart server.',
          needsKey: true,
        },
        { status: 500 },
      );
    }

    const { object: aiOut, modelUsed } = await tryGenerate(apiKey, prompt, slideCount, wordCount, context);
    const { plan } = assemblePlanFromAi(aiOut, prompt, handle);
    return NextResponse.json({ plan, source: 'gemini', modelUsed });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ error: formatFriendlyError(err?.message || 'Unknown error') }, { status: 500 });
  }
}
