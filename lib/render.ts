import { Brand, H, Slide, W } from './types';
import { Palette, getPalette, ink, onColor } from './palettes';

const SANS = 'system-ui,"Segoe UI",Arial,sans-serif';
const SERIF = "Georgia,'Times New Roman',serif";
const PAD = 72;
const TW = W - PAD * 2;
const LOGO_MAX_H = 110, LOGO_MAX_W = 260, LOGO_M = 56, LOGO_GAP = 36;
const font = (weight: number | string, size: number, fam = SANS) => `${weight} ${size}px ${fam}`;

type C = CanvasRenderingContext2D;
interface Blk { lines: string[]; lh: number; font: string; h: number }
interface R { c: C; s: Slide; P: Palette; b: Brand; over: boolean }

const fTitle = (r: R, weight: number | string, size: number) => `${weight} ${size}px ${r.s.titleFont}`;
const fBody = (r: R, weight: number | string, size: number) => `${weight} ${size}px ${r.s.bodyFont}`;
const fMeta = (r: R, weight: number | string, size: number) => `${weight} ${size}px ${r.s.metaFont}`;
const overlayFg = (r: R, fallback: string) => (r.s.palette === 'custom' ? r.P.fg : fallback);
const overlaySub = (r: R, fallback: string) => (r.s.palette === 'custom' ? r.P.sub : fallback);

/* ---------------- primitif ---------------- */
function wrap(c: C, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + word : word;
      if (c.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}
/** Teks dengan ukuran huruf TETAP. Jika melebihi maxLines dipotong dengan "…" dan ditandai overflow. */
function block(r: R, text: string, f: string, size: number, lhk: number, maxW: number, maxLines: number): Blk {
  const c = r.c; c.font = f;
  let lines = text.trim() ? wrap(c, text.trim(), maxW) : [];
  if (lines.length > maxLines) {
    r.over = true;
    lines = lines.slice(0, Math.max(1, maxLines));
    let l = lines[lines.length - 1];
    while (l.length > 1 && c.measureText(l + '…').width > maxW) l = l.slice(0, -1);
    lines[lines.length - 1] = l.trimEnd() + '…';
  }
  const lh = size * lhk;
  return { lines, lh, font: f, h: lines.length * lh };
}
function draw(r: R, b: Blk, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
  const c = r.c;
  c.font = b.font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'top';
  b.lines.forEach((l, i) => c.fillText(l, x, y + i * b.lh));
}
const fits = (avail: number, lh: number) => Math.max(1, Math.floor(avail / lh));

function drawCover(c: C, im: HTMLImageElement, x: number, y: number, w: number, h: number, zoom: number, px: number, py: number) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const k = Math.max(w / im.width, h / im.height) * zoom;
  const dw = im.width * k, dh = im.height * k;
  const ox = (dw - w) / 2, oy = (dh - h) / 2;
  c.drawImage(im, x - ox - (px / 100) * ox, y - oy - (py / 100) * oy, dw, dh);
  c.restore();
}
function photo(r: R, x: number, y: number, w: number, h: number) {
  const { c, s } = r;
  if (s.img) { drawCover(c, s.img, x, y, w, h, s.zoom, s.px, s.py); return; }
  c.fillStyle = '#2b313b'; c.fillRect(x, y, w, h);
  c.fillStyle = '#6c7684'; c.font = font(600, 30); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('Unggah foto', x + w / 2, y + h / 2); c.textBaseline = 'alphabetic';
}
function gradient(c: C, y0: number, y1: number, alpha: number) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${alpha})`);
  c.fillStyle = g; c.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
}
function shade(c: C, alpha: number) { c.fillStyle = `rgba(0,0,0,${alpha})`; c.fillRect(0, 0, W, H); }

/** Pill label. align 'center' → x adalah titik tengah. */
function pill(r: R, text: string, x: number, y: number, bg: string, fg: string, align: 'left' | 'center' = 'left') {
  const c = r.c; c.font = fMeta(r, 700, 28);
  const w = c.measureText(text).width + 44;
  const px = align === 'center' ? x - w / 2 : x;
  c.fillStyle = bg; c.fillRect(px, y, w, 52);
  c.fillStyle = fg; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(text, px + 22, y + 27); c.textBaseline = 'alphabetic';
}

/* ---------------- tabel kredit ---------------- */
const creditRows = (s: Slide) => s.credits.filter(r => r.name.trim()).slice(0, 4);
const ROW_H = 44;
const creditsH = (s: Slide) => creditRows(s).length * ROW_H;
function drawCredits(r: R, x: number, y: number, roleCol: string, nameCol: string, align: 'left' | 'center' = 'left') {
  const c = r.c;
  creditRows(r.s).forEach((row, i) => {
    const yy = y + i * ROW_H;
    c.textBaseline = 'top';
    if (align === 'left') {
      c.textAlign = 'left';
      c.font = fMeta(r, 700, 22); c.fillStyle = roleCol; c.fillText(row.role.toUpperCase(), x, yy + 4);
      c.font = fMeta(r, 500, 28); c.fillStyle = nameCol; c.fillText(row.name, x + 190, yy);
    } else {
      c.textAlign = 'center'; c.font = fMeta(r, 500, 26); c.fillStyle = nameCol;
      c.fillText(`${row.role.toUpperCase()}  ·  ${row.name}`, x, yy);
    }
  });
}

/* ---------------- logo ---------------- */
function logoSize(b: Brand) {
  if (!b.show || !b.logo) return null;
  const k = Math.min(LOGO_MAX_W / b.logo.width, LOGO_MAX_H / b.logo.height);
  return { w: b.logo.width * k, h: b.logo.height * k };
}
/** Atas: menempel di sudut atas. Bawah: berada tepat DI ATAS blok judul (blockTop). */
function drawLogo(r: R, blockTop: number) {
  const d = logoSize(r.b); if (!d) return;
  const x = r.s.logoPos.endsWith('l') ? LOGO_M : W - LOGO_M - d.w;
  const y = r.s.logoPos.startsWith('t') ? LOGO_M : Math.max(24, blockTop - LOGO_GAP - d.h);
  r.c.drawImage(r.b.logo!, x, y, d.w, d.h);
}
/** Batas atas konten untuk layout yang teksnya mulai dari atas (menyisakan ruang logo). */
const contentTop = (r: R) => (logoSize(r.b) ? 56 + LOGO_MAX_H + LOGO_GAP + 8 : 96);

/* ---------------- COVER ---------------- */
function coverFotoBawah(r: R) {
  const { c, s, P } = r, a = s.grad / 100;
  photo(r, 0, 0, W, H); gradient(c, H * 0.3, H, a);
  const t = block(r, s.title, fTitle(r, 800, 84), 84, 1.12, TW, 5);
  const kH = s.kicker.trim() ? 52 + 26 : 0, cr = creditsH(s);
  const total = kH + t.h + (cr ? 45 + cr : 0);
  let y = H - PAD - total; const top = y;
  if (kH) { pill(r, s.kicker.toUpperCase(), PAD, y, P.accent, onColor(P.accent)); y += kH; }
  draw(r, t, PAD, y, overlayFg(r, '#fff')); y += t.h;
  if (cr) { y += 18; c.fillStyle = P.accent; c.fillRect(PAD, y, 80, 5); y += 27; drawCredits(r, PAD, y, P.accent, overlaySub(r, '#e5e7eb')); }
  drawLogo(r, top);
}
function coverFotoTengah(r: R) {
  const { c, s, P } = r, a = s.grad / 100, cx = W / 2;
  photo(r, 0, 0, W, H); shade(c, 0.2 + a * 0.6);
  const t = block(r, s.title, fTitle(r, 800, 92), 92, 1.1, TW, 6);
  const kH = s.kicker.trim() ? 52 + 30 : 0, cr = creditsH(s);
  const total = kH + t.h + (cr ? 60 + cr : 0);
  let y = (H - total) / 2 + 20; const top = y;
  if (kH) { pill(r, s.kicker.toUpperCase(), cx, y, P.accent, onColor(P.accent), 'center'); y += kH; }
  draw(r, t, cx, y, overlayFg(r, '#fff'), 'center'); y += t.h;
  if (cr) { y += 28; c.fillStyle = P.accent; c.fillRect(cx - 40, y, 80, 5); y += 27; drawCredits(r, cx, y, P.accent, overlaySub(r, '#e5e7eb'), 'center'); }
  drawLogo(r, top);
}
function coverBlokWarna(r: R) {
  const { c, s, P } = r, py = 780, onA = onColor(P.accent);
  photo(r, 0, 0, W, py);
  c.fillStyle = P.accent; c.fillRect(0, py, W, H - py);
  let y = py + 56; const top = y;
  if (s.kicker.trim()) { c.font = fMeta(r, 700, 26); c.fillStyle = overlayFg(r, onA); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(s.kicker.toUpperCase(), PAD, y); y += 26 + 18; }
  const t = block(r, s.title, fTitle(r, 800, 70), 70, 1.1, TW, 4);
  draw(r, t, PAD, y, overlayFg(r, onA));
  drawCredits(r, PAD, H - 56 - creditsH(s), overlaySub(r, onA), overlaySub(r, onA));
  drawLogo(r, top);
}
function coverBingkai(r: R) {
  const { c, s, P } = r;
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  c.fillStyle = P.accent; c.fillRect(PAD + 18, PAD + 18, W - PAD * 2, 760);
  photo(r, PAD, PAD, W - PAD * 2, 760);
  let y = 880; const top = y;
  if (s.kicker.trim()) { c.font = fMeta(r, 700, 26); c.fillStyle = P.accent; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(s.kicker.toUpperCase(), PAD, y); y += 26 + 16; }
  const t = block(r, s.title, fTitle(r, 700, 68), 68, 1.12, TW, 3);
  draw(r, t, PAD, y, P.fg);
  drawCredits(r, PAD, H - 60 - creditsH(s), P.accent, P.sub);
  drawLogo(r, top);
}
function coverPoster(r: R) {
  const { c, s, P } = r, a = s.grad / 100, onA = onColor(P.accent);
  c.fillStyle = P.accent; c.fillRect(0, 0, W, H);
  photo(r, 0, 840, W, 510); gradient(c, H - 320, H, a);
  let y = 200; const top = y;
  if (s.kicker.trim()) { pill(r, s.kicker.toUpperCase(), PAD, y, ink(P), '#fff'); y += 52 + 24; }
  const t = block(r, s.title, fTitle(r, 900, 100), 100, 1.05, TW, 5);
  draw(r, t, PAD, y, overlayFg(r, onA));
  drawCredits(r, PAD, H - 56 - creditsH(s), overlaySub(r, '#ffffff'), overlaySub(r, '#ffffff'));
  drawLogo(r, top);
}

/* ---------------- ISI BERITA ---------------- */
function isiFotoAtas(r: R) {
  const { c, s, P } = r, a = s.grad / 100, ph = 640;
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  photo(r, 0, 0, W, ph); gradient(c, ph - 260, ph, a);
  c.fillStyle = P.accent; c.fillRect(PAD, ph + 36, 120, 8);
  const ty = ph + 72;
  const t = block(r, s.title, fTitle(r, 800, 54), 54, 1.15, TW, 3);
  draw(r, t, PAD, ty, P.fg);
  const by = ty + t.h + (t.h ? 28 : 0);
  const b = block(r, s.body, fBody(r, 400, 36), 36, 1.5, TW, fits(H - PAD - by, 54));
  draw(r, b, PAD, by, P.sub);
  drawLogo(r, ph + 36);
}
function isiTeks(r: R) {
  const { c, s, P } = r, top = contentTop(r);
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  c.fillStyle = P.accent; c.fillRect(PAD, top, 120, 8);
  let y = top + 40;
  const t = block(r, s.title, fTitle(r, 800, 64), 64, 1.12, TW, 4);
  draw(r, t, PAD, y, P.fg); y += t.h + (t.h ? 36 : 0);
  const b = block(r, s.body, fBody(r, 400, 40), 40, 1.5, TW, fits(H - PAD - y, 60));
  draw(r, b, PAD, y, P.sub);
  drawLogo(r, top);
}
function isiFotoBawah(r: R) {
  const { c, s, P } = r, top = contentTop(r), py = 800;
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  photo(r, 0, py, W, H - py);
  c.fillStyle = P.accent; c.fillRect(PAD, top, 120, 8);
  let y = top + 40;
  const t = block(r, s.title, fTitle(r, 800, 56), 56, 1.12, TW, 3);
  draw(r, t, PAD, y, P.fg); y += t.h + (t.h ? 28 : 0);
  const b = block(r, s.body, fBody(r, 400, 36), 36, 1.5, TW, fits(py - 40 - y, 54));
  draw(r, b, PAD, y, P.sub);
  drawLogo(r, top);
}
function isiPanel(r: R) {
  const { c, s, P } = r, a = s.grad / 100, iw = W - 112 - 96;
  photo(r, 0, 0, W, H); shade(c, a * 0.35);
  const t = block(r, s.title, fTitle(r, 800, 50), 50, 1.15, iw, 3);
  const b = block(r, s.body, fBody(r, 400, 34), 34, 1.5, iw, 9);
  const gap = t.h && b.h ? 24 : 0;
  const cardH = 12 + 44 + t.h + gap + b.h + 48;
  const cy = H - 56 - cardH;
  c.fillStyle = P.bg; c.fillRect(56, cy, W - 112, cardH);
  c.fillStyle = P.accent; c.fillRect(56, cy, W - 112, 12);
  draw(r, t, 56 + 48, cy + 12 + 44, P.fg);
  draw(r, b, 56 + 48, cy + 12 + 44 + t.h + gap, P.sub);
  drawLogo(r, cy);
}
function isiKutipan(r: R) {
  const { c, s, P } = r, a = s.grad / 100, top = contentTop(r);
  const hasImg = !!s.img;
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  if (hasImg) { photo(r, 0, 0, W, H); shade(c, 0.35 + a * 0.5); }
  const fg = hasImg ? overlayFg(r, '#ffffff') : P.fg;
  const sub = hasImg ? overlaySub(r, '#d6dbe3') : P.sub;
  c.fillStyle = P.accent; c.font = font(900, 300, SERIF); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText('“', PAD - 8, top + 210);
  const q = block(r, s.body, fBody(r, 'italic 600', 56), 56, 1.35, TW, 10);
  let y = top + 250;
  draw(r, q, PAD, y, fg); y += q.h + 30;
  c.fillStyle = P.accent; c.fillRect(PAD, y, 90, 6); y += 34;
  const who = block(r, s.title, fTitle(r, 800, 38), 38, 1.2, TW, 2);
  draw(r, who, PAD, y, sub);
  drawLogo(r, top);
}
function isiDuaKolom(r: R) {
  const { c, s, P } = r, top = contentTop(r), gap = 48, colW = (TW - gap) / 2;
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  c.fillStyle = P.accent; c.fillRect(PAD, top, 120, 8);
  let y = top + 40;
  const t = block(r, s.title, fTitle(r, 800, 60), 60, 1.1, TW, 3);
  draw(r, t, PAD, y, P.fg); y += t.h + (t.h ? 36 : 0);
  const b = block(r, s.body, fBody(r, 400, 30), 30, 1.5, colW, 9999);
  const per = fits(H - PAD - y, b.lh);
  const cols = [b.lines.slice(0, per), b.lines.slice(per, per * 2)];
  if (b.lines.length > per * 2) {
    r.over = true;
    let l = cols[1][cols[1].length - 1] ?? '';
    c.font = b.font;
    while (l.length > 1 && c.measureText(l + '…').width > colW) l = l.slice(0, -1);
    cols[1][cols[1].length - 1] = l.trimEnd() + '…';
  }
  cols.forEach((ls, i) => draw(r, { ...b, lines: ls, h: ls.length * b.lh }, PAD + i * (colW + gap), y, P.sub));
  drawLogo(r, top);
}

/* ---------------- PENUTUP ---------------- */
function qrBox(r: R, cx: number, y: number, size: number) {
  const { c, s } = r, x = cx - size / 2;
  c.fillStyle = '#fff'; c.fillRect(x - 20, y - 20, size + 40, size + 40);
  if (s.qr) c.drawImage(s.qr, x, y, size, size);
  else { c.fillStyle = '#9aa1ab'; c.font = font(600, 26); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Unggah QR', cx, y + size / 2); c.textBaseline = 'alphabetic'; }
}
function penutupQr(r: R) {
  const { c, s, P } = r, a = s.grad / 100, cx = W / 2, top = Math.max(contentTop(r), 150);
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  if (s.img) { photo(r, 0, 0, W, H); shade(c, 0.4 + a * 0.5); }
  const fg = s.img ? overlayFg(r, '#fff') : P.fg;
  const sub = s.img ? overlaySub(r, '#d6dbe3') : P.sub;
  const t = block(r, s.title, fTitle(r, 800, 76), 76, 1.12, TW, 3);
  draw(r, t, cx, top, fg, 'center');
  const b = block(r, s.body, fBody(r, 400, 34), 34, 1.45, TW - 80, 3);
  draw(r, b, cx, top + t.h + 24, sub, 'center');
  const qy = Math.max(top + t.h + 24 + b.h + 60, 700);
  qrBox(r, cx, qy, 400);
  if (s.handle.trim()) { c.font = fMeta(r, 800, 40); c.fillStyle = P.accent; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(s.handle, cx, qy + 400 + 54); }
  drawLogo(r, top);
}
function penutupCta(r: R) {
  const { c, s, P } = r, a = s.grad / 100;
  photo(r, 0, 0, W, H); gradient(c, H * 0.25, H, 0.3 + a * 0.65);
  const t = block(r, s.title, fTitle(r, 800, 84), 84, 1.1, TW, 3);
  const b = block(r, s.body, fBody(r, 400, 36), 36, 1.45, TW, 3);
  const hasH = s.handle.trim().length > 0;
  const total = t.h + (b.h ? 24 + b.h : 0) + (hasH ? 40 + 60 : 0);
  let y = H - PAD - total; const top = y;
  draw(r, t, PAD, y, overlayFg(r, '#fff')); y += t.h;
  if (b.h) { y += 24; draw(r, b, PAD, y, overlaySub(r, '#e5e7eb')); y += b.h; }
  if (hasH) {
    y += 40; c.font = fMeta(r, 800, 34); const w = c.measureText(s.handle).width + 56;
    c.fillStyle = P.accent; c.fillRect(PAD, y, w, 60);
    c.fillStyle = onColor(P.accent); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(s.handle, PAD + 28, y + 32); c.textBaseline = 'alphabetic';
  }
  drawLogo(r, top);
}
function penutupMinimal(r: R) {
  const { c, s, P } = r, cx = W / 2, onA = onColor(P.accent), top = Math.max(contentTop(r), 150) + 60;
  c.fillStyle = P.accent; c.fillRect(0, 0, W, H);
  const t = block(r, s.title, fTitle(r, 900, 108), 108, 1.05, TW, 3);
  draw(r, t, cx, top, overlayFg(r, onA), 'center');
  let y = top + t.h + 32;
  const b = block(r, s.body, fBody(r, 400, 38), 38, 1.45, TW - 80, 3);
  draw(r, b, cx, y, overlaySub(r, onA), 'center'); y += b.h + 48;
  if (s.handle.trim()) {
    c.font = fMeta(r, 800, 40); const w = c.measureText(s.handle).width + 72;
    c.fillStyle = ink(P); c.fillRect(cx - w / 2, y, w, 80);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s.handle, cx, y + 42); c.textBaseline = 'alphabetic';
    y += 80 + 56;
  }
  if (s.qr) { const q = 260; c.fillStyle = '#fff'; c.fillRect(cx - q / 2 - 16, y - 16, q + 32, q + 32); c.drawImage(s.qr, cx - q / 2, y, q, q); }
  drawLogo(r, top);
}
function penutupBanner(r: R) {
  const { c, s, P } = r, top = contentTop(r), q = 300;
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  c.fillStyle = P.accent; c.fillRect(PAD, top, 120, 8);
  let y = top + 40;
  const t = block(r, s.title, fTitle(r, 800, 84), 84, 1.08, TW, 3);
  draw(r, t, PAD, y, P.fg); y += t.h + 28;
  const bandY = H - PAD - q - 40;
  const b = block(r, s.body, fBody(r, 400, 38), 38, 1.5, TW, fits(bandY - 40 - y, 57));
  draw(r, b, PAD, y, P.sub);
  c.fillStyle = P.accent; c.fillRect(0, bandY - 40, W, 6);
  const textW = TW - q - 80;
  c.textAlign = 'left'; c.textBaseline = 'top';
  c.font = fMeta(r, 700, 24); c.fillStyle = P.accent; c.fillText('IKUTI KAMI', PAD, bandY + 50);
  const h = block(r, s.handle, fMeta(r, 800, 46), 46, 1.2, textW, 3);
  draw(r, h, PAD, bandY + 92, P.fg);
  qrBox(r, W - PAD - q / 2 - 20, bandY + 20, q - 40);
  drawLogo(r, top);
}

const TABLE: Record<string, Record<string, (r: R) => void>> = {
  cover: { 'foto-bawah': coverFotoBawah, 'foto-tengah': coverFotoTengah, 'blok-warna': coverBlokWarna, bingkai: coverBingkai, poster: coverPoster },
  isi: { 'foto-atas': isiFotoAtas, teks: isiTeks, 'foto-bawah': isiFotoBawah, panel: isiPanel, kutipan: isiKutipan, 'dua-kolom': isiDuaKolom },
  penutup: { 'qr-tengah': penutupQr, 'cta-foto': penutupCta, minimal: penutupMinimal, banner: penutupBanner },
};

/** Render satu slide ke canvas 1080x1350. Dipakai preview, thumbnail, dan ekspor. */
export function renderSlide(c: C, s: Slide, brand: Brand): { over: boolean } {
  const r: R = { c, s, P: getPalette(s.palette, s.custom), b: brand, over: false };
  c.clearRect(0, 0, W, H);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const fn = TABLE[s.type]?.[s.template] ?? Object.values(TABLE[s.type])[0];
  fn(r);
  return { over: r.over };
}
