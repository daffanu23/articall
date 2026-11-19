export interface CustomPaletteColors {
  bg: string;     // latar halaman
  fg: string;     // teks utama
  sub: string;    // teks sekunder
  accent: string; // warna aksen
}

export interface Palette extends CustomPaletteColors {
  id: string;
  name: string;
  mode: 'dark' | 'light';
}

export const PALETTES: Palette[] = [
  { id: 'midnight', name: 'Midnight', mode: 'dark', bg: '#0d1117', fg: '#ffffff', sub: '#c9d1d9', accent: '#e63946' },
  { id: 'navy', name: 'Navy', mode: 'dark', bg: '#0b1b3a', fg: '#ffffff', sub: '#c3d0e8', accent: '#ffb703' },
  { id: 'forest', name: 'Forest', mode: 'dark', bg: '#0f2a1d', fg: '#ffffff', sub: '#c4dccd', accent: '#7bd88f' },
  { id: 'plum', name: 'Plum', mode: 'dark', bg: '#1d1030', fg: '#ffffff', sub: '#d9c8ee', accent: '#ff6fb5' },
  { id: 'crimson', name: 'Crimson', mode: 'dark', bg: '#22090c', fg: '#ffffff', sub: '#e2c6c9', accent: '#ff4d6d' },
  { id: 'paper', name: 'Paper', mode: 'light', bg: '#f5efe0', fg: '#1a1a1a', sub: '#3a3a3a', accent: '#c1121f' },
  { id: 'snow', name: 'Snow', mode: 'light', bg: '#ffffff', fg: '#111111', sub: '#444444', accent: '#2563eb' },
  { id: 'mint', name: 'Mint', mode: 'light', bg: '#e6f4ec', fg: '#12372a', sub: '#2f5a49', accent: '#0f9d58' },
  { id: 'sky', name: 'Sky', mode: 'light', bg: '#e3eefc', fg: '#0b2545', sub: '#35557a', accent: '#e76f00' },
  { id: 'sun', name: 'Sun', mode: 'light', bg: '#ffd60a', fg: '#111111', sub: '#222222', accent: '#c1121f' },
];

/** Warna teks (hitam/putih) yang terbaca di atas warna `hex`. */
export function onColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111111' : '#ffffff';
}

/** Hitung warna teks utama, sekunder, dan mode yang kontras dengan warna latar `bgHex`. */
export function autoTextForBg(bgHex: string): { fg: string; sub: string; mode: 'dark' | 'light' } {
  return onColor(bgHex) === '#111111'
    ? { fg: '#111111', sub: '#3a3a3a', mode: 'light' }
    : { fg: '#ffffff', sub: '#c9d1d9', mode: 'dark' };
}

export const getPalette = (id: string, custom?: CustomPaletteColors): Palette => {
  if (id === 'custom' && custom) {
    return { id: 'custom', name: 'Custom', mode: autoTextForBg(custom.bg).mode, ...custom };
  }
  return PALETTES.find(p => p.id === id) ?? PALETTES[0];
};

/** Warna gelap dari palet (dipakai sebagai "tinta" di atas latar terang/aksen). */
export const ink = (p: Palette) => (p.mode === 'dark' ? p.bg : (onColor(p.fg) === '#ffffff' ? p.fg : '#111111'));
