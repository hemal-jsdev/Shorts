import type { CollectionConfig } from 'payload';

export const Ads: CollectionConfig = {
  slug: 'ads',
  admin: {
    useAsTitle: 'brandName',
    defaultColumns: ['brandName', 'headline', 'ctaText', 'status', 'clicksCount', 'createdAt'],
    description: 'Manage In-Feed Sponsored Ads displayed during shorts browsing.',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'brandName',
      type: 'text',
      required: true,
      label: 'Brand / Advertiser Name',
      admin: {
        placeholder: 'e.g. Nike, Spotify, Duolingo',
      },
    },
    {
      name: 'headline',
      type: 'text',
      required: true,
      label: 'Campaign Headline',
      admin: {
        placeholder: 'e.g. Just Do It — Get 25% Off Summer Collection',
      },
    },
    {
      name: 'caption',
      type: 'textarea',
      label: 'Ad Caption & Details',
      admin: {
        placeholder: 'Enter promotional copy, promo codes, or disclaimer...',
      },
    },
    {
      name: 'mediaType',
      type: 'select',
      label: 'Ad Format Type',
      options: [
        { label: '🎬 Video Ad (Auto-playing Video with timestamp)', value: 'video' },
        { label: '🖼️ Image Ad (Static poster with 10s timeline)', value: 'image' },
      ],
      defaultValue: 'video',
      required: true,
    },
    {
      name: 'videoUrl',
      type: 'text',
      label: 'Ad Video URL (HLS .m3u8, MP4, or YouTube Shorts)',
      admin: {
        placeholder: 'https://... or YouTube URL',
        condition: (data) => data?.mediaType !== 'image',
      },
    },
    {
      name: 'imageUrl',
      type: 'text',
      label: 'Ad Image URL (for Image Ads)',
      admin: {
        placeholder: 'https://... image URL',
        condition: (data) => data?.mediaType === 'image',
      },
    },
    {
      name: 'posterUrl',
      type: 'text',
      label: 'Poster / Thumbnail Image URL',
    },
    {
      name: 'brandAvatar',
      type: 'text',
      label: 'Brand Avatar / Logo URL',
      admin: {
        placeholder: 'https://...',
      },
    },
    {
      name: 'ctaText',
      type: 'text',
      required: true,
      defaultValue: 'Learn More',
      label: 'Call to Action Button Text',
      admin: {
        placeholder: 'e.g. Shop Now, Install App, Learn More, Claim Offer',
      },
    },
    {
      name: 'ctaUrl',
      type: 'text',
      required: true,
      label: 'Destination Landing Page URL',
      admin: {
        placeholder: 'https://yourbrand.com/promo',
      },
    },
    {
      name: 'displayFrequency',
      type: 'number',
      label: 'Cadence (Show ad every N reels)',
      defaultValue: 4,
    },
    {
      name: 'status',
      type: 'select',
      label: 'Campaign Status',
      options: [
        { label: '🟢 Active (Live in Feed)', value: 'active' },
        { label: '⏸️ Paused', value: 'paused' },
      ],
      defaultValue: 'active',
      required: true,
    },
    {
      name: 'impressionsCount',
      type: 'number',
      defaultValue: 0,
      label: 'Total Impressions',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'clicksCount',
      type: 'number',
      defaultValue: 0,
      label: 'Total Clicks',
      admin: {
        readOnly: true,
      },
    },
  ],
};
