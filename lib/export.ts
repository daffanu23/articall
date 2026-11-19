import JSZip from 'jszip';
import { Brand, H, Slide, W } from './types';
import { renderSlide } from './render';

export type Fmt = 'jpeg' | 'png';

function toBlob(s: Slide, brand: Brand, fmt: Fmt): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  renderSlide(c.getContext('2d')!, s, brand);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('export gagal'))), `image/${fmt}`, 0.95));
}
const name = (i: number, fmt: Fmt) => `articall-${String(i + 1).padStart(2, '0')}.${fmt === 'png' ? 'png' : 'jpg'}`;

function save(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function downloadOne(s: Slide, i: number, brand: Brand, fmt: Fmt) {
  save(await toBlob(s, brand, fmt), name(i, fmt));
}
export async function downloadAll(slides: Slide[], brand: Brand, fmt: Fmt) {
  const zip = new JSZip();
  for (let i = 0; i < slides.length; i++) zip.file(name(i, fmt), await toBlob(slides[i], brand, fmt));
  save(await zip.generateAsync({ type: 'blob' }), 'articall-carousel.zip');
}
