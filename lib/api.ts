import axios from 'axios';
import { Reel, Comment } from '../types/reel';

const getServerUrl = () => {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || `${getServerUrl()}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const reelsApi = {
  // Sync live videos from Cloudflare Stream
  syncCloudflare: async (): Promise<{ success: boolean; message: string; reels: Reel[] }> => {
    try {
      const res = await api.get('/cloudflare/sync');
      return res.data;
    } catch (err: any) {
      console.error('Cloudflare sync failed:', err);
      throw err;
    }
  },

  // Fetch paginated feed
  getFeed: async (cursor?: string, limit = 25): Promise<{ items: Reel[]; nextCursor: string | null; hasMore: boolean }> => {
    try {
      const res = await api.get('/reels/feed', {
        params: { cursor, limit },
      });
      return res.data.data;
    } catch (err) {
      console.warn('[reelsApi] Feed fetch failed:', err);
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
      };
    }
  },


  // Get single reel by ID
  getReelById: async (id: string): Promise<Reel> => {
    const res = await api.get(`/reels/${id}`);
    return res.data.doc || res.data.data || res.data;
  },

  // Toggle like
  toggleLike: async (id: string): Promise<{ isLiked: boolean; likesCount: number }> => {
    const res = await api.post(`/reels/${id}/like`);
    return res.data.data;
  },

  // Record watch view
  recordView: async (id: string, watchDurationMs: number, completed = false, quality = 'auto'): Promise<void> => {
    try {
      await api.post(`/reels/${id}/view`, {
        watchDurationMs,
        completed,
        quality,
      });
    } catch (_) {}
  },

  // Get comments
  getComments: async (id: string): Promise<Comment[]> => {
    try {
      const res = await api.get(`/reels/${id}/comments`);
      return res.data.data;
    } catch (err) {
      return [
        {
          id: 'mock_c1',
          reelId: id,
          userId: 'usr_2',
          text: 'The video player performance is unbelievably smooth!',
          likesCount: 14,
          createdAt: new Date().toISOString(),
          user: {
            id: 'usr_2',
            username: 'alex_wanderlust',
            displayName: 'Alex Rivers',
            avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
          },
        },
      ];
    }
  },

  // Add comment
  addComment: async (id: string, text: string, parentId?: string): Promise<Comment> => {
    const res = await api.post(`/reels/${id}/comments`, { text, parentId });
    return res.data.data;
  },

  // Request Cloudflare Direct Upload URL
  getDirectUploadUrl: async (maxDurationSeconds = 60): Promise<{ uploadUrl: string; streamUid: string }> => {
    const res = await api.post('/reels/upload-url', { maxDurationSeconds });
    return res.data.data;
  },

  // Publish reel after direct upload to Cloudflare
  publishReel: async (streamUid: string, caption?: string): Promise<Reel> => {
    const res = await api.post('/reels', {
      streamUid,
      caption,
      videoSource: 'cloudflare',
    });
    return res.data.doc || res.data.data || res.data;
  },

  // Fetch YouTube Shorts metadata for preview
  getYouTubeMetadata: async (url: string): Promise<any> => {
    const res = await api.get('/youtube/metadata', {
      params: { url },
    });
    return res.data.data;
  },

  // Ingest and upload YouTube Short to Cloudflare Stream
  importYouTubeShort: async (url: string, caption?: string): Promise<Reel> => {
    const res = await api.post('/youtube/import', {
      url,
      caption,
    });
    return res.data.data;
  },
};
