import {
  BUILTIN_FONTS,
  Credit,
  DEFAULT_SLIDE_TEXT,
  Slide,
  TEMPLATES,
  newSlide,
} from './types';

export type AiMode = 'verbatim' | 'ai';
export type VerbatimLayoutStyle = 'varied' | 'text-focused';
export type SlideCountMode = 'auto' | '2' | '3' | '4' | '5' | '6';
export type WordCountMode = 'singkat' | 'sedang' | 'panjang';

export interface GeneratedCarouselPlan {
  cover: {
    kicker: string;
    title: string;
    template?: string;
    credits?: Credit[];
  };
  slides: {
    title: string;
    body: string;
    template?: string;
  }[];
  penutup: {
    title: string;
    body: string;
    handle?: string;
    template?: string;
  };
}

export const SAMPLE_NEWS_ARTICLE = `TransJakarta Resmi Terapkan Tarif Integrasi Baru di 13 Koridor Mulai Pekan Depan

Pemerintah Provinsi DKI Jakarta bersama PT Transportasi Jakarta resmi memberlakukan skema tarif terintegrasi untuk seluruh rute utama mulai Senin mendatang. Kebijakan ini ditujukan untuk menekan biaya mobilitas harian pekerja komuter dan mahasiswa yang berganti moda transportasi lebih dari dua kali dalam satu perjalanan.

Dalam skema terbaru, penumpang yang berpindah antar-koridor BRT, layanan non-BRT, maupun angkutan pengumpan dalam kurun waktu maksimal tiga jam hanya akan dikenakan tarif maksimal Rp5.000 per perjalanan menggunakan kartu uang elektronik atau aplikasi resmi.

"Kami ingin memastikan transportasi publik bukan hanya nyaman dan tepat waktu, tetapi juga semakin terjangkau bagi warga Jabodetabek yang setiap hari beraktivitas di pusat kota," ujar Direktur Utama TransJakarta dalam konferensi pers di Balai Kota, Kamis pagi.

Selain penyesuaian tarif, TransJakarta turut menambah 120 armada bus listrik pada jam sibuk pagi dan sore hari guna mengurangi waktu tunggu penumpang di halte transit utama seperti Dukuh Atas, Harmoni, dan CSW.

Dinas Perhubungan mengimbau masyarakat untuk memperbarui saldo kartu elektronik serta memeriksa peta rute terbaru melalui kanal resmi sebelum memulai perjalanan pada hari pertama penerapan aturan.

Penulis : Agitha Clariza Aulia
Penyunting : Najma Awalia Rizkia
Layouter : Nadya Kirana Wibisofia`;

const CAPACITY: Record<string, number> = {
  teks: 400,
  'dua-kolom': 520,
  'foto-atas': 250,
  'foto-bawah': 195,
  panel: 260,
};

export function normalizeCreditRole(rawRole: string): string {
  const r = rawRole.trim().toLowerCase();
  if (/^(penulis|naskah|writer|jurnalis)$/.test(r)) return 'Penulis';
  if (r === 'penyunting') return 'Penyunting';
  if (r === 'editor') return 'Editor';
  if (/^(layouter|layout|tata\s*letak|desainer|design)$/.test(r)) return 'Layouter';
  if (/^(foto|fotografer|photo|dokumentasi|dok)$/.test(r)) return 'Foto';
  if (/^(reporter|pewarta)$/.test(r)) return 'Reporter';
  if (/^(ilustrasi|ilustrator)$/.test(r)) return 'Ilustrasi';
  if (/^(sumber|narasumber)$/.test(r)) return 'Sumber';
  return 'Penulis';
}

/**
 * Mengekstrak baris kredit (Penulis, Penyunting, Layouter, Editor, Foto, Reporter, Sumber)
 * dari naskah berita agar otomatis masuk ke kolom kredit Cover dan tidak ikut masuk ke isi slide.
 */
export function extractArticleCredits(rawText: string): { cleanText: string; credits: Credit[] } {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const credits: Credit[] = [];
  const kept: string[] = [];

  for (const line of lines) {
    const m = line.trim().match(
      /^(Penulis|Penyunting|Editor|Layouter|Tata\s*Letak|Foto|Fotografer|Reporter|Ilustrasi|Ilustrator|Sumber|Naskah)\s*[:\-–]\s*(.+)$/i,
    );
    if (m) {
      const role = normalizeCreditRole(m[1]);
      const name = m[2].trim();
      if (name && !credits.some(c => c.role === role && c.name === name)) {
        credits.push({ role, name });
      }
    } else {
      kept.push(line);
    }
  }

  return {
    cleanText: kept.join('\n').trim(),
    credits: credits.slice(0, 4),
  };
}

/**
 * Menjaga agar teks slide selalu muat dengan kapasitas fisik kanvas pada template yang dipilih.
 * Jika teks lebih panjang dari batas aman template berfoto, otomatis ditingkatkan ke template teks/dua-kolom.
 */
export function ensureSlideFitsTemplate(slide: {
  title: string;
  body: string;
  template?: string;
}): { title: string; body: string; template: string } {
  let title = slide.title.trim();
  let body = slide.body.trim();
  let template = TEMPLATES.isi.some(t => t.id === slide.template) ? slide.template! : 'foto-atas';

  if (title.length > 72) {
    const cut = title.slice(0, 70);
    const sp = cut.lastIndexOf(' ');
    title = `${(sp > 30 ? cut.slice(0, sp) : cut).trimEnd()}…`;
  }

  if (template === 'kutipan') {
    body = body.replace(/^[“"']+|[”"']+$/g, '').trim();
    if (body.length <= 210) {
      return { title, body, template: 'kutipan' };
    }
    // Kutipan terlalu panjang untuk huruf serif besar -> alihkan ke panel/teks agar tidak terpotong
    template = body.length <= 340 ? 'panel' : 'teks';
  }

  if (body.length > 480) {
    template = 'dua-kolom';
    if (body.length > 780) {
      const cut = body.slice(0, 775);
      const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(' '));
      body = `${(end > 500 ? cut.slice(0, end + 1) : cut).trimEnd()}`;
    }
  } else if (body.length > 340) {
    if (template !== 'dua-kolom') template = 'teks';
  } else if (body.length > 270) {
    if (template === 'foto-atas' || template === 'foto-bawah') template = 'panel';
  } else if (body.length > 200) {
    if (template === 'foto-bawah') template = 'foto-atas';
  }

  return { title, body, template };
}

function splitLongPiece(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const out: string[] = [];
  let buf = '';

  const pushWordSplit = (s: string) => {
    let line = '';
    for (const w of s.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${w}` : w;
      if (next.length > maxChars && line) {
        out.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  };

  for (const sent of sentences) {
    if (sent.length > maxChars) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      pushWordSplit(sent);
      continue;
    }
    const candidate = buf ? `${buf} ${sent}` : sent;
    if (candidate.length > maxChars && buf) {
      out.push(buf);
      buf = sent;
    } else {
      buf = candidate;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Mode 1: Teks Asli (Tanpa Intervensi AI).
 * Mempertahankan kata demi kata dari artikel pengguna tanpa merangkum atau mengubah kalimat,
 * mengekstrak kredit (Penulis/Penyunting/Layouter) ke Cover, dan memecah teks agar muat tanpa terpotong.
 */
export function buildVerbatimPlan(
  rawText: string,
  style: VerbatimLayoutStyle = 'varied',
  handle = '@akunmedia',
): GeneratedCarouselPlan {
  const { cleanText, credits } = extractArticleCredits(rawText);
  const paragraphs = cleanText
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return {
      cover: { kicker: 'BERITA UTAMA', title: DEFAULT_SLIDE_TEXT.cover.title, template: 'foto-bawah', credits },
      slides: [{ title: '', body: DEFAULT_SLIDE_TEXT.isi.body, template: 'teks' }],
      penutup: { title: DEFAULT_SLIDE_TEXT.penutup.title, body: DEFAULT_SLIDE_TEXT.penutup.body, handle, template: 'qr-tengah' },
    };
  }

  let kicker = 'BERITA';
  const dateline = paragraphs[0].match(/^([A-Z]{3,}(?:\s+[A-Z]{2,})?)\s*[–—-]\s+/);
  if (dateline) kicker = dateline[1];

  let coverTitle = '';
  let bodyParagraphs: string[];

  if (paragraphs.length > 1 && paragraphs[0].length <= 130) {
    coverTitle = paragraphs[0];
    bodyParagraphs = paragraphs.slice(1);
  } else {
    const firstSent = paragraphs[0].split(/(?<=[.!?])\s+/)[0] ?? paragraphs[0];
    coverTitle = firstSent.length > 82 ? `${firstSent.slice(0, 79).trimEnd()}…` : firstSent;
    bodyParagraphs = paragraphs;
  }

  const seq = style === 'text-focused'
    ? ['teks', 'dua-kolom']
    : ['foto-atas', 'teks', 'panel', 'dua-kolom', 'foto-bawah'];

  const slides: { title: string; body: string; template: string }[] = [];
  let pendingHeading = '';
  let curTpl = seq[0];
  let curBody = '';

  const flushSlide = (titleOverride?: string) => {
    if (!curBody.trim()) return;
    slides.push(
      ensureSlideFitsTemplate({
        title: titleOverride ?? pendingHeading,
        body: curBody.trim(),
        template: curTpl,
      }),
    );
    pendingHeading = '';
    curBody = '';
    curTpl = seq[slides.length % seq.length];
  };

  for (let i = 0; i < bodyParagraphs.length; i++) {
    const p = bodyParagraphs[i];
    const isShortHeading = p.length < 55 && !/[.!?]$/.test(p) && i < bodyParagraphs.length - 1;
    if (isShortHeading) {
      flushSlide();
      pendingHeading = p;
      continue;
    }

    const limit = Math.max(150, (CAPACITY[curTpl] ?? 260) - (pendingHeading ? 55 : 0));
    if (p.length <= limit) {
      const joined = curBody ? `${curBody}\n\n${p}` : p;
      if (joined.length <= limit) {
        curBody = joined;
      } else {
        flushSlide();
        curBody = p;
      }
    } else {
      flushSlide();
      const firstLimit = Math.max(150, (CAPACITY[curTpl] ?? 260) - (pendingHeading ? 55 : 0));
      const parts = splitLongPiece(p, firstLimit);
      parts.forEach((part, idx) => {
        if (idx === 0) {
          curBody = part;
        } else {
          flushSlide();
          curBody = part;
        }
      });
    }
  }
  flushSlide();

  if (slides.length === 0) {
    slides.push(ensureSlideFitsTemplate({ title: '', body: paragraphs.join('\n\n'), template: seq[0] }));
  }

  return {
    cover: {
      kicker,
      title: coverTitle,
      template: style === 'text-focused' ? 'poster' : 'foto-bawah',
      credits,
    },
    slides,
    penutup: {
      title: 'Baca Selengkapnya',
      body: 'Simpan dan bagikan informasi ini. Ikuti terus pembaruan berita terbaru kami.',
      handle,
      template: 'qr-tengah',
    },
  };
}

/**
 * Simulasi lokal (cadangan offline untuk Mode 2 bila API Key belum diisi).
 * Memisahkan kutipan langsung dari mention biasa dan menyesuaikan panjang teks dengan template.
 */
export function buildLocalAiPlan(
  rawText: string,
  instruction = '',
  handle = '@akunmedia',
  slideCount: SlideCountMode = 'auto',
  wordCount: WordCountMode = 'sedang',
): GeneratedCarouselPlan {
  const { cleanText, credits } = extractArticleCredits(rawText);
  const paragraphs = cleanText
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return buildVerbatimPlan(rawText, 'varied', handle);
  }

  let kicker = 'BERITA UTAMA';
  const dateline = paragraphs[0].match(/^([A-Z]{3,}(?:\s+[A-Z]{2,})?)\s*[–—-]\s+/);
  if (dateline) kicker = dateline[1];

  const firstPara = paragraphs[0];
  let coverTitle = firstPara;
  let rest = paragraphs.slice(1);
  if (firstPara.length > 75 || rest.length === 0) {
    const firstSent = firstPara.split(/(?<=[.!?])\s+/)[0] ?? firstPara;
    const stripped = firstSent.replace(/^[A-Z]{3,}(?:\s+[A-Z]{2,})?\s*[–—-]\s+/, '');
    coverTitle = stripped.length > 68 ? `${stripped.slice(0, 65).trimEnd()}…` : stripped;
    if (rest.length === 0) rest = [firstPara];
  }

  const slideMatch = instruction.match(/(\d+)\s*(slide|halaman)/i);
  const maxBodySlides = slideCount !== 'auto'
    ? Math.max(2, Math.min(6, parseInt(slideCount, 10)))
    : (slideMatch ? Math.min(6, Math.max(2, parseInt(slideMatch[1], 10))) : 4);
  const maxChar = wordCount === 'singkat' ? 185 : wordCount === 'panjang' ? 400 : 265;

  const quotes: { quote: string; speaker: string }[] = [];
  const normalParas: string[] = [];

  for (const p of rest) {
    // Hanya anggap sebagai QUOTE bila kalimat langsung dalam tanda petik diikuti verba ujaran
    const qm = p.match(/[“"]([^”"]{30,210})[”"]\s*(?:,?\s*(?:ujar|kata|tutur|ungkap|ucap|jelas|sebut)\s+([^,.!\n]+))?/i);
    const hasSpeechVerb = qm && /(?:ujar|kata|tutur|ungkap|ucap|jelas|sebut)/i.test(p.slice((qm.index ?? 0) + qm[0].length - (qm[2]?.length ?? 0) - 10));
    if (qm && (qm[2] || hasSpeechVerb) && quotes.length < 2) {
      quotes.push({
        quote: qm[1].trim(),
        speaker: qm[2] ? qm[2].trim() : 'Narasumber',
      });
    } else {
      normalParas.push(p);
    }
  }

  const subLabels = ['Ringkasan Utama', 'Detail Peristiwa', 'Fakta Lapangan', 'Respons & Konteks', 'Harapan Ke Depan'];
  const templates = wordCount === 'panjang'
    ? ['teks', 'dua-kolom']
    : ['foto-atas', 'panel', 'teks', 'dua-kolom'];
  const slides: { title: string; body: string; template: string }[] = [];

  const summarize = (text: string, limit = maxChar) => {
    const sents = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    let out = '';
    for (const st of sents) {
      const cand = out ? `${out} ${st}` : st;
      if (cand.length > limit) break;
      out = cand;
    }
    if (!out) out = text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
    return out;
  };

  normalParas.forEach((p, idx) => {
    if (slides.length >= maxBodySlides) return;
    const words = p.split(/\s+/).slice(0, 5).join(' ').replace(/[.,;:!?]+$/, '');
    const title = idx === 0 ? 'Inti Berita' : (words.length >= 12 && words.length <= 44 ? words : subLabels[idx % subLabels.length]);
    slides.push(
      ensureSlideFitsTemplate({
        title,
        body: summarize(p, maxChar),
        template: templates[idx % templates.length],
      }),
    );
  });

  if (quotes.length > 0 && slides.length < maxBodySlides + 1) {
    const insertAt = Math.min(slides.length, 2);
    slides.splice(
      insertAt,
      0,
      ensureSlideFitsTemplate({
        title: quotes[0].speaker,
        body: quotes[0].quote,
        template: 'kutipan',
      }),
    );
  }

  if (slides.length === 0) {
    slides.push(ensureSlideFitsTemplate({ title: 'Inti Berita', body: summarize(paragraphs.join(' '), maxChar), template: 'foto-atas' }));
  }

  const trimmedSlides = slides.slice(0, Math.max(2, maxBodySlides));

  return {
    cover: {
      kicker,
      title: coverTitle,
      template: 'foto-bawah',
      credits,
    },
    slides: trimmedSlides,
    penutup: {
      title: 'Bagaimana Pendapat Anda?',
      body: 'Bagikan informasi ini dan tulis tanggapan Anda di kolom komentar.',
      handle,
      template: 'cta-foto',
    },
  };
}

const validTpl = (type: 'cover' | 'isi' | 'penutup', id?: string) => {
  const list = TEMPLATES[type];
  return list.some(t => t.id === id) ? id! : list[0].id;
};

/**
 * Mengonversi hasil rencana AI / Mode 1 menjadi array Slide lengkap yang mewarisi gaya halaman aktif.
 */
export function planToSlides(plan: GeneratedCarouselPlan, baseSlide?: Slide): Slide[] {
  const defFont = BUILTIN_FONTS[0].family;
  const styleBase: Partial<Slide> = baseSlide
    ? {
        palette: baseSlide.palette,
        custom: { ...baseSlide.custom },
        logoPos: baseSlide.logoPos,
        pageFont: baseSlide.pageFont,
        titleFont: baseSlide.titleFont,
        bodyFont: baseSlide.bodyFont,
        metaFont: baseSlide.metaFont,
      }
    : {
        palette: 'midnight',
        custom: { bg: '#0d1117', fg: '#ffffff', sub: '#c9d1d9', accent: '#e63946' },
        logoPos: 'tl',
        pageFont: defFont,
        titleFont: defFont,
        bodyFont: defFont,
        metaFont: defFont,
      };

  const cover = newSlide('cover', {
    ...styleBase,
    template: validTpl('cover', plan.cover.template),
    kicker: plan.cover.kicker || 'BERITA UTAMA',
    title: plan.cover.title || DEFAULT_SLIDE_TEXT.cover.title,
    credits: plan.cover.credits ? plan.cover.credits.slice(0, 4) : [],
  });

  const bodySlides = plan.slides.map(sl =>
    newSlide('isi', {
      ...styleBase,
      template: validTpl('isi', sl.template),
      title: sl.title ?? '',
      body: sl.body ?? '',
    }),
  );

  const penutup = newSlide('penutup', {
    ...styleBase,
    template: validTpl('penutup', plan.penutup.template),
    title: plan.penutup.title || DEFAULT_SLIDE_TEXT.penutup.title,
    body: plan.penutup.body || DEFAULT_SLIDE_TEXT.penutup.body,
    handle: plan.penutup.handle || '@akunmedia',
  });

  return [cover, ...bodySlides, penutup];
}
