import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Articall – Layout Carousel Berita Instan',
  description: 'Ubah artikel berita menjadi carousel Instagram 1080×1350 yang rapi dan konsisten dalam hitungan menit.',
};

const GFONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Lora:ital,wght@0,400;0,600;0,700;1,600&family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&family=Montserrat:wght@400;500;600;700;800;900&family=Oswald:wght@500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GFONTS_URL} />
      </head>
      <body>{children}</body>
    </html>
  );
}
