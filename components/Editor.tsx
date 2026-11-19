'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BUILTIN_FONTS, Brand, CREDIT_ROLES, FontOption, H, LogoPos, PAGE_TYPES, PAGE_TYPE_BADGE, PageType, Slide, SlideTypeFields, TEMPLATES, W, getTemplate, newSlide,
} from '@/lib/types';
import { CustomPaletteColors, PALETTES, autoTextForBg, getPalette } from '@/lib/palettes';
import { renderSlide } from '@/lib/render';
import { Fmt, downloadAll, downloadOne } from '@/lib/export';

type Tab = 'template' | 'isi' | 'gaya';
const TABS: { id: Tab; n: number; label: string }[] = [
  { id: 'template', n: 1, label: 'Template' },
  { id: 'isi', n: 2, label: 'Isi' },
  { id: 'gaya', n: 3, label: 'Gaya' },
];

function loadImg(file: File | undefined, cb: (im: HTMLImageElement) => void) {
  if (!file) return;
  const im = new Image();
  im.onload = () => cb(im);
  im.src = URL.createObjectURL(file);
}

/** Unggah / Ganti / Hapus gambar. Input di-reset agar file yang sama bisa dipilih ulang. */
function ImagePicker({ label, hint, value, onFile, onClear }: {
  label: string; hint: string; value: HTMLImageElement | null;
  onFile: (im: HTMLImageElement) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pick = (f?: File) => loadImg(f, onFile);
  return (
    <div className="picker">
      <div className="field-label">{label}</div>
      {value ? (
        <div className="picker-has">
          <img src={value.src} alt="" />
          <div className="picker-btns">
            <button className="btn small" onClick={() => ref.current?.click()}>Ganti</button>
            <button className="btn small danger" onClick={onClear}>Hapus</button>
          </div>
        </div>
      ) : (
        <button className="drop"
          onClick={() => ref.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
          <b>＋ Unggah</b><span>{hint}</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden
        onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

function Thumb({ slide, template, brand, w, rev }: { slide: Slide; template?: string; brand: Brand; w: number; rev: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h = Math.round((w * H) / W);
  useEffect(() => {
    const c = ref.current!.getContext('2d')!;
    const target = template ? { ...slide, template } : slide;
    c.save(); c.scale(w / W, h / H); renderSlide(c, target, brand); c.restore();
  }, [slide, template, brand, rev, w, h]);
  return <canvas ref={ref} width={w} height={h} />;
}

function Range({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="range">
      <span className="field-label">{label}<output>{step < 1 ? value.toFixed(2) : value}{suffix}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
    </label>
  );
}

const LOGO_POS: { id: LogoPos; label: string }[] = [
  { id: 'tl', label: 'Kiri atas' }, { id: 'tr', label: 'Kanan atas' },
  { id: 'bl', label: 'Kiri bawah' }, { id: 'br', label: 'Kanan bawah' },
];

const initial = (): Slide[] => [newSlide('cover'), newSlide('isi'), newSlide('penutup')];

export default function Editor() {
  const [slides, setSlides] = useState<Slide[]>(initial);
  const [cur, setCur] = useState(0);
  const [tab, setTab] = useState<Tab>('template');
  const [brand, setBrand] = useState<Brand>({ show: true, logo: null });
  const [fonts, setFonts] = useState<FontOption[]>(BUILTIN_FONTS);
  const [showCustomFont, setShowCustomFont] = useState(false);
  const [fontNameInput, setFontNameInput] = useState('');
  const [fmt, setFmt] = useState<Fmt>('jpeg');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [over, setOver] = useState(false);
  const [rev, setRev] = useState(0);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const fontFileRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingColorRef = useRef<{ idx: number; patch: Partial<CustomPaletteColors> } | null>(null);
  const s = slides[cur];
  const tpl = getTemplate(s.type, s.template);
  const has = (f: string) => tpl.fields.includes(f as never);
  const curPal = getPalette(s.palette, s.custom);
  const mixedFonts = !(s.titleFont === s.bodyFont && s.titleFont === s.metaFont);

  const patch = useCallback((p: Partial<Slide>) =>
    setSlides(a => a.map((x, i) => {
      if (i !== cur) return x;
      const curFields = x.byType[x.type];
      const nextFields: SlideTypeFields = {
        template: p.template ?? curFields.template,
        kicker: p.kicker ?? curFields.kicker,
        title: p.title ?? curFields.title,
        body: p.body ?? curFields.body,
        handle: p.handle ?? curFields.handle,
      };
      return { ...x, ...p, byType: { ...x.byType, [x.type]: nextFields } };
    })), [cur]);
  const patchBrand = (p: Partial<Brand>) => setBrand(b => ({ ...b, ...p }));
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const setCustomColor = (patchColors: Partial<CustomPaletteColors>, immediate = false) => {
    if (pendingColorRef.current && pendingColorRef.current.idx === cur) {
      pendingColorRef.current = { idx: cur, patch: { ...pendingColorRef.current.patch, ...patchColors } };
    } else {
      pendingColorRef.current = { idx: cur, patch: patchColors };
    }
    const flush = () => {
      const item = pendingColorRef.current;
      pendingColorRef.current = null;
      if (!item) return;
      setSlides(prev => {
        const sl = prev[item.idx];
        if (!sl) return prev;
        const base = getPalette(sl.palette, sl.custom);
        const next: CustomPaletteColors = { bg: base.bg, fg: base.fg, sub: base.sub, accent: base.accent, ...item.patch };
        if (
          sl.palette === 'custom' &&
          sl.custom.bg === next.bg &&
          sl.custom.fg === next.fg &&
          sl.custom.sub === next.sub &&
          sl.custom.accent === next.accent
        ) {
          return prev;
        }
        return prev.map((x, i) => (i === item.idx ? { ...x, palette: 'custom', custom: next } : x));
      });
    };
    if (immediate) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      flush();
      return;
    }
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        flush();
      });
    }
  };

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    setOver(renderSlide(cvRef.current!.getContext('2d')!, s, brand).over);
  }, [s, brand, rev]);
  useEffect(() => { document.fonts?.ready.then(() => setRev(r => r + 1)); }, []);

  // Panah kiri/kanan = pindah halaman (kecuali sedang mengetik)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft') setCur(c => Math.max(0, c - 1));
      if (e.key === 'ArrowRight') setCur(c => Math.min(slides.length - 1, c + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length]);

  const changeType = (type: PageType) => {
    if (s.type === type) return;
    setSlides(a => a.map((x, i) => {
      if (i !== cur) return x;
      const savedCurrent: SlideTypeFields = {
        template: x.template,
        kicker: x.kicker,
        title: x.title,
        body: x.body,
        handle: x.handle,
      };
      const nextByType = { ...x.byType, [x.type]: savedCurrent };
      const restored = nextByType[type];
      return {
        ...x,
        type,
        ...restored,
        byType: nextByType,
        credits: type === 'cover' && x.credits.length === 0
          ? [{ role: 'Penulis', name: 'Nama Penulis' }, { role: 'Foto', name: 'Nama Fotografer' }]
          : x.credits,
      };
    }));
  };
  const setCredit = (i: number, p: Partial<{ role: string; name: string }>) =>
    patch({ credits: s.credits.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  const applyPageFont = (family: string) =>
    patch({ pageFont: family, titleFont: family, bodyFont: family, metaFont: family });

  const addFontOption = (label: string, family: string) => {
    setFonts(prev => (prev.some(f => f.family === family) ? prev : [...prev, { id: `custom_${Date.now()}`, label, family }]));
    applyPageFont(family);
    setRev(r => r + 1);
    setShowCustomFont(false);
  };

  const onUploadFont = async (file?: File) => {
    if (!file) return;
    const rawName = file.name.replace(/\.[^.]+$/, '').replace(/["']/g, '').trim() || 'Custom Font';
    const faceName = `${rawName} Custom`;
    try {
      const buf = await file.arrayBuffer();
      const face = new FontFace(faceName, buf);
      const loaded = await face.load();
      document.fonts.add(loaded);
      addFontOption(`${rawName} (Custom)`, `"${faceName}", system-ui, sans-serif`);
      say(`Font "${rawName}" ditambahkan`);
    } catch {
      say('Gagal memuat font. Gunakan file .ttf, .otf, .woff, atau .woff2.');
    }
  };

  const onAddGoogleFont = async () => {
    const raw = fontNameInput.trim().replace(/["']/g, '');
    if (!raw) return;
    const key = raw.toLowerCase();
    if (!document.querySelector(`link[data-gfont="${key}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(raw).replace(/%20/g, '+')}:ital,wght@0,400;0,600;0,700;0,800;1,600&display=swap`;
      link.dataset.gfont = key;
      document.head.appendChild(link);
    }
    try { await document.fonts.load(`700 36px "${raw}"`); } catch { /* fallback ke font lokal/sistem */ }
    document.fonts?.ready.then(() => setRev(r => r + 1));
    addFontOption(`${raw} (Custom)`, `"${raw}", system-ui, sans-serif`);
    setFontNameInput('');
    say(`Font "${raw}" ditambahkan`);
  };

  const move = (d: number) => {
    const j = cur + d;
    if (j < 0 || j >= slides.length) return;
    setSlides(a => { const b = [...a]; [b[cur], b[j]] = [b[j], b[cur]]; return b; });
    setCur(j);
  };
  const add = () => {
    const insertAt = s.type === 'penutup' ? cur : cur + 1;
    setSlides(a => [...a.slice(0, insertAt), newSlide('isi', { logoPos: s.logoPos }), ...a.slice(insertAt)]);
    setCur(insertAt);
  };
  const dup = () => {
    const src = slides[cur];
    const cloned: Slide = {
      ...src,
      id: newSlide().id,
      custom: { ...src.custom },
      credits: src.credits.map(c => ({ ...c })),
      byType: {
        cover: { ...src.byType.cover },
        isi: { ...src.byType.isi },
        penutup: { ...src.byType.penutup },
      },
    };
    setSlides(a => [...a.slice(0, cur + 1), cloned, ...a.slice(cur + 1)]);
    setCur(cur + 1);
  };
  const del = () => {
    if (slides.length < 2) return;
    setSlides(a => a.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1));
  };
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); say(ok); } catch { say('Gagal mengunduh, coba lagi.'); } finally { setBusy(false); }
  };

  return (
    <>
      <header className="top">
        <a className="brand" href="/">Articall</a>
        <span className="crumb">Halaman {cur + 1} dari {slides.length}</span>
        <div className="actions">
          <select className="fmt" value={fmt} onChange={e => setFmt(e.target.value as Fmt)} aria-label="Format unduhan">
            <option value="jpeg">JPG</option><option value="png">PNG</option>
          </select>
          <button className="btn" disabled={busy} onClick={() => run(() => downloadOne(s, cur, brand, fmt), 'Halaman terunduh')}>Halaman Ini</button>
          <button className="btn primary" disabled={busy} onClick={() => run(() => downloadAll(slides, brand, fmt), 'Semua halaman terunduh (ZIP)')}>
            {busy ? 'Memproses…' : 'Download Semua'}
          </button>
        </div>
      </header>

      <main className="app">
        {/* ===== Preview + filmstrip ===== */}
        <section className="stage">
          <div className="canvas-wrap">
            <canvas ref={cvRef} id="cv" width={W} height={H} />
          </div>
          {over && <p className="warn center">⚠ Teks terlalu panjang untuk template ini, sebagian dipotong. Persingkat atau pindahkan ke halaman lain.</p>}

          <div className="toolbar">
            <button className="tb" onClick={() => move(-1)} disabled={cur === 0} title="Geser halaman ke kiri">← Geser</button>
            <button className="tb" onClick={() => move(1)} disabled={cur === slides.length - 1} title="Geser halaman ke kanan">Geser →</button>
            <button className="tb" onClick={dup}>⧉ Duplikat</button>
            <button className="tb danger" onClick={del} disabled={slides.length < 2}>🗑 Hapus</button>
          </div>

          <ol className="strip">
            {slides.map((sl, i) => (
              <li key={sl.id} className={i === cur ? 'active' : ''} onClick={() => setCur(i)}>
                <Thumb slide={sl} brand={brand} w={84} rev={rev} /><b>{i + 1} · {PAGE_TYPE_BADGE[sl.type]}</b>
              </li>
            ))}
            <li className="add" onClick={add} title="Tambah halaman"><span>＋</span><small>Tambah</small></li>
          </ol>
        </section>

        {/* ===== Panel ===== */}
        <aside className="panel">
          <nav className="tabs" role="tablist">
            {TABS.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                <i>{t.n}</i>{t.label}
              </button>
            ))}
          </nav>

          <div className="tab-body">
            {tab === 'template' && (<>
              <section>
                <h2>Jenis halaman</h2>
                <div className="seg">
                  {PAGE_TYPES.map(t => (
                    <button key={t.id} className={s.type === t.id ? 'on' : ''} onClick={() => changeType(t.id)}>{t.label}</button>
                  ))}
                </div>
              </section>
              <section>
                <h2>Pilih template</h2>
                <div className="tpl">
                  {TEMPLATES[s.type].map(t => (
                    <button key={`${s.type}-${t.id}`} className={s.template === t.id ? 'on' : ''} onClick={() => patch({ template: t.id })}>
                      <Thumb slide={s} template={t.id} brand={brand} w={120} rev={rev} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </section>
              <button className="next" onClick={() => setTab('isi')}>Lanjut: isi konten →</button>
            </>)}

            {tab === 'isi' && (<>
              <p className="tip">Mengedit <b>{PAGE_TYPES.find(p => p.id === s.type)?.label}</b> · {tpl.label}</p>
              <section>
                <h2>Teks</h2>
                {has('kicker') && (
                  <label className="f"><span className="field-label">Label / kategori</span>
                    <input type="text" value={s.kicker} placeholder="mis. BERITA UTAMA" onChange={e => patch({ kicker: e.target.value })} /></label>
                )}
                {has('title') && (
                  <label className="f"><span className="field-label">{tpl.titleLabel ?? 'Judul'}</span>
                    <textarea rows={2} value={s.title} onChange={e => patch({ title: e.target.value })} /></label>
                )}
                {has('body') && (
                  <label className="f"><span className="field-label">{tpl.bodyLabel ?? 'Isi'}</span>
                    <textarea rows={6} value={s.body} onChange={e => patch({ body: e.target.value })} /></label>
                )}
                {has('handle') && (
                  <label className="f"><span className="field-label">Akun media sosial</span>
                    <input type="text" value={s.handle} placeholder="@akunmedia" onChange={e => patch({ handle: e.target.value })} /></label>
                )}
              </section>

              {has('credits') && (
                <section>
                  <h2>Penulis &amp; sumber</h2>
                  <div className="credits">
                    {s.credits.map((cr, i) => (
                      <div className="crow" key={i}>
                        <select value={cr.role} onChange={e => setCredit(i, { role: e.target.value })}>
                          {CREDIT_ROLES.map(r => <option key={r}>{r}</option>)}</select>
                        <input type="text" value={cr.name} placeholder="Nama" onChange={e => setCredit(i, { name: e.target.value })} />
                        <button className="x" title="Hapus baris" onClick={() => patch({ credits: s.credits.filter((_, j) => j !== i) })}>×</button>
                      </div>
                    ))}
                  </div>
                  {s.credits.length < 4 && (
                    <button className="btn small" onClick={() => patch({ credits: [...s.credits, { role: 'Editor', name: '' }] })}>＋ Tambah baris</button>
                  )}
                </section>
              )}

              {(tpl.image || has('qr')) && (
                <section>
                  <h2>Gambar</h2>
                  {tpl.image && (<>
                    <ImagePicker label="Foto" hint="Klik atau seret foto ke sini" value={s.img}
                      onFile={im => patch({ img: im, zoom: 1, px: 0, py: 0 })}
                      onClear={() => patch({ img: null, zoom: 1, px: 0, py: 0 })} />
                    {s.img && (<>
                      <Range label="Zoom" value={s.zoom} min={1} max={3} step={0.01} suffix="×" onChange={v => patch({ zoom: v })} />
                      <Range label="Geser kiri–kanan" value={s.px} min={-100} max={100} onChange={v => patch({ px: v })} />
                      <Range label="Geser atas–bawah" value={s.py} min={-100} max={100} onChange={v => patch({ py: v })} />
                      <button className="btn small" onClick={() => patch({ zoom: 1, px: 0, py: 0 })}>Reset posisi foto</button>
                    </>)}
                  </>)}
                  {has('qr') && (
                    <ImagePicker label="Gambar QR" hint="Klik atau seret gambar QR" value={s.qr}
                      onFile={im => patch({ qr: im })} onClear={() => patch({ qr: null })} />
                  )}
                </section>
              )}
              <button className="next" onClick={() => setTab('gaya')}>Lanjut: atur gaya →</button>
            </>)}

            {tab === 'gaya' && (<>
              <section>
                <h2>Palet warna <small>halaman {cur + 1}</small></h2>
                {(['dark', 'light'] as const).map(mode => (
                  <div key={mode}>
                    <p className="sub">{mode === 'dark' ? 'Gelap' : 'Terang'}</p>
                    <div className="pal">
                      {PALETTES.filter(p => p.mode === mode).map(p => (
                        <button key={p.id} className={s.palette === p.id ? 'on' : ''} title={p.name}
                          onClick={() => {
                            if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
                            pendingColorRef.current = null;
                            patch({ palette: p.id, custom: { bg: p.bg, fg: p.fg, sub: p.sub, accent: p.accent } });
                          }}>
                          <i style={{ background: p.bg }}><b style={{ background: p.accent }} /></i>
                          <span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <div className={`custom-box${s.palette === 'custom' ? ' on' : ''}`}>
                  <p className="sub">Kustom (eksplor warna sendiri){s.palette === 'custom' ? ' · Aktif' : ''}</p>
                  <div className="custom-pal">
                    {([
                      ['bg', 'Latar'],
                      ['accent', 'Aksen'],
                      ['fg', 'Teks Judul'],
                      ['sub', 'Teks Isi'],
                    ] as const).map(([key, label]) => (
                      <label className="c-item" key={key}>
                        <span>{label}</span>
                        <div>
                          <input type="color" value={curPal[key]} onChange={e => setCustomColor({ [key]: e.target.value })} />
                          <code>{curPal[key].toUpperCase()}</code>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="pal-actions">
                    <button className="btn small" onClick={() => {
                      const auto = autoTextForBg(curPal.bg);
                      setCustomColor({ fg: auto.fg, sub: auto.sub }, true);
                    }}>Sesuaikan kontras teks otomatis</button>
                    <button className="btn small" onClick={() => {
                      setSlides(a => a.map(x => ({ ...x, palette: s.palette, custom: { ...s.custom } })));
                      say('Warna diterapkan ke semua halaman');
                    }}>Terapkan warna ini ke semua halaman</button>
                  </div>
                </div>
              </section>

              <section>
                <h2>Font <small>halaman {cur + 1}</small></h2>
                <label className="f"><span className="field-label">Semua teks di halaman ini</span>
                  <select value={mixedFonts ? '' : s.pageFont} onChange={e => e.target.value && applyPageFont(e.target.value)}>
                    {mixedFonts && <option value="">Campuran (kustom per teks)</option>}
                    {fonts.map(f => <option key={f.id} value={f.family}>{f.label}</option>)}
                  </select>
                </label>
                <div className="font-grid">
                  <label className="f"><span className="field-label">Font Judul</span>
                    <select value={s.titleFont} onChange={e => patch({ titleFont: e.target.value })}>
                      {fonts.map(f => <option key={f.id} value={f.family}>{f.label}</option>)}
                    </select>
                  </label>
                  <label className="f"><span className="field-label">Font Isi / Kutipan</span>
                    <select value={s.bodyFont} onChange={e => patch({ bodyFont: e.target.value })}>
                      {fonts.map(f => <option key={f.id} value={f.family}>{f.label}</option>)}
                    </select>
                  </label>
                  <label className="f"><span className="field-label">Font Label &amp; Sumber</span>
                    <select value={s.metaFont} onChange={e => patch({ metaFont: e.target.value })}>
                      {fonts.map(f => <option key={f.id} value={f.family}>{f.label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="pal-actions">
                  <button className="btn small" onClick={() => setShowCustomFont(v => !v)}>
                    {showCustomFont ? 'Tutup Font Custom' : '＋ Tambah Font Custom'}
                  </button>
                  <button className="btn small" onClick={() => {
                    setSlides(a => a.map(x => ({
                      ...x, pageFont: s.pageFont, titleFont: s.titleFont, bodyFont: s.bodyFont, metaFont: s.metaFont,
                    })));
                    say('Font diterapkan ke semua halaman');
                  }}>Terapkan font halaman ini ke semua halaman</button>
                </div>

                {showCustomFont && (
                  <div className="custom-font-box">
                    <button className="btn small" onClick={() => fontFileRef.current?.click()}>
                      Unggah File Font (.ttf / .otf / .woff / .woff2)
                    </button>
                    <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" hidden
                      onChange={e => { onUploadFont(e.target.files?.[0]); e.target.value = ''; }} />
                    <div className="gfont-row">
                      <input type="text" value={fontNameInput} placeholder="Nama Google Font / font lokal (mis. Bebas Neue)"
                        onChange={e => setFontNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') onAddGoogleFont(); }} />
                      <button className="btn small primary" onClick={onAddGoogleFont}>Tambah</button>
                    </div>
                  </div>
                )}
              </section>

              <section>
                <h2>Logo</h2>
                <ImagePicker label="File logo (dipakai semua halaman)" hint="Klik atau seret logo (PNG transparan disarankan)" value={brand.logo}
                  onFile={im => patchBrand({ logo: im })} onClear={() => patchBrand({ logo: null })} />
                <label className="check">
                  <input type="checkbox" checked={brand.show} onChange={e => patchBrand({ show: e.target.checked })} /> Tampilkan logo
                </label>
                <div className="field-label">Posisi di halaman ini</div>
                <div className="pos">
                  {LOGO_POS.map(p => (
                    <button key={p.id} className={s.logoPos === p.id ? 'on' : ''} onClick={() => patch({ logoPos: p.id })}>
                      <i className={`p-${p.id}`} /><span>{p.label}</span>
                    </button>
                  ))}
                </div>
                <p className="muted">Posisi bawah selalu berada tepat di atas judul.</p>
                <button className="btn small" onClick={() => setSlides(a => a.map(x => ({ ...x, logoPos: s.logoPos })))}>
                  Terapkan posisi ini ke semua halaman</button>
              </section>

              {tpl.grad && (
                <section>
                  <h2>Keterbacaan teks</h2>
                  <Range label="Ketebalan gradasi gelap" value={s.grad} min={0} max={85} suffix="%" onChange={v => patch({ grad: v })} />
                </section>
              )}
            </>)}
          </div>
        </aside>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
