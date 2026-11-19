import Link from 'next/link';

const features = [
  ['Live Preview 1080×1350', 'Lihat hasil akhir secara langsung, sama persis dengan file unduhan.'],
  ['Variasi Template & Palet', '15 template layout untuk Cover, Isi Berita, dan Penutup, plus 9 palet warna gelap dan terang.'],
  ['Kunci Logo','Posisi logo terkunci di semua halaman, bahkan selalu di atas judul. Konsisten, tanpa geser-geser.'],
  ['Teks Selalu Terbaca', 'Gradasi gelap yang bisa diatur dan ukuran huruf tetap agar tampilan seragam.'],
  ['Crop & Zoom', 'Atur fokus foto tanpa aplikasi tambahan.'],
  ['Download Fleksibel', 'Unduh per halaman, atau semua sekaligus dalam satu ZIP.'],
];

export default function Home() {
  return (
    <main className="landing">
      <nav><b>Articall</b><Link className="btn primary" href="/editor">Buka Editor</Link></nav>
      <section className="hero">
        <h1>Dari artikel ke carousel Instagram<br />dalam hitungan menit.</h1>
        <p>Layout otomatis, branding konsisten. Tinggal isi teks dan foto, lalu download. Dibuat untuk jurnalis dan kreator media yang dikejar tenggat.</p>
        <Link className="btn primary big" href="/editor">Mulai Membuat →</Link>
      </section>
      <section className="grid">
        {features.map(([t, d]) => <div className="card" key={t}><h3>{t}</h3><p>{d}</p></div>)}
      </section>
      <footer>© 2026 Articall — PT. Dua Lima Teknologi</footer>
    </main>
  );
}

