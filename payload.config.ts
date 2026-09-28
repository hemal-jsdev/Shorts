import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import { buildConfig } from 'payload';
import { fileURLToPath } from 'url';
import dns from 'node:dns';

// Resolve MongoDB Atlas SRV records reliably across all local network/ISP environments
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
}

import { Users } from './collections/Users';
import { Reels } from './collections/Reels';
import { Comments } from './collections/Comments';
import { Media } from './collections/Media';
import { Ads } from './collections/Ads';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// ── Conditionally load Payload S3 storage plugin ──────────────────────────────
// When AWS credentials are configured the Media collection's files are stored
// in S3 under the "videos/" prefix. Without credentials the plugin is simply
// omitted and Payload falls back to local disk (public/media/).
const buildPlugins = async () => {
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_S3_BUCKET,
    AWS_REGION,
    AWS_S3_ENDPOINT,
  } = process.env;

  const hasS3 = Boolean(
    AWS_ACCESS_KEY_ID &&
      !AWS_ACCESS_KEY_ID.includes('your_') &&
      AWS_SECRET_ACCESS_KEY &&
      !AWS_SECRET_ACCESS_KEY.includes('your_') &&
      AWS_S3_BUCKET &&
      !AWS_S3_BUCKET.includes('your-')
  );

  if (!hasS3) return [];

  const { s3Storage } = await import('@payloadcms/storage-s3');
  return [
    s3Storage({
      collections: {
        // Route all Media collection uploads to S3 under "videos/" folder
        media: {
          prefix: 'videos',
        },
      },
      bucket: AWS_S3_BUCKET!,
      config: {
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID!,
          secretAccessKey: AWS_SECRET_ACCESS_KEY!,
        },
        region: AWS_REGION || 'us-east-1',
        ...(AWS_S3_ENDPOINT?.trim()
          ? { endpoint: AWS_S3_ENDPOINT.trim(), forcePathStyle: true }
          : {}),
      },
      acl: 'private',
    }),
  ];
};

export default buildConfig({
  admin: {
    user: Users.slug,
    theme: 'dark',
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: '— Shorts CMS',
    },
    components: {
      beforeNavLinks: ['@/components/admin/AdminUrlCleaner#default'],
    },
  },
  collections: [Users, Reels, Comments, Media, Ads],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'a8f29d71c9b3e512401f893e2b9c7d41f02e8471b659c238',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.MONGODB_URI || '',
  }),
  plugins: await buildPlugins(),
});
