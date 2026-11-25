'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BUILTIN_FONTS, Brand, CREDIT_ROLES, FontOption, H, LogoPos, PAGE_TYPES, PAGE_TYPE_BADGE, PageType, Slide, SlideTypeFields, TEMPLATES, W, getTemplate, newSlide,
} from '@/lib/types';
import { CustomPaletteColors, PALETTES, autoTextForBg, getPalette } from '@/lib/palettes';
import { renderSlide } from '@/lib/render';
import { Fmt, downloadAll, downloadOne } from '@/lib/export';
import {
  AiMode,
  GenerateStreamEvent,
  GeneratedCarouselPlan,
  ProgressStepId,
  SAMPLE_NEWS_ARTICLE,
  SlideCountMode,
  StreamPreviewState,
  VerbatimLayoutStyle,
  WordCountMode,
  planToSlides,
} from '@/lib/autoLayout';

const PIPELINE_STEPS: { id: ProgressStepId; label: string }[] = [
  { id: 'validate', label: 'Validasi & Kredit' },
  { id: 'connect', label: 'Koneksi Model' },
  { id: 'streaming', label: 'Generasi Slide' },
  { id: 'layout', label: 'Uji Kanvas' },
  { id: 'done', label: 'Selesai' },
];
const STEP_ORDER: Record<ProgressStepId, number> = {
  validate: 0,
  connect: 1,
  streaming: 2,
  layout: 3,
  done: 4,
};

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

/** Logo A✦ sesuai identitas desain Articall */
function ArticallMark() {
  return (
    <svg width="38" height="36" viewBox="0 0 44 42" fill="none" aria-hidden="true">
      <path d="M21 5L7 37H12.2L21 16.2L29.8 37H35L21 5Z" fill="#FFFFFF" />
      <path d="M23.6 15.5L31.8 35H27.4L21.3 20.6L23.6 15.5Z" fill="#1877DF" />
      <rect x="13" y="25.5" width="14.5" height="3.6" rx="1.2" fill="#FFFFFF" />
      <path d="M34.5 4L35.9 8.1L40 9.5L35.9 10.9L34.5 15L33.1 10.9L29 9.5L33.1 8.1L34.5 4Z" fill="#FFFFFF" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

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

  // Alur 2 tahap: 1) Chatbox input artikel -> 2) Editor kustomisasi
  const [stage, setStage] = useState<'chatbox' | 'editor'>('chatbox');
  const [aiMode, setAiMode] = useState<AiMode>('verbatim');
  const [articleText, setArticleText] = useState('');
  const [aiSlideCount, setAiSlideCount] = useState<SlideCountMode>('auto');
  const [aiWordCount, setAiWordCount] = useState<WordCountMode>('sedang');
  const [aiInstruction, setAiInstruction] = useState('');
  const [layoutStyle, setLayoutStyle] = useState<VerbatimLayoutStyle>('varied');
  const [igHandle, setIgHandle] = useState('@akunmedia');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiNeedsKey, setAiNeedsKey] = useState(false);
  const [aiNote, setAiNote] = useState('');

  // State progress real-time & log sistem (untuk user & presentasi dev)
  const [progStep, setProgStep] = useState<ProgressStepId>('validate');
  const [progPercent, setProgPercent] = useState(0);
  const [progMsg, setProgMsg] = useState('');
  const [progLogs, setProgLogs] = useState<{ time: string; text: string }[]>([]);
  const [progPreview, setProgPreview] = useState<StreamPreviewState | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showDevLog, setShowDevLog] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [infoModal, setInfoModal] = useState<'none' | 'paket' | 'blog'>('none');
  const [lastRunSummary, setLastRunSummary] = useState<{
    modelUsed: string;
    durationSec: string;
    slideTotal: number;
  } | null>(null);

  const cvRef = useRef<HTMLCanvasElement>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);
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
  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2800); }, []);

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
    if (stage !== 'editor' || !cvRef.current) return;
    setOver(renderSlide(cvRef.current.getContext('2d')!, s, brand).over);
  }, [s, brand, rev, stage]);
  useEffect(() => { document.fonts?.ready.then(() => setRev(r => r + 1)); }, []);

  // Panah kiri/kanan = pindah halaman (kecuali sedang mengetik atau di chatbox/modal)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stage !== 'editor' || showLogModal || infoModal !== 'none') return;
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft') setCur(c => Math.max(0, c - 1));
      if (e.key === 'ArrowRight') setCur(c => Math.min(slides.length - 1, c + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, stage, showLogModal, infoModal]);

  // Stopwatch waktu berjalan saat proses AI berlangsung
  useEffect(() => {
    if (!aiBusy) return;
    const t0 = Date.now();
    setElapsedSec(0);
    const id = setInterval(() => setElapsedSec((Date.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [aiBusy]);

  // Auto-scroll kotak log teknis setiap ada baris log baru
  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [progLogs]);

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

  const generateFromArticle = async (useFallback = false) => {
    if (!articleText.trim()) {
      setAiError('Tempelkan atau ketik artikel terlebih dahulu.');
      return;
    }
    setAiError('');
    setAiNeedsKey(false);
    setAiNote('');
    setProgStep('validate');
    setProgPercent(5);
    setProgMsg('Menyiapkan permintaan pemrosesan artikel…');
    setProgPreview(null);
    setProgLogs([{ time: '+0.00d', text: `Memulai pipeline (${aiMode === 'verbatim' ? 'Mode 1 · Verbatim' : useFallback ? 'Simulasi Lokal' : 'Mode 2 · Gemini AI'})…` }]);
    setAiBusy(true);

    try {
      const penutupHandle = igHandle.trim() || slides.find(x => x.type === 'penutup')?.handle || '@akunmedia';
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: articleText,
          article: articleText,
          mode: aiMode,
          slideCount: aiSlideCount,
          wordCount: aiWordCount,
          context: aiInstruction,
          instruction: aiInstruction,
          layoutStyle,
          handle: penutupHandle,
          useFallback,
          stream: true,
        }),
      });

      if (!res.ok && !res.headers.get('content-type')?.includes('ndjson')) {
        const data = await res.json().catch(() => ({}));
        if (data?.needsKey) setAiNeedsKey(true);
        throw new Error(data?.error || 'Gagal memproses artikel.');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming respons tidak tersedia di browser ini.');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: Extract<GenerateStreamEvent, { type: 'result' }> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          const ev = JSON.parse(line) as GenerateStreamEvent;
          if (ev.type === 'progress') {
            setProgStep(ev.step);
            setProgPercent(ev.percent);
            setProgMsg(ev.message);
            if (ev.preview) setProgPreview(ev.preview);
            if (ev.log) {
              const sec = (ev.elapsedMs / 1000).toFixed(2);
              setProgLogs(prev => [...prev, { time: `+${sec}d`, text: ev.log! }]);
            }
          } else if (ev.type === 'error') {
            if (ev.needsKey) setAiNeedsKey(true);
            const sec = (ev.elapsedMs / 1000).toFixed(2);
            setProgLogs(prev => [...prev, { time: `+${sec}d`, text: `✗ Gagal: ${ev.error}` }]);
            throw new Error(ev.error);
          } else if (ev.type === 'result') {
            finalResult = ev;
          }
        }
      }

      if (!finalResult) {
        throw new Error('Aliran respons selesai tanpa data hasil layout.');
      }

      const nextSlides = planToSlides(finalResult.plan, s);
      const durationSec = (finalResult.durationMs / 1000).toFixed(2);
      setLastRunSummary({
        modelUsed: finalResult.modelUsed || finalResult.source,
        durationSec,
        slideTotal: nextSlides.length,
      });
      setElapsedSec(finalResult.durationMs / 1000);

      // Jeda singkat di 100% agar user/audiens melihat status tuntas sebelum pindah ke editor
      await new Promise(r => setTimeout(r, 450));

      setSlides(nextSlides);
      setCur(0);
      setStage('editor');
      say(
        finalResult.source === 'fallback'
          ? `${nextSlides.length} halaman dibuat (${durationSec}d · simulasi lokal)`
          : `${nextSlides.length} halaman selesai di-layout dalam ${durationSec}d`,
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses artikel.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <>
      <header className="top-nav">
        <div className="nav-left">
          <button
            type="button"
            className="logo-btn"
            onClick={() => setStage('chatbox')}
            title="Articall – Halaman Input Artikel"
            aria-label="Articall Beranda"
          >
            <ArticallMark />
          </button>
          {stage === 'editor' && (
            <span className="crumb">Slide {cur + 1} / {slides.length}</span>
          )}
        </div>

        <nav className="nav-links" aria-label="Navigasi Utama">
          <button
            type="button"
            className={stage === 'editor' && tab === 'template' ? 'on' : ''}
            onClick={() => { setStage('editor'); setTab('template'); }}
          >
            Template
          </button>
          <button
            type="button"
            className={infoModal === 'paket' ? 'on' : ''}
            onClick={() => setInfoModal('paket')}
          >
            Paket
          </button>
          <button
            type="button"
            className={infoModal === 'blog' ? 'on' : ''}
            onClick={() => setInfoModal('blog')}
          >
            Blog
          </button>
        </nav>

        <div className="nav-right">
          {stage === 'chatbox' ? (
            <button type="button" className="btn ghost-pill" onClick={() => setStage('editor')}>
              Editor Manual →
            </button>
          ) : (
            <>
              {progLogs.length > 0 && (
                <button
                  type="button"
                  className="log-pill"
                  onClick={() => setShowLogModal(true)}
                  title="Lihat rincian eksekusi & log sistem"
                >
                  🖥 Log Sistem{lastRunSummary ? ` · ${lastRunSummary.durationSec}d` : ''}
                </button>
              )}
              <button type="button" className="btn ghost-pill" onClick={() => setStage('chatbox')}>
                ← Artikel Baru
              </button>
              <select
                className="fmt"
                value={fmt}
                onChange={e => setFmt(e.target.value as Fmt)}
                aria-label="Format unduhan"
              >
                <option value="jpeg">JPG</option>
                <option value="png">PNG</option>
              </select>
              <button
                type="button"
                className="btn ghost-pill"
                disabled={busy}
                onClick={() => run(() => downloadOne(s, cur, brand, fmt), 'Halaman terunduh')}
              >
                Halaman Ini
              </button>
              <button
                type="button"
                className="btn primary pill-cta"
                disabled={busy}
                onClick={() => run(() => downloadAll(slides, brand, fmt), 'Semua halaman terunduh (ZIP)')}
              >
                {busy ? 'Memproses…' : 'Download Semua'}
              </button>
            </>
          )}
        </div>
      </header>

      {stage === 'chatbox' ? (
        <main className="hero-wrap">
          <section className="hero-shell">
            <h1 className="hero-headline">
              Punya ide tapi kalo gabisa<br />disampaikan ya percuma!!!
            </h1>

            {/* Kartu 1: Komposer Artikel Utama */}
            <div className="composer-card">
              <div className="composer-util">
                <span className="mode-hint">
                  {aiMode === 'verbatim'
                    ? 'Mode 1 · 100% teks asli artikel tanpa perubahan kata'
                    : 'Mode 2 · Diolah Gemini AI (kutipan, kredit & variasi slide)'}
                </span>
                <div className="util-btns">
                  <button type="button" className="util-chip" onClick={() => setArticleText(SAMPLE_NEWS_ARTICLE)}>
                    📋 Contoh Artikel
                  </button>
                  {articleText.trim().length > 0 && (
                    <button type="button" className="util-chip" onClick={() => setArticleText('')}>
                      Bersihkan
                    </button>
                  )}
                </div>
              </div>

              <textarea
                className="composer-textarea"
                rows={5}
                value={articleText}
                placeholder="Masukkan artikel anda yang ingin dijadikan postingan........"
                onChange={e => setArticleText(e.target.value)}
              />

              <div className="composer-bar">
                <div className="composer-pills">
                  <div className="pill-wrap">
                    <select
                      className="pill-select"
                      value={aiMode}
                      onChange={e => setAiMode(e.target.value as AiMode)}
                      aria-label="Mode pemrosesan artikel"
                    >
                      <option value="verbatim">Mode 1 · Teks Asli</option>
                      <option value="ai">Mode 2 · Gemini AI</option>
                    </select>
                  </div>

                  {aiMode === 'ai' ? (
                    <>
                      <div className="pill-wrap">
                        <select
                          className="pill-select"
                          value={aiSlideCount}
                          onChange={e => setAiSlideCount(e.target.value as SlideCountMode)}
                          aria-label="Target jumlah slide"
                        >
                          <option value="auto">Berapa slide?</option>
                          <option value="2">2 Slide Isi</option>
                          <option value="3">3 Slide Isi</option>
                          <option value="4">4 Slide Isi</option>
                          <option value="5">5 Slide Isi</option>
                          <option value="6">6 Slide Isi</option>
                        </select>
                      </div>
                      <div className="pill-wrap">
                        <select
                          className="pill-select"
                          value={aiWordCount}
                          onChange={e => setAiWordCount(e.target.value as WordCountMode)}
                          aria-label="Kepadatan kata per slide"
                        >
                          <option value="singkat">Singkat (20–30 kata)</option>
                          <option value="sedang">Sedang (40–50 kata)</option>
                          <option value="panjang">Panjang (60–80 kata)</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="pill-wrap">
                      <select
                        className="pill-select"
                        value={layoutStyle}
                        onChange={e => setLayoutStyle(e.target.value as VerbatimLayoutStyle)}
                        aria-label="Gaya auto-layout"
                      >
                        <option value="varied">Variasi Semua Layout</option>
                        <option value="text-focused">Fokus Teks Penuh</option>
                      </select>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="create-btn"
                  disabled={aiBusy}
                  onClick={() => generateFromArticle(false)}
                >
                  {aiBusy ? `Memproses (${progPercent}%)…` : 'Create'}
                </button>
              </div>
            </div>

            {/* Kartu 2: Perspektif / Konteks Tambahan */}
            <div className="extra-card">
              <div className="extra-head">
                <span className="extra-label">Apakah anda ada hal yang harus ditambahkan?</span>
                <label className="handle-inline" title="Username akun untuk slide penutup">
                  <span>Akun IG:</span>
                  <input
                    type="text"
                    value={igHandle}
                    placeholder="@akunmedia"
                    onChange={e => setIgHandle(e.target.value)}
                  />
                </label>
              </div>
              <textarea
                className="extra-input"
                rows={2}
                value={aiInstruction}
                placeholder="Masukkan perspektif tambahan dari anda...."
                onChange={e => setAiInstruction(e.target.value)}
              />
            </div>

            {/* Panel Progress Real-Time & Log Sistem (muncul saat/setelah proses) */}
            {(aiBusy || progLogs.length > 0) && (
              <div className={`prog-card hero-prog${aiBusy ? ' running' : ''}`} aria-live="polite">
                <div className="prog-head">
                  <div className="prog-status">
                    <span className={`prog-dot${aiBusy ? ' pulse' : progPercent === 100 && !aiError ? ' ok' : ' err'}`} />
                    <b>{progMsg || 'Menunggu proses…'}</b>
                  </div>
                  <div className="prog-meta">
                    <span className="prog-time">{elapsedSec.toFixed(1)} dtk</span>
                    <span className="prog-pct">{progPercent}%</span>
                  </div>
                </div>

                <div className="prog-track">
                  <div className={`prog-fill${aiBusy ? ' shimmer' : ''}`} style={{ width: `${progPercent}%` }} />
                </div>

                <div className="prog-steps">
                  {PIPELINE_STEPS.map((st, idx) => {
                    const curIdx = STEP_ORDER[progStep];
                    const state = progPercent === 100 || idx < curIdx ? 'done' : idx === curIdx && aiBusy ? 'active' : 'idle';
                    return (
                      <div key={st.id} className={`pstep ${state}`}>
                        <i>{state === 'done' ? '✓' : idx + 1}</i>
                        <span>{st.label}</span>
                      </div>
                    );
                  })}
                </div>

                {progPreview && (progPreview.cover || progPreview.slides.length > 0) && (
                  <div className="prog-preview">
                    {progPreview.cover && (
                      <div className="pp-cover">
                        <small>{progPreview.kicker || 'COVER'}</small>
                        <span>{progPreview.cover}</span>
                      </div>
                    )}
                    {progPreview.slides.length > 0 && (
                      <div className="pp-slides">
                        {progPreview.slides.map((sl, i) => (
                          <span key={i} className="pp-chip">
                            <b>#{i + 1} · {sl.template}</b> {sl.title}
                          </span>
                        ))}
                        {progPreview.hasOutro && <span className="pp-chip ok">✓ Penutup</span>}
                      </div>
                    )}
                  </div>
                )}

                <div className="prog-log-head">
                  <button type="button" className="log-toggle" onClick={() => setShowDevLog(v => !v)}>
                    {showDevLog ? '▾ Sembunyikan' : '▸ Tampilkan'} Log Proses Sistem ({progLogs.length} event)
                  </button>
                </div>
                {showDevLog && (
                  <div className="prog-log" ref={logBoxRef}>
                    {progLogs.map((l, idx) => (
                      <div key={idx} className="log-line">
                        <code>{l.time}</code>
                        <span>{l.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aiNote && <p className="tip hero-alert">{aiNote}</p>}
            {aiError && (
              <div className="warn hero-alert">
                <p style={{ margin: 0 }}>⚠ {aiError}</p>
                {aiNeedsKey && (
                  <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={() => generateFromArticle(true)}>
                    Gunakan Simulasi Lokal (Tanpa API Key)
                  </button>
                )}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="app">
          {/* ===== Kolom Kiri: Preview Mengambang + Tombol Aksi + Filmstrip ===== */}
          <section className="stage">
            <div className="canvas-wrap">
              <canvas ref={cvRef} id="cv" width={W} height={H} />
            </div>
            {over && (
              <p className="warn center">
                ⚠ Teks terlalu panjang untuk template ini, sebagian dipotong. Persingkat atau pilih template teks penuh.
              </p>
            )}

            <div className="stage-actions">
              <button
                type="button"
                className="sbtn"
                onClick={() => setCur(c => Math.max(0, c - 1))}
                disabled={cur === 0}
              >
                &lt; Prev
              </button>
              <button
                type="button"
                className="sbtn"
                onClick={() => setCur(c => Math.min(slides.length - 1, c + 1))}
                disabled={cur === slides.length - 1}
              >
                Next &gt;
              </button>
              <button type="button" className="sbtn" onClick={dup}>
                Duplicate
              </button>
              <button
                type="button"
                className="sbtn danger-solid"
                onClick={del}
                disabled={slides.length < 2}
                title="Hapus halaman ini"
                aria-label="Hapus halaman ini"
              >
                <TrashIcon />
              </button>
              <span className="sbtn-sep" aria-hidden="true" />
              <button
                type="button"
                className="sbtn ghost"
                onClick={() => move(-1)}
                disabled={cur === 0}
                title="Geser urutan slide ke kiri"
              >
                ← Geser
              </button>
              <button
                type="button"
                className="sbtn ghost"
                onClick={() => move(1)}
                disabled={cur === slides.length - 1}
                title="Geser urutan slide ke kanan"
              >
                Geser →
              </button>
            </div>

            <ol className="strip">
              {slides.map((sl, i) => (
                <li key={sl.id} className={i === cur ? 'active' : ''} onClick={() => setCur(i)}>
                  <Thumb slide={sl} brand={brand} w={92} rev={rev} />
                  <b>{i + 1} · {PAGE_TYPE_BADGE[sl.type]}</b>
                </li>
              ))}
              <li className="add" onClick={add} title="Tambah halaman">
                <span>＋</span>
                <small>Tambah</small>
              </li>
            </ol>
          </section>

          {/* ===== Kolom Kanan: Kartu Kustomisasi Mengambang ===== */}
          <aside className="panel">
            <nav className="tabs" role="tablist">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'on' : ''}
                  onClick={() => setTab(t.id)}
                >
                  <i>{t.n}</i>{t.label}
                </button>
              ))}
            </nav>

            <div className="tab-body">
              {tab === 'template' && (<>
                <button type="button" className="ai-banner" onClick={() => setStage('chatbox')}>
                  ← Ganti / Proses Artikel Baru <b>Buka Chatbox →</b>
                </button>
                <section>
                  <h2>Jenis halaman</h2>
                  <div className="seg">
                    {PAGE_TYPES.map(t => (
                      <button key={t.id} type="button" className={s.type === t.id ? 'on' : ''} onClick={() => changeType(t.id)}>{t.label}</button>
                    ))}
                  </div>
                </section>
                <section>
                  <h2>Pilih template</h2>
                  <div className="tpl">
                    {TEMPLATES[s.type].map(t => (
                      <button key={`${s.type}-${t.id}`} type="button" className={s.template === t.id ? 'on' : ''} onClick={() => patch({ template: t.id })}>
                        <Thumb slide={s} template={t.id} brand={brand} w={120} rev={rev} />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <button type="button" className="next" onClick={() => setTab('isi')}>Lanjut: isi konten →</button>
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
                          <button type="button" className="x" title="Hapus baris" onClick={() => patch({ credits: s.credits.filter((_, j) => j !== i) })}>×</button>
                        </div>
                      ))}
                    </div>
                    {s.credits.length < 4 && (
                      <button type="button" className="btn small" onClick={() => patch({ credits: [...s.credits, { role: 'Editor', name: '' }] })}>＋ Tambah baris</button>
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
                        <button type="button" className="btn small" onClick={() => patch({ zoom: 1, px: 0, py: 0 })}>Reset posisi foto</button>
                      </>)}
                    </>)}
                    {has('qr') && (
                      <ImagePicker label="Gambar QR" hint="Klik atau seret gambar QR" value={s.qr}
                        onFile={im => patch({ qr: im })} onClear={() => patch({ qr: null })} />
                    )}
                  </section>
                )}
                <button type="button" className="next" onClick={() => setTab('gaya')}>Lanjut: atur gaya →</button>
              </>)}

              {tab === 'gaya' && (<>
                <section>
                  <h2>Palet warna <small>halaman {cur + 1}</small></h2>
                  {(['dark', 'light'] as const).map(mode => (
                    <div key={mode}>
                      <p className="sub">{mode === 'dark' ? 'Gelap' : 'Terang'}</p>
                      <div className="pal">
                        {PALETTES.filter(p => p.mode === mode).map(p => (
                          <button key={p.id} type="button" className={s.palette === p.id ? 'on' : ''} title={p.name}
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
                      <button type="button" className="btn small" onClick={() => {
                        const auto = autoTextForBg(curPal.bg);
                        setCustomColor({ fg: auto.fg, sub: auto.sub }, true);
                      }}>Sesuaikan kontras teks otomatis</button>
                      <button type="button" className="btn small" onClick={() => {
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
                    <button type="button" className="btn small" onClick={() => setShowCustomFont(v => !v)}>
                      {showCustomFont ? 'Tutup Font Custom' : '＋ Tambah Font Custom'}
                    </button>
                    <button type="button" className="btn small" onClick={() => {
                      setSlides(a => a.map(x => ({
                        ...x, pageFont: s.pageFont, titleFont: s.titleFont, bodyFont: s.bodyFont, metaFont: s.metaFont,
                      })));
                      say('Font diterapkan ke semua halaman');
                    }}>Terapkan font halaman ini ke semua halaman</button>
                  </div>

                  {showCustomFont && (
                    <div className="custom-font-box">
                      <button type="button" className="btn small" onClick={() => fontFileRef.current?.click()}>
                        Unggah File Font (.ttf / .otf / .woff / .woff2)
                      </button>
                      <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" hidden
                        onChange={e => { onUploadFont(e.target.files?.[0]); e.target.value = ''; }} />
                      <div className="gfont-row">
                        <input type="text" value={fontNameInput} placeholder="Nama Google Font / font lokal (mis. Bebas Neue)"
                          onChange={e => setFontNameInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') onAddGoogleFont(); }} />
                        <button type="button" className="btn small primary" onClick={onAddGoogleFont}>Tambah</button>
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
                      <button key={p.id} type="button" className={s.logoPos === p.id ? 'on' : ''} onClick={() => patch({ logoPos: p.id })}>
                        <i className={`p-${p.id}`} /><span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="muted">Posisi bawah selalu berada tepat di atas judul.</p>
                  <button type="button" className="btn small" onClick={() => setSlides(a => a.map(x => ({ ...x, logoPos: s.logoPos })))}>
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
      )}

      {showLogModal && (
        <div className="modal-bg" onClick={() => setShowLogModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Log Proses Sistem" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>🖥 Rincian Eksekusi &amp; Log Sistem AI</h3>
                <p>
                  {lastRunSummary
                    ? `Engine: ${lastRunSummary.modelUsed} · Durasi: ${lastRunSummary.durationSec} detik · Output: ${lastRunSummary.slideTotal} halaman`
                    : 'Riwayat tahapan pemrosesan artikel terakhir'}
                </p>
              </div>
              <button type="button" className="close" onClick={() => setShowLogModal(false)} aria-label="Tutup">×</button>
            </div>
            <div className="modal-body">
              <div className="prog-steps" style={{ marginBottom: 14 }}>
                {PIPELINE_STEPS.map(st => (
                  <div key={st.id} className="pstep done">
                    <i>✓</i>
                    <span>{st.label}</span>
                  </div>
                ))}
              </div>
              <div className="prog-log modal-log">
                {progLogs.map((l, idx) => (
                  <div key={idx} className="log-line">
                    <code>{l.time}</code>
                    <span>{l.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn primary" onClick={() => setShowLogModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {infoModal !== 'none' && (
        <div className="modal-bg" onClick={() => setInfoModal('none')}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>{infoModal === 'paket' ? 'Paket Pemrosesan Articall' : 'Panduan & Tips Redaksi Carousel'}</h3>
                <p>{infoModal === 'paket' ? 'Pilih metode konversi artikel sesuai kebutuhan redaksi Anda' : 'Praktik terbaik mengubah berita panjang menjadi visual Instagram 4:5'}</p>
              </div>
              <button type="button" className="close" onClick={() => setInfoModal('none')} aria-label="Tutup">×</button>
            </div>
            <div className="modal-body info-cards">
              {infoModal === 'paket' ? (
                <>
                  <div className="info-item">
                    <b>Mode 1 · Verbatim Redaksi (Instan &amp; Tanpa Perubahan Kata)</b>
                    <p>Mempertahankan 100% kalimat asli naskah berita, mengekstrak baris Penulis/Penyunting/Layouter otomatis ke Cover, dan menata ke kanvas 1080×1350.</p>
                  </div>
                  <div className="info-item">
                    <b>Mode 2 · Gemini AI Carousel Engine</b>
                    <p>Menyusun narasi carousel terstruktur, membedakan kutipan langsung dengan atribusi biasa, menjaga kepadatan kata agar tidak terpotong di kanvas, serta menampilkan log streaming real-time.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="info-item">
                    <b>1. Gunakan Rasio Portrait 4:5 (1080×1350 px)</b>
                    <p>Ukuran resmi feed Instagram modern yang memaksimalkan ruang baca di layar ponsel dibandingkan rasio persegi 1:1.</p>
                  </div>
                  <div className="info-item">
                    <b>2. Pisahkan Kutipan Langsung dari Penyebutan Tokoh</b>
                    <p>Template Kutipan bekerja paling kuat untuk kalimat ber-tanda petik (&ldquo;…&rdquo;), sedangkan penyebutan narasumber tanpa kutipan lebih rapi di template Foto Atas atau Panel.</p>
                  </div>
                  <div className="info-item">
                    <b>3. Cantumkan Kredit Redaksi di Akhir Naskah</b>
                    <p>Tulis baris seperti <code>Penulis: …</code>, <code>Editor: …</code>, dan <code>Layouter: …</code> di bawah berita agar otomatis terisi pada slide Cover.</p>
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn primary" onClick={() => setInfoModal('none')}>Mengerti</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
