import type { CollectionConfig } from 'payload';
import { deleteFromS3 } from '@/lib/s3';

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'prefix', 'filesize', 'mimeType', 'createdAt'],
    description: 'Master video files and media assets archived in AWS S3 under the "videos/" folder.',
  },
  upload: {
    staticDir: 'public/media',
    mimeTypes: ['image/*', 'video/*'],
    adminThumbnail: ({ doc }: any) => {
      return (
        doc?.thumbnailURL ||
        doc?.thumbnailUrl ||
        (doc?.streamUid
          ? `https://customer-d3tadt8nvkirw68k.cloudflarestream.com/${doc.streamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`
          : null)
      );
    },
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  hooks: {
    afterRead: [
      async ({ doc, req }) => {
        if (!doc) return doc;
        if (!doc.thumbnailURL && doc.filename) {
          if (doc.thumbnailUrl) {
            doc.thumbnailURL = doc.thumbnailUrl;
            return doc;
          }
          try {
            const db = (req?.payload?.db as any)?.connection?.db;
            if (db) {
              const reel = await db.collection('reels').findOne({
                $or: [
                  { s3Key: `videos/${doc.filename}` },
                  { s3Key: doc.filename },
                ],
              });
              if (reel?.thumbnailUrl) {
                doc.thumbnailURL = reel.thumbnailUrl;
                doc.thumbnailUrl = reel.thumbnailUrl;
                if (reel.streamUid) doc.streamUid = reel.streamUid;
                if (reel.hlsUrl) doc.hlsUrl = reel.hlsUrl;
              }
            }
          } catch {}
        }
        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        if (!doc) return;

        const filename = doc.filename;
        const prefix = doc.prefix || 'videos';
        const s3Key = prefix ? `${prefix}/${filename}` : filename;

        console.log(`[Media afterDelete] Initiating cascade deletion for: ${filename}`);

        let streamUid = doc.streamUid;
        const db = (req?.payload?.db as any)?.connection?.db;

        if (db) {
          try {
            const linkedReels = await db.collection('reels').find({
              $or: [
                { s3Key },
                { s3Key: `videos/${filename}` },
                { s3Key: filename },
                ...(streamUid ? [{ streamUid }] : []),
              ],
            }).toArray();

            for (const reel of linkedReels) {
              if (!streamUid && reel.streamUid) {
                streamUid = reel.streamUid;
              }
              await db.collection('comments').deleteMany({ reel: reel._id });
              console.log(`[Media afterDelete] ✅ Deleted comments for Reel: ${reel._id}`);
            }

            if (linkedReels.length > 0) {
              const reelIds = linkedReels.map((r: any) => r._id);
              await db.collection('reels').deleteMany({ _id: { $in: reelIds } });
              console.log(`[Media afterDelete] ✅ Deleted ${linkedReels.length} associated Reel(s)`);
            }
          } catch (reelErr) {
            console.warn('[Media afterDelete] Error deleting associated Reel:', reelErr);
          }
        }

        if (streamUid) {
          try {
            const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
            const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
            if (accountId && apiToken) {
              const cfRes = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}`,
                {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${apiToken}` },
                }
              );
              if (cfRes.ok) {
                console.log(`[Media afterDelete] ✅ Deleted Cloudflare Stream video: ${streamUid}`);
              } else {
                console.warn(`[Media afterDelete] Cloudflare Stream delete returned status: ${cfRes.status}`);
              }
            }
          } catch (cfErr) {
            console.warn('[Media afterDelete] Cloudflare Stream cleanup failed:', cfErr);
          }
        }

        if (s3Key) {
          try {
            await deleteFromS3(s3Key);
            console.log(`[Media afterDelete] ✅ Deleted master video from S3: ${s3Key}`);
          } catch (s3Err) {
            console.warn('[Media afterDelete] S3 cleanup failed:', s3Err);
          }
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Title / Caption',
    },
    {
      name: 'thumbnailUrl',
      type: 'text',
      label: 'Thumbnail URL',
      admin: {
        description: 'Cloudflare Stream or video poster thumbnail.',
      },
    },
    {
      name: 'streamUid',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'hlsUrl',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
  ],
};
