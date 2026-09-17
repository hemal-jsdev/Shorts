import fs from 'fs';
import dns from 'dns';

if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
  process.loadEnvFile();
}

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

import { getPayload } from 'payload';
import config from '../payload.config';

async function seed() {
  console.log('🌱 Starting Payload CMS database seed...');
  const payload = await getPayload({ config });

  // 1. Create or ensure Admin user
  const adminEmail = 'admin@instashorts.com';
  const existingAdmin = await payload.find({
    collection: 'users',
    where: { email: { equals: adminEmail } },
  });

  let adminUser: any;
  if (existingAdmin.docs.length === 0) {
    adminUser = await payload.create({
      collection: 'users',
      data: {
        email: adminEmail,
        password: 'AdminPassword123!',
        username: 'admin',
        displayName: 'Administrator',
        role: 'admin',
        isVerified: true,
      },
    });
    console.log(`✅ Created Admin user: ${adminEmail} (password: AdminPassword123!)`);
  } else {
    adminUser = existingAdmin.docs[0];
    console.log(`ℹ️ Admin user already exists: ${adminEmail}`);
  }

  // 2. Seed the 4 YouTube shorts (authored by Admin)
  const shortsData = [
    {
      streamUid: 'dMM9-4pl8Cs',
      caption: 'Best Corporate Standup Comedy Act 😂 | Pranav Sharma #standupcomedy #shorts',
      author: adminUser.id,
    },
    {
      streamUid: 'XL4reQVUr80',
      caption: 'When engineers try to explain simple concepts 👨‍💻 Only Stand-Up #programming #comedy',
      author: adminUser.id,
    },
    {
      streamUid: 'xpvUNNoxxU8',
      caption: 'Mumbai Traffic vs Bangalore Traffic Debate 🚗 Pranav Sharma Stand-up #metro #citylife',
      author: adminUser.id,
    },
    {
      streamUid: 's1nKI9_mhAM',
      caption: 'Relatable Moments with Parents and Technology 😂 Only Stand-Up #family #comedy',
      author: adminUser.id,
    },
  ];

  for (const s of shortsData) {
    const existing = await payload.find({
      collection: 'reels',
      where: { streamUid: { equals: s.streamUid } },
    });

    if (existing.docs.length === 0) {
      await payload.create({
        collection: 'reels',
        data: {
          caption: s.caption,
          videoSource: 'youtube',
          streamUid: s.streamUid,
          hlsUrl: `https://www.youtube.com/shorts/${s.streamUid}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${s.streamUid}/hqdefault.jpg`,
          status: 'ready',
          author: s.author,
        },
      });
      console.log(`✅ Seeded Reel: ${s.streamUid} (${s.caption.substring(0, 30)}...)`);
    } else {
      console.log(`ℹ️ Reel already exists: ${s.streamUid}`);
    }
  }

  console.log('\n🎉 Seed complete! You can now log into /admin with:');
  console.log('   Email:    admin@instashorts.com');
  console.log('   Password: AdminPassword123!\n');
  setTimeout(() => process.exit(0), 100);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
