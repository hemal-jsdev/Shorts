import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '../components/layout/Navbar';

export const metadata: Metadata = {
  title: 'YouTube Shorts & Instagram Reels — Cloudflare Stream Player',
  description: 'Ultra-fast, adaptive HLS video streaming shorts player powered by Next.js and Cloudflare Stream.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0f0f0f] text-white antialiased">
        <Navbar />
        <main className="w-full h-[calc(100dvh-3.5rem)] mt-14 overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
