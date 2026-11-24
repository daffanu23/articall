import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import {
  AiMode,
  GeneratedCarouselPlan,
  SlideCountMode,
  VerbatimLayoutStyle,
  WordCountMode,
  buildLocalAiPlan,
  buildVerbatimPlan,
  ensureSlideFitsTemplate,
  extractArticleCredits,
  normalizeCreditRole,
} from '@/lib/autoLayout';

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

// Model resmi sesuai konfigurasi project Articall original
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'] as const;

const cleanBreak = (str: string) => str.replace(/<br\s*\/?>/gi, '\n').trim();

function clampText(text: string, maxChars: number): string {
  const t = cleanBreak(text);
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > maxChars * 0.5 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

async function tryGenerate(
  apiKey: string,
  prompt: string,
  slideCount: SlideCountMode,
  wordCount: WordCountMode,
  context: string,
) {
  let lastError: unknown = null;
  const currentSchema = getMediaSchema(slideCount, wordCount);
  const google = createGoogleGenerativeAI({ apiKey });

  let finalPrompt = `${SYSTEM_PROMPT}\n\n`;
  if (context && context.trim() !== '') {
    finalPrompt += `SUDUT PANDANG / KONTEKS TAMBAHAN DARI USER:\n"${context.trim()}"\n\n(Tulis rangkuman berita ini dengan menyesuaikan sudut pandang/konteks di atas tanpa melanggar aturan grounding).\n\n`;
  }
  finalPrompt += `Berikut adalah teks beritanya:\n"${prompt}"`;

  for (const modelName of MODELS) {
    try {
      console.log(`Trying model: ${modelName} with slideCount: ${slideCount}, wordCount: ${wordCount}...`);

      const result = await generateObject({
        model: google(modelName),
        schema: currentSchema,
        prompt: finalPrompt,
        temperature: 0.5,
      });

      console.log(`Success with model: ${modelName}`);
      return result.object;
    } catch (error: unknown) {
      const err = error as { message?: string; status?: number; statusCode?: number; data?: { error?: { code?: number } } };
      console.warn(`Model ${modelName} failed:`, err?.message || 'Unknown error');
      lastError = error;

      // Jika error 401 (API key salah), langsung lempar tanpa coba yang lain
      const status = err?.status || err?.statusCode || err?.data?.error?.code;
      if (status === 401) {
        throw error;
      }

      // Tunggu sebentar sebelum coba model berikutnya
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Jika kedua model gagal, coba sekali lagi dengan model kedua (flash-lite)
  console.log('All models failed. Retrying with gemini-3.5-flash-lite after 2s delay...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    const result = await generateObject({
      model: google('gemini-3.5-flash-lite'),
      schema: currentSchema,
      prompt: finalPrompt,
      temperature: 0.5,
    });
    return result.object;
  } catch (finalError) {
    throw lastError || finalError;
  }
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

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt / teks berita wajib diisi.' }, { status: 400 });
    }

    // Mode 1: Teks Asli (Tanpa Intervensi AI)
    if (mode === 'verbatim') {
      return NextResponse.json({
        plan: buildVerbatimPlan(prompt, layoutStyle, handle),
        source: 'verbatim',
      });
    }

    // Mode 2: Olah Penuh AI (Arsitektur original @ai-sdk/google + generateObject + zod)
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

    console.log('Starting AI generation with fallback models...');
    const aiOut = await tryGenerate(apiKey, prompt, slideCount, wordCount, context);
    console.log('AI Generation Complete!');

    // Gabungkan kredit deterministik dari teks asli + hasil ekstraksi AI (tanpa halusinasi placeholder)
    const { credits: parsedCredits } = extractArticleCredits(prompt);
    const aiCredits = (aiOut.credits ?? [])
      .map(c => ({ role: normalizeCreditRole(c.role), name: c.name.trim() }))
      .filter(c => c.name && !/^(tim redaksi|meja berita|redaksi|dokumentasi)$/i.test(c.name));

    const mergedCredits = [...parsedCredits];
    for (const ac of aiCredits) {
      if (!mergedCredits.some(c => c.role === ac.role && c.name.toLowerCase() === ac.name.toLowerCase())) {
        mergedCredits.push(ac);
      }
    }

    const plan: GeneratedCarouselPlan = {
      cover: {
        kicker: (aiOut.kicker || 'BERITA UTAMA').toUpperCase().slice(0, 26),
        title: clampText(aiOut.cover, 72),
        template: aiOut.coverTemplate,
        credits: mergedCredits.slice(0, 4),
      },
      slides: aiOut.contents.map(item =>
        ensureSlideFitsTemplate({
          title: cleanBreak(item.title),
          body: cleanBreak(item.body),
          template: item.template,
        }),
      ),
      penutup: {
        title: clampText(aiOut.outroTitle || 'Baca Selengkapnya', 42),
        body: clampText(aiOut.outro, 105),
        handle,
        template: aiOut.outroTemplate,
      },
    };

    return NextResponse.json({ plan, source: 'gemini' });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('=== AI GENERATION ERROR ===');
    console.error('Error message:', err?.message);
    console.error('=== END ERROR ===');

    let userMessage = err?.message || 'Unknown error';

    if (userMessage.includes('503') || userMessage.includes('high demand') || userMessage.includes('UNAVAILABLE')) {
      userMessage = 'Server AI Google sedang sibuk (overload). Silakan tunggu 30 detik lalu coba lagi.';
    } else if (userMessage.includes('401') || userMessage.includes('API key') || userMessage.includes('API_KEY_INVALID')) {
      userMessage = 'API Key tidak valid. Periksa kembali file .env.local Anda.';
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
