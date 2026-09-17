import dns from 'node:dns';
import { MongoClient } from 'mongodb';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://whiteturtle1_db_user:admin4488@cluster0.03n0jpk.mongodb.net/insta_shorts?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  console.log('🔄 Connecting to MongoDB Atlas...');
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db('insta_shorts');

  // 1. Locate the primary Admin user
  const adminUser = await db.collection('users').findOne({ role: 'admin' });
  if (!adminUser) {
    console.error('❌ Error: No user with role "admin" was found.');
    await client.close();
    process.exit(1);
  }

  console.log(`✅ Admin user identified: ${adminUser.email} (ID: ${adminUser._id})`);

  // 2. Locate all non-admin users
  const nonAdminUsers = await db.collection('users').find({ _id: { $ne: adminUser._id } }).toArray();
  const nonAdminIds = nonAdminUsers.map((u) => u._id);

  if (nonAdminIds.length === 0) {
    console.log('ℹ️ No other users found in the database. Only Admin exists.');
    await client.close();
    return;
  }

  console.log(`\nFound ${nonAdminUsers.length} non-admin user(s) to remove:`);
  for (const u of nonAdminUsers) {
    console.log(`  - [${u.role || 'user'}] ${u.username} (${u.email}) [ID: ${u._id}]`);
  }

  // 3. Reassign all Reels belonging to deleted users to the Admin
  const reelsUpdate = await db.collection('reels').updateMany(
    { author: { $in: nonAdminIds } },
    { $set: { author: adminUser._id } }
  );
  console.log(`\n📦 Reassigned ${reelsUpdate.modifiedCount} reel(s) to Admin to prevent orphaned references.`);

  // 4. Reassign all Comments to the Admin
  const commentsUpdate = await db.collection('comments').updateMany(
    { user: { $in: nonAdminIds } },
    { $set: { user: adminUser._id } }
  );
  console.log(`💬 Reassigned ${commentsUpdate.modifiedCount} comment(s) to Admin.`);

  // 5. Delete non-admin users
  const deleteResult = await db.collection('users').deleteMany({
    _id: { $in: nonAdminIds },
  });
  console.log(`🗑️ Deleted ${deleteResult.deletedCount} non-admin user(s) from 'users' collection.`);

  // 6. Verify remaining users
  const remaining = await db.collection('users').find({}).toArray();
  console.log(`\n🎉 Database cleanup complete! Remaining user(s): ${remaining.length}`);
  for (const u of remaining) {
    console.log(`  - [${u.role}] ${u.username} (${u.email})`);
  }

  await client.close();
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
