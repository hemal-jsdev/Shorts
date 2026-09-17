'use client';

import React, { useEffect, useState } from 'react';
import { X, Send, Heart, CornerDownRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShortsStore } from '../../store/useShortsStore';
import { reelsApi } from '../../lib/api';
import { Comment } from '../../types/reel';

export const CommentsDrawer: React.FC = () => {
  const { activeCommentReel, closeComments } = useShortsStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyToUsername, setReplyToUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!activeCommentReel) return;

    setIsLoading(true);
    reelsApi
      .getComments(activeCommentReel.id)
      .then((data) => setComments(data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [activeCommentReel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeCommentReel || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const newComment = await reelsApi.addComment(
        activeCommentReel.id,
        inputText.trim(),
        replyToId || undefined,
      );

      if (replyToId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyToId
              ? { ...c, replies: [...(c.replies || []), newComment] }
              : c,
          ),
        );
      } else {
        setComments((prev) => [newComment, ...prev]);
      }

      setInputText('');
      setReplyToId(null);
      setReplyToUsername(null);
    } catch (err) {
      console.error('Failed to post comment', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeCommentReel) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
        {/* Backdrop for mobile */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeComments}
          className="md:hidden absolute inset-0 bg-black/60 pointer-events-auto backdrop-blur-sm"
        />

        {/* Slide-in Drawer Container */}
        <motion.div
          initial={{ x: '100%', opacity: 0.8 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          className="relative w-full max-w-md h-full bg-[#181818] border-l border-white/10 shadow-2xl flex flex-col pointer-events-auto z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#1f1f1f]">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-white">Comments</h3>
              <span className="text-xs text-neutral-400 font-medium">
                {comments.length}
              </span>
            </div>
            <button
              onClick={closeComments}
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Comment List */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-7 h-7 text-neutral-400 animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 text-sm">
                No comments yet. Start the conversation!
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 group">
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/10 mt-0.5">
                    <img
                      src={
                        comment.user?.avatarUrl ||
                        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                      }
                      alt={comment.user?.displayName || 'User'}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">
                        @{comment.user?.username || 'user'}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-sm text-neutral-200 mt-1 leading-relaxed">
                      {comment.text}
                    </p>

                    <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
                      <button className="flex items-center gap-1 hover:text-red-400 transition-colors">
                        <Heart className="w-3.5 h-3.5" />
                        <span>{comment.likesCount || 0}</span>
                      </button>
                      <button
                        onClick={() => {
                          setReplyToId(comment.id);
                          setReplyToUsername(comment.user?.username || 'user');
                        }}
                        className="hover:text-white transition-colors font-medium"
                      >
                        Reply
                      </button>
                    </div>

                    {/* Nested Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="mt-3 pl-4 border-l border-white/10 space-y-3">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="flex gap-2.5">
                            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
                              <img
                                src={
                                  reply.user?.avatarUrl ||
                                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                                }
                                alt="Reply user"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-white">
                                  @{reply.user?.username}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-300 mt-0.5">
                                {reply.text}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Reply Banner */}
          {replyToUsername && (
            <div className="px-5 py-1.5 bg-neutral-800 text-xs text-neutral-300 flex items-center justify-between border-t border-white/5">
              <span>Replying to <b>@{replyToUsername}</b></span>
              <button
                onClick={() => {
                  setReplyToId(null);
                  setReplyToUsername(null);
                }}
                className="text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Input Footer */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-white/10 bg-[#1f1f1f] flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={replyToUsername ? `Reply to @${replyToUsername}...` : 'Add a comment...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-black/40 border border-white/15 rounded-full px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/70 transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSubmitting}
              className="p-2.5 rounded-full bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-500 transition-colors shadow-md"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
