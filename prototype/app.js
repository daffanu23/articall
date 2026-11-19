const W = 1080, H = 1350, PAD = 72;
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');

const brand = { show: true, logo: null, pos: 'tl', name: '', accent: '#e63946', theme: 'modern' };
const SANS = 'system-ui,Segoe UI,Arial,sans-serif';
const THEMES = {
  modern:  { bg: '#0d1117', fg: '#ffffff', sub: '#d0d6de', mute: '#8b95a3', coverBg: '#0d1117', font: `800 {s}px ${SANS}` },
  koran:   { bg: '#f5efe0', fg: '#1a1a1a', sub: '#333333', mute: '#6b6455', coverBg: '#1a1a1a', font: `700 {s}px Georgia,'Times New Roman',serif` },
  minimal: { bg: '#ffffff', fg: '#111111', sub: '#444444', mute: '#888888', coverBg: '#111111', font: `600 {s}px ${SANS}` },
  poster:  { bg: '#ffd60a', fg: '#111111', sub: '#222222', mute: '#444444', coverBg: '#111111', font: `900 {s}px Impact,'Arial Black',${SANS}` }
};
const newSlide = (layout = 'cover') => ({
  layout, kicker: '', title: '', body: '', credit: '',
  img: null, qr: null, zoom: 1, px: 0, py: 0, grad: 70
});
const slides = [
  Object.assign(newSlide('cover'), { kicker: 'BERITA UTAMA', title: 'Judul Berita Anda Muncul di Sini dan Otomatis Tertata Rapi', credit: 'Teks: Reporter · Foto: Fotografer' }),
  Object.assign(newSlide('split'), { title: 'Subjudul Isi Berita', body: 'Tempel paragraf berita di sini. Ukuran huruf menyesuaikan otomatis agar teks selalu muat dan terbaca jelas pada layout.' }),
  Object.assign(newSlide('closing'), { title: 'Baca Selengkapnya', body: 'Kunjungi situs kami atau pindai kode QR.' })
];
let cur = 0;

/* ---------- helpers ---------- */
function loadImg(file, cb) {
  if (!file) return;
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => cb(im);
  im.src = url;
}
function wrap(c, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? line + ' ' + word : word;
      if (c.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}
// Fit text in a box: shrink font until it fits. Returns {lines,size,lh}
function fit(c, text, font, maxW, maxH, start, min, lhk = 1.25) {
  for (let s = start; s >= min; s -= 2) {
    c.font = font.replace('{s}', s);
    const lines = wrap(c, text, maxW);
    if (lines.length * s * lhk <= maxH) return { lines, size: s, lh: s * lhk };
  }
  c.font = font.replace('{s}', min);
  const lines = wrap(c, text, maxW), mx = Math.floor(maxH / (min * lhk));
  return { lines: lines.slice(0, mx), size: min, lh: min * lhk };
}
function drawLines(c, f, x, y) { f.lines.forEach((l, i) => c.fillText(l, x, y + i * f.lh)); }
function drawCover(c, im, x, y, w, h, zoom, px, py) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const s = Math.max(w / im.width, h / im.height) * zoom;
  const dw = im.width * s, dh = im.height * s;
  const ox = (dw - w) / 2, oy = (dh - h) / 2;
  c.drawImage(im, x - ox - (px / 100) * ox, y - oy - (py / 100) * oy, dw, dh);
  c.restore();
}
function gradient(c, y0, y1, alpha, from = 0) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(0,0,0,${from})`); g.addColorStop(1, `rgba(0,0,0,${alpha})`);
  c.fillStyle = g; c.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
}
function pill(c, text, x, y) {
  c.font = '700 30px system-ui,Segoe UI,Arial,sans-serif';
  const w = c.measureText(text).width + 40;
  c.fillStyle = brand.accent; c.fillRect(x, y, w, 52);
  c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(text, x + 20, y + 27); c.textBaseline = 'alphabetic';
}
function drawLogo(c) {
  if (!brand.show) return;
  const m = 56, maxH = 110, maxW = 260;
  let w, h;
  if (brand.logo) {
    const k = Math.min(maxW / brand.logo.width, maxH / brand.logo.height);
    w = brand.logo.width * k; h = brand.logo.height * k;
  } else {
    c.font = '800 34px system-ui,Segoe UI,Arial,sans-serif';
    w = c.measureText(brand.name || 'LOGO').width + 40; h = 64;
  }
  const x = brand.pos.endsWith('l') ? m : W - m - w;
  const y = brand.pos.startsWith('t') ? m : H - m - h;
  if (brand.logo) c.drawImage(brand.logo, x, y, w, h);
  else {
    c.fillStyle = brand.accent; c.fillRect(x, y, w, h);
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(brand.name || 'LOGO', x + 20, y + h / 2 + 2); c.textBaseline = 'alphabetic';
  }
}
// Vertical bounds safe from the locked logo
function safe() {
  const top = brand.show && brand.pos.startsWith('t') ? 200 : PAD;
  const bottom = brand.show && brand.pos.startsWith('b') ? H - 200 : H - PAD;
  return { top, bottom };
}
let FONT_T = THEMES.modern.font;
const FONT_B = '400 {s}px system-ui,Segoe UI,Arial,sans-serif';

/* ---------- renderer ---------- */
function render(c, s) {
  const { top, bottom } = safe();
  c.clearRect(0, 0, W, H);
  const T = THEMES[brand.theme]; FONT_T = T.font;
  const base = (s.layout === 'split' || s.layout === 'text') ? T.bg : T.coverBg;
  c.fillStyle = base; c.fillRect(0, 0, W, H);
  const a = s.grad / 100, tw = W - PAD * 2;
  c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';

  if (s.layout === 'cover') {
    if (s.img) drawCover(c, s.img, 0, 0, W, H, s.zoom, s.px, s.py);
    gradient(c, H * 0.3, H, a);
    let y = bottom;
    if (s.credit) { c.font = FONT_B.replace('{s}', 26); c.fillStyle = '#ddd'; c.fillText(s.credit, PAD, y); y -= 56; }
    const f = fit(c, s.title || ' ', FONT_T, tw, 520, 92, 44, 1.15);
    c.fillStyle = '#fff'; const ty = y - (f.lines.length - 1) * f.lh;
    drawLines(c, f, PAD, ty);
    if (s.kicker) pill(c, s.kicker.toUpperCase(), PAD, ty - f.size - 80);
  }
  else if (s.layout === 'split') {
    const ph = 700;
    if (s.img) drawCover(c, s.img, 0, 0, W, ph, s.zoom, s.px, s.py);
    gradient(c, ph - 260, ph, a);
    c.fillStyle = T.bg; c.fillRect(0, ph, W, H - ph);
    c.fillStyle = brand.accent; c.fillRect(PAD, ph + 40, 120, 8);
    let y = ph + 110;
    if (s.kicker) { c.font = '700 28px system-ui,Arial,sans-serif'; c.fillStyle = brand.accent; c.fillText(s.kicker.toUpperCase(), PAD, y); y += 30; }
    const f = fit(c, s.title || ' ', FONT_T, tw, 150, 56, 36, 1.2);
    c.fillStyle = T.fg; y += f.size; drawLines(c, f, PAD, y); y += (f.lines.length - 1) * f.lh + 40;
    const b = fit(c, s.body || ' ', FONT_B, tw, bottom - y, 38, 22, 1.45);
    c.fillStyle = T.sub; drawLines(c, b, PAD, y + b.size * 0.6);
  }
  else if (s.layout === 'text') {
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    c.fillStyle = brand.accent; c.fillRect(PAD, top, 120, 8);
    let y = top + 70;
    if (s.kicker) { c.font = '700 30px system-ui,Arial,sans-serif'; c.fillStyle = brand.accent; c.fillText(s.kicker.toUpperCase(), PAD, y); y += 30; }
    const f = fit(c, s.title || ' ', FONT_T, tw, 240, 72, 40, 1.15);
    c.fillStyle = T.fg; y += f.size; drawLines(c, f, PAD, y); y += (f.lines.length - 1) * f.lh + 50;
    const b = fit(c, s.body || ' ', FONT_B, tw, bottom - y - (s.credit ? 50 : 0), 44, 24, 1.5);
    c.fillStyle = T.sub; drawLines(c, b, PAD, y + b.size * 0.6);
    if (s.credit) { c.font = FONT_B.replace('{s}', 26); c.fillStyle = T.mute; c.fillText(s.credit, PAD, bottom); }
  }
  else if (s.layout === 'quote') {
    if (s.img) { drawCover(c, s.img, 0, 0, W, H, s.zoom, s.px, s.py); c.fillStyle = `rgba(0,0,0,${0.35 + a * 0.5})`; c.fillRect(0, 0, W, H); }
    c.fillStyle = brand.accent; c.font = '900 320px Georgia,serif'; c.fillText('“', PAD - 10, H * 0.30 + 60);
    const f = fit(c, s.body || ' ', 'italic 600 {s}px Georgia,serif', tw, 560, 68, 32, 1.35);
    c.fillStyle = '#fff'; const y0 = H * 0.36 + f.size; drawLines(c, f, PAD, y0);
    const ay = y0 + f.lines.length * f.lh + 30;
    c.fillStyle = brand.accent; c.fillRect(PAD, ay, 90, 6);
    if (s.title) { c.font = '700 38px system-ui,Arial,sans-serif'; c.fillStyle = '#fff'; c.fillText(s.title, PAD, ay + 70); }
    if (s.kicker) { c.font = '400 28px system-ui,Arial,sans-serif'; c.fillStyle = '#c8ced6'; c.fillText(s.kicker, PAD, ay + 112); }
  }
  else { // closing
    if (s.img) { drawCover(c, s.img, 0, 0, W, H, s.zoom, s.px, s.py); c.fillStyle = `rgba(0,0,0,${0.4 + a * 0.5})`; c.fillRect(0, 0, W, H); }
    c.textAlign = 'center';
    const cx = W / 2, f = fit(c, s.title || ' ', FONT_T, tw, 200, 78, 40, 1.15);
    c.fillStyle = '#fff'; drawLines(c, f, cx, top + 150);
    const b = fit(c, s.body || ' ', FONT_B, tw - 60, 140, 36, 22, 1.4);
    c.fillStyle = '#d0d6de'; drawLines(c, b, cx, top + 150 + (f.lines.length - 1) * f.lh + 70);
    const q = 420, qx = cx - q / 2, qy = 680;
    c.fillStyle = '#fff'; c.fillRect(qx - 20, qy - 20, q + 40, q + 40);
    if (s.qr) c.drawImage(s.qr, qx, qy, q, q);
    else { c.fillStyle = '#999'; c.font = '600 28px system-ui,Arial,sans-serif'; c.fillText('Unggah gambar QR', cx, qy + q / 2); }
    if (brand.name) { c.font = '700 40px system-ui,Arial,sans-serif'; c.fillStyle = brand.accent; c.fillText(brand.name, cx, Math.min(qy + q + 120, bottom)); }
    c.textAlign = 'left';
  }
  drawLogo(c);
}

/* ---------- UI ---------- */
const fields = ['layout', 'kicker', 'title', 'body', 'credit', 'zoom', 'px', 'py', 'grad'];
function redraw() { render(ctx, slides[cur]); drawThumb(cur); }
function drawThumb(i) {
  const t = document.querySelector(`#slideList li[data-i="${i}"] canvas`); if (!t) return;
  const c = t.getContext('2d'); c.save(); c.scale(t.width / W, t.height / H); render(c, slides[i]); c.restore();
}
function buildList() {
  const ol = $('slideList'); ol.innerHTML = '';
  slides.forEach((s, i) => {
    const li = document.createElement('li'); li.dataset.i = i; if (i === cur) li.className = 'active';
    const t = document.createElement('canvas'); t.width = 216; t.height = 270;
    const b = document.createElement('b'); b.textContent = i + 1;
    li.append(t, b); li.onclick = () => { cur = i; sync(); }; ol.append(li);
  });
  slides.forEach((_, i) => drawThumb(i));
}
function sync() {
  const s = slides[cur];
  fields.forEach(k => { $(k).value = s[k]; });
  $('gradOut').textContent = s.grad + '%';
  $('qrRow').hidden = s.layout !== 'closing';
  $('imgSec').querySelectorAll('label:not(#qrRow)').forEach(l => l.style.display = s.layout === 'text' ? 'none' : '');
  buildList(); redraw();
}
fields.forEach(k => $(k).addEventListener('input', () => {
  const s = slides[cur], el = $(k);
  s[k] = el.type === 'range' ? +el.value : el.value;
  if (k === 'grad') $('gradOut').textContent = s.grad + '%';
  if (k === 'layout') { $('qrRow').hidden = s.layout !== 'closing'; sync(); } else redraw();
}));
$('image').onchange = e => loadImg(e.target.files[0], im => { slides[cur].img = im; slides[cur].zoom = 1; slides[cur].px = slides[cur].py = 0; sync(); });
$('qr').onchange = e => loadImg(e.target.files[0], im => { slides[cur].qr = im; redraw(); });
$('logo').onchange = e => loadImg(e.target.files[0], im => { brand.logo = im; redrawAll(); });
$('showLogo').onchange = e => { brand.show = e.target.checked; redrawAll(); };
$('logoPos').onchange = e => { brand.pos = e.target.value; redrawAll(); };
$('brand').oninput = e => { brand.name = e.target.value; redrawAll(); };
$('template').onchange = e => { brand.theme = e.target.value; redrawAll(); };
$('accent').oninput = e => { brand.accent = e.target.value; redrawAll(); };
function redrawAll() { redraw(); slides.forEach((_, i) => drawThumb(i)); }

$('add').onclick = () => { slides.splice(cur + 1, 0, newSlide('split')); cur++; sync(); };
$('dup').onclick = () => { slides.splice(cur + 1, 0, { ...slides[cur] }); cur++; sync(); };
$('del').onclick = () => { if (slides.length > 1) { slides.splice(cur, 1); cur = Math.min(cur, slides.length - 1); sync(); } };
$('up').onclick = () => { if (cur > 0) { [slides[cur - 1], slides[cur]] = [slides[cur], slides[cur - 1]]; cur--; sync(); } };
$('down').onclick = () => { if (cur < slides.length - 1) { [slides[cur + 1], slides[cur]] = [slides[cur], slides[cur + 1]]; cur++; sync(); } };

/* ---------- export ---------- */
function exportSlide(i) {
  return new Promise(res => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    render(c.getContext('2d'), slides[i]);
    const type = 'image/' + $('fmt').value, ext = $('fmt').value === 'png' ? 'png' : 'jpg';
    c.toBlob(b => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = `articall-${String(i + 1).padStart(2, '0')}.${ext}`; a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); res(); }, 300);
    }, type, 0.95);
  });
}
$('dlOne').onclick = () => exportSlide(cur);
$('dlAll').onclick = async () => { for (let i = 0; i < slides.length; i++) await exportSlide(i); };

sync();
