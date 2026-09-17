import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { AdminCreatorStudio } from '@/components/admin/AdminCreatorStudio';

export const metadata = {
  title: 'Creator Studio | Instagram Shorts & Cloudflare Stream',
  description: 'Upload videos to Cloudflare Stream with HLS transcoding or paste YouTube Shorts links.',
};

export default function StudioPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 py-8 px-4 sm:px-6">
        <AdminCreatorStudio standalone={true} />
      </main>
    </div>
  );
}
