import { withPayload } from '@payloadcms/next/withPayload';

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['youtubei.js', 'ffmpeg-static', 'sharp'],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'swiftness-overview-kinswoman.ngrok-free.dev',
        'localhost:3000',
      ],
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'swiftness-overview-kinswoman.ngrok-free.dev' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'videodelivery.net' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
    ],
  },
};

export default withPayload(nextConfig);
