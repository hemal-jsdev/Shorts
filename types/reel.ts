export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  isVerified?: boolean;
}

export interface Reel {
  id: string;
  userId: string;
  streamUid?: string | null;
  hlsUrl: string;
  dashUrl?: string | null;
  thumbnailUrl?: string | null;
  animatedWebpUrl?: string | null;
  durationSeconds?: number | null;
  caption?: string | null;
  audioName?: string | null;
  hashtags?: string[];
  viewsCount?: number;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  createdAt: string;
  user: User;
  isLiked?: boolean;
}

export interface Comment {
  id: string;
  reelId: string;
  userId: string;
  text: string;
  parentId?: string | null;
  likesCount: number;
  createdAt: string;
  user: User;
  replies?: Comment[];
}
