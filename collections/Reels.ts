import type { CollectionConfig } from 'payload';

export const Reels: CollectionConfig = {
  slug: 'reels',
  admin: {
    useAsTitle: 'caption',
    defaultColumns: ['caption', 'author', 'status', 'hlsUrl', 'createdAt'],
    description: 'Manage short-form videos with Cloudflare Stream adaptive video streaming.',
  },
  defaultSort: '-createdAt',
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data) return data;

        // Auto-assign logged in user as author if not explicitly selected
        if (!data.author && req?.user?.id) {
          data.author = req.user.id;
        } else if (!data.author && operation === 'create') {
          try {
            const firstUser = await req.payload.find({ collection: 'users', limit: 1 });
            if (firstUser?.docs?.[0]?.id) {
              data.author = firstUser.docs[0].id;
            }
          } catch (_) {}
        }

        const isYouTube =
          data.videoSource === 'youtube' ||
          (data.hlsUrl && (data.hlsUrl.includes('youtube.com') || data.hlsUrl.includes('youtu.be')));

        if (isYouTube) {
          data.videoSource = 'youtube';
          if (!data.thumbnailUrl && data.streamUid) {
            data.thumbnailUrl = `https://i.ytimg.com/vi/${data.streamUid}/hqdefault.jpg`;
          }
          if (!data.animatedWebpUrl && data.thumbnailUrl) {
            data.animatedWebpUrl = data.thumbnailUrl;
          }
        } else {
          const domain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';
          if (data.streamUid && (!data.hlsUrl || data.hlsUrl === 'pending')) {
            data.hlsUrl = `https://${domain}/${data.streamUid}/manifest/video.m3u8`;
          }
        }

        if (!data.hlsUrl) {
          data.hlsUrl = 'pending';
        }
        return data;
      },
    ],
    beforeChange: [
      async ({ data }) => {
        if (!data) return data;

        const isYouTube =
          data.videoSource === 'youtube' ||
          (data.hlsUrl && (data.hlsUrl.includes('youtube.com') || data.hlsUrl.includes('youtu.be')));

        if (isYouTube) {
          data.videoSource = 'youtube';
          if (!data.thumbnailUrl && data.streamUid) {
            data.thumbnailUrl = `https://i.ytimg.com/vi/${data.streamUid}/hqdefault.jpg`;
          }
          if (!data.animatedWebpUrl && data.thumbnailUrl) {
            data.animatedWebpUrl = data.thumbnailUrl;
          }
        } else if (data.streamUid) {
          // Automatically populate videoUrl, thumbnailUrl, and gifUrl from streamUid for Cloudflare
          const domain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';
          data.videoSource = 'cloudflare';
          if (!data.hlsUrl || data.hlsUrl === 'pending') {
            data.hlsUrl = `https://${domain}/${data.streamUid}/manifest/video.m3u8`;
          }
          if (!data.thumbnailUrl) {
            data.thumbnailUrl = `https://${domain}/${data.streamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
          }
          if (!data.animatedWebpUrl) {
            data.animatedWebpUrl = `https://${domain}/${data.streamUid}/thumbnails/thumbnail.gif`;
          }
        }

        if (data.status) {
          data.status = String(data.status).toLowerCase();
        }

        return data;
      },
    ],
    afterDelete: [
      async ({ doc }) => {
        if (doc?.streamUid && doc?.videoSource !== 'youtube') {
          try {
            const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
            const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
            if (accountId && apiToken) {
              await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${doc.streamUid}`,
                {
                  method: 'DELETE',
                  headers: {
                    Authorization: `Bearer ${apiToken}`,
                  },
                }
              );
            }
          } catch (err) {
            console.warn('Cloudflare stream cleanup failed:', err);
          }
        }
      },
    ],
  },
  fields: [
    // ── SECTION 1: Cloudflare Direct Video Upload Widget ───────────────────
    {
      name: 'cloudflareUpload',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/admin/CloudflareVideoUpload#default',
        },
      },
    },

    // ── SECTION 2: Core Video Details ──────────────────────────────────────
    {
      name: 'caption',
      type: 'text',
      required: true,
      label: 'Caption / Video Title',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Author',
      defaultValue: ({ user }) => user?.id,
    },
    {
      name: 'status',
      type: 'select',
      label: 'Publishing Status',
      options: [
        { label: '✅ Ready (Live)', value: 'ready' },
        { label: '⏳ Processing', value: 'processing' },
        { label: '📝 Draft (Hidden)', value: 'draft' },
        { label: '❌ Failed', value: 'failed' },
      ],
      defaultValue: 'ready',
      required: true,
      admin: {
        description: 'Set to "Ready" once transcoding completes.',
      },
    },
    // Background properties kept hidden from admin view
    {
      name: 'videoSource',
      type: 'text',
      defaultValue: 'cloudflare',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'streamUid',
      type: 'text',
      admin: {
        hidden: true,
      },
    },

    // ── SECTION 3: The 3 Requested Clean URL Fields ─────────────────────────
    {
      name: 'hlsUrl',
      type: 'text',
      required: true,
      label: 'Video URL',
    },
    {
      name: 'thumbnailUrl',
      type: 'text',
      label: 'Thumbnail URL',
    },
    {
      name: 'animatedWebpUrl',
      type: 'text',
      label: 'GIF URL',
    },
  ],
};
