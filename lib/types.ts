import type { CustomPaletteColors } from './palettes';

export const W = 1080;
export const H = 1350;

export type PageType = 'cover' | 'isi' | 'penutup';
export type LogoPos = 'tl' | 'tr' | 'bl' | 'br';
export type FieldId = 'kicker' | 'title' | 'body' | 'credits' | 'handle' | 'qr';

export interface Credit { role: string; name: string }

export interface FontOption {
  id: string;
  label: string;
  family: string;
}

export const BUILTIN_FONTS: FontOption[] = [
  { id: 'inter', label: 'Inter (Modern Sans)', family: '"Inter", system-ui, sans-serif' },
  { id: 'jakarta', label: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", system-ui, sans-serif' },
  { id: 'poppins', label: 'Poppins', family: '"Poppins", system-ui, sans-serif' },
  { id: 'montserrat', label: 'Montserrat', family: '"Montserrat", system-ui, sans-serif' },
  { id: 'space-grotesk', label: 'Space Grotesk', family: '"Space Grotesk", system-ui, sans-serif' },
  { id: 'oswald', label: 'Oswald (Editorial)', family: '"Oswald", Impact, sans-serif' },
  { id: 'playfair', label: 'Playfair Display (Serif)', family: '"Playfair Display", Georgia, serif' },
  { id: 'merriweather', label: 'Merriweather (Serif)', family: '"Merriweather", Georgia, serif' },
  { id: 'lora', label: 'Lora (Serif)', family: '"Lora", Georgia, serif' },
  { id: 'georgia', label: 'Georgia (Klasik)', family: 'Georgia, "Times New Roman", serif' },
  { id: 'impact', label: 'Impact (Poster)', family: 'Impact, "Arial Black", sans-serif' },
  { id: 'monospace', label: 'Monospace', family: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
];

export interface SlideTypeFields {
  template: string;
  kicker: string;
  title: string;
  body: string;
  handle: string;
}

export interface Slide {
  id: string;
  type: PageType;
  template: string;
  byType: Record<PageType, SlideTypeFields>;
  kicker: string;
  title: string;
  body: string;
  credits: Credit[];
  handle: string;
  img: HTMLImageElement | null;
  qr: HTMLImageElement | null;
  zoom: number;
  px: number;
  py: number;
  grad: number;
  logoPos: LogoPos;
  palette: string;
  custom: CustomPaletteColors;
  pageFont: string;
  titleFont: string;
  bodyFont: string;
  metaFont: string;
}

export interface Brand {
  show: boolean;
  logo: HTMLImageElement | null;
}

export interface TemplateDef {
  id: string;
  label: string;
  image: boolean;   // template memakai foto
  grad: boolean;    // template memakai gradasi
  fields: FieldId[];
  titleLabel?: string;
  bodyLabel?: string;
}

export const PAGE_TYPES: { id: PageType; label: string }[] = [
  { id: 'cover', label: 'Cover' },
  { id: 'isi', label: 'Isi Berita' },
  { id: 'penutup', label: 'Penutup' },
];

export const PAGE_TYPE_BADGE: Record<PageType, string> = {
  cover: 'Cover',
  isi: 'Isi',
  penutup: 'Penutup',
};

export const CREDIT_ROLES = ['Penulis', 'Penyunting', 'Layouter', 'Editor', 'Foto', 'Reporter', 'Ilustrasi', 'Sumber'];

export const TEMPLATES: Record<PageType, TemplateDef[]> = {
  cover: [
    { id: 'foto-bawah', label: 'Foto Penuh · Judul Bawah', image: true, grad: true, fields: ['kicker', 'title', 'credits'] },
    { id: 'foto-tengah', label: 'Foto Penuh · Judul Tengah', image: true, grad: true, fields: ['kicker', 'title', 'credits'] },
    { id: 'blok-warna', label: 'Foto Atas · Blok Warna', image: true, grad: false, fields: ['kicker', 'title', 'credits'] },
    { id: 'bingkai', label: 'Foto Berbingkai', image: true, grad: false, fields: ['kicker', 'title', 'credits'] },
    { id: 'poster', label: 'Poster Judul Besar', image: true, grad: true, fields: ['kicker', 'title', 'credits'] },
  ],
  isi: [
    { id: 'foto-atas', label: 'Foto Atas + Teks', image: true, grad: true, fields: ['title', 'body'], titleLabel: 'Subjudul', bodyLabel: 'Isi berita' },
    { id: 'teks', label: 'Teks Saja', image: false, grad: false, fields: ['title', 'body'], titleLabel: 'Subjudul', bodyLabel: 'Isi berita' },
    { id: 'foto-bawah', label: 'Teks + Foto Bawah', image: true, grad: false, fields: ['title', 'body'], titleLabel: 'Subjudul', bodyLabel: 'Isi berita' },
    { id: 'panel', label: 'Foto Penuh + Panel Teks', image: true, grad: true, fields: ['title', 'body'], titleLabel: 'Subjudul', bodyLabel: 'Isi berita' },
    { id: 'kutipan', label: 'Kutipan', image: true, grad: true, fields: ['title', 'body'], titleLabel: 'Nama pemberi kutipan', bodyLabel: 'Kutipan' },
    { id: 'dua-kolom', label: 'Teks Dua Kolom', image: false, grad: false, fields: ['title', 'body'], titleLabel: 'Subjudul', bodyLabel: 'Isi berita' },
  ],
  penutup: [
    { id: 'qr-tengah', label: 'QR di Tengah', image: true, grad: true, fields: ['title', 'body', 'handle', 'qr'], titleLabel: 'Judul penutup', bodyLabel: 'Ajakan / keterangan' },
    { id: 'cta-foto', label: 'Foto + Ajakan', image: true, grad: true, fields: ['title', 'body', 'handle'], titleLabel: 'Judul penutup', bodyLabel: 'Ajakan / keterangan' },
    { id: 'minimal', label: 'Blok Warna Minimal', image: false, grad: false, fields: ['title', 'body', 'handle', 'qr'], titleLabel: 'Judul penutup', bodyLabel: 'Ajakan / keterangan' },
    { id: 'banner', label: 'Teks + Banner QR', image: false, grad: false, fields: ['title', 'body', 'handle', 'qr'], titleLabel: 'Judul penutup', bodyLabel: 'Ajakan / keterangan' },
  ],
};

export const getTemplate = (type: PageType, id: string): TemplateDef =>
  TEMPLATES[type].find(t => t.id === id) ?? TEMPLATES[type][0];

export const DEFAULT_SLIDE_TEXT: Record<PageType, { kicker: string; title: string; body: string; handle: string }> = {
  cover: {
    kicker: 'BERITA UTAMA',
    title: 'Judul Berita Anda Muncul di Sini dan Otomatis Tertata Rapi',
    body: 'Tempel paragraf berita di sini. Ukuran huruf tetap sama di setiap halaman supaya tampilan konsisten. Jika teks terlalu panjang, pecah ke halaman berikutnya.',
    handle: '@akunmedia',
  },
  isi: {
    kicker: 'BERITA UTAMA',
    title: 'Subjudul Isi Berita',
    body: 'Tempel paragraf berita di sini. Ukuran huruf tetap sama di setiap halaman supaya tampilan konsisten. Jika teks terlalu panjang, pecah ke halaman berikutnya.',
    handle: '@akunmedia',
  },
  penutup: {
    kicker: 'BERITA UTAMA',
    title: 'Baca Selengkapnya',
    body: 'Kunjungi situs kami atau pindai kode QR.',
    handle: '@akunmedia',
  },
};

let n = 0;
export const newSlide = (type: PageType = 'isi', over: Partial<Slide> = {}): Slide => {
  const tpl = over.template ?? TEMPLATES[type][0].id;
  const def = DEFAULT_SLIDE_TEXT[type];
  const defFont = BUILTIN_FONTS[0].family;
  const byType: Record<PageType, SlideTypeFields> = {
    cover: { template: TEMPLATES.cover[0].id, ...DEFAULT_SLIDE_TEXT.cover },
    isi: { template: TEMPLATES.isi[0].id, ...DEFAULT_SLIDE_TEXT.isi },
    penutup: { template: TEMPLATES.penutup[0].id, ...DEFAULT_SLIDE_TEXT.penutup },
    ...over.byType,
  };
  byType[type] = {
    template: tpl,
    kicker: over.kicker ?? byType[type].kicker,
    title: over.title ?? byType[type].title,
    body: over.body ?? byType[type].body,
    handle: over.handle ?? byType[type].handle,
  };
  return {
    id: `s${Date.now()}_${n++}`,
    type,
    template: tpl,
    byType,
    kicker: def.kicker,
    title: def.title,
    body: def.body,
    handle: def.handle,
    credits: type === 'cover' ? [{ role: 'Penulis', name: 'Nama Penulis' }, { role: 'Foto', name: 'Nama Fotografer' }] : [],
    img: null, qr: null, zoom: 1, px: 0, py: 0, grad: 70, logoPos: 'tl',
    palette: 'midnight',
    custom: { bg: '#0d1117', fg: '#ffffff', sub: '#c9d1d9', accent: '#e63946' },
    pageFont: defFont,
    titleFont: defFont,
    bodyFont: defFont,
    metaFont: defFont,
    ...over,
  };
};
