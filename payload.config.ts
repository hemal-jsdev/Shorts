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
  // Ignore if restricted by environment
}

import { Users } from './collections/Users';
import { Reels } from './collections/Reels';
import { Comments } from './collections/Comments';
import { Media } from './collections/Media';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

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
  collections: [Users, Reels, Comments, Media],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'a8f29d71c9b3e512401f893e2b9c7d41f02e8471b659c238',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.MONGODB_URI || '',
  }),
});
