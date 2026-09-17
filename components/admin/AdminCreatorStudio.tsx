'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud,
  Film,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
  Music,
  Check,
  Play,
} from 'lucide-react';
import axios from 'axios';
import { reelsApi } from '../../lib/api';

interface AdminCreatorStudioProps {
  onReelCreated?: (reel: any) => void;
  standalone?: boolean;
}

export const AdminCreatorStudio: React.FC<AdminCreatorStudioProps> = ({
  onReelCreated,
  standalone = true,
}) => {
  // Video upload mode: 'file' (direct binary upload) or 'uid' (paste existing Stream UID / sync)
  const [uploadMode, setUploadMode] = useState<'file' | 'uid'>('file');

  // Video File State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [streamUid, setStreamUid] = useState<string>('');

  // Metadata State
  const [caption, setCaption] = useState<string>('');
  const [audioName, setAudioName] = useState<string>('Original Audio - Standup Comedy');

  // Submission & Sync States
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Drop / Selection handler
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setStatusMessage({ type: 'error', text: 'Please select a valid video file (.mp4, .mov, .webm)' });
      return;
    }
    setVideoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(objectUrl);
    setStatusMessage(null);

    // Default title from file name
    if (!caption) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/^[a-zA-Z0-9.-]+\s*-\s*/, '')
        .replace(/[_-]/g, ' ');
      setCaption(cleanName);
    }
  };

  // Sync videos directly from Cloudflare Stream API
  const handleSyncCloudflare = async () => {
    setIsSyncing(true);
    setStatusMessage({ type: 'info', text: 'Connecting to Cloudflare Stream and syncing videos...' });

    try {
      const res = await reelsApi.syncCloudflare();
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `✨ Successfully synced ${res.reels?.length || 0} video(s) from Cloudflare! Feed is updated.`,
        });
        if (res.reels?.length > 0 && onReelCreated) {
          onReelCreated(res.reels[0]);
        }
      } else {
        throw new Error(res.message || 'Sync failed');
      }
    } catch (err: any) {
      console.error('Sync Cloudflare error:', err);
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to sync with Cloudflare Stream',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Main Publish Action
  const handlePublish = async () => {
    if (!caption.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a caption for your reel' });
      return;
    }

    if (uploadMode === 'file' && !videoFile && !streamUid) {
      setStatusMessage({ type: 'error', text: 'Please upload a video file or enter a Stream UID' });
      return;
    }

    if (uploadMode === 'uid' && !streamUid.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a Cloudflare Stream UID' });
      return;
    }

    setIsPublishing(true);
    setStatusMessage({ type: 'info', text: 'Initializing Cloudflare Stream publishing...' });

    try {
      let finalStreamUid = streamUid.trim();

      if (uploadMode === 'file' && videoFile) {
        // 1. Request Cloudflare Direct Creator Upload URL
        setStatusMessage({ type: 'info', text: 'Requesting Cloudflare Stream Direct Upload URL...' });
        setUploadProgress(15);

        const uploadMeta = await reelsApi.getDirectUploadUrl(300);
        finalStreamUid = uploadMeta.streamUid;
        const uploadUrl = uploadMeta.uploadUrl;
        setStreamUid(finalStreamUid);
        setUploadProgress(30);

        // 2. Upload video binary directly to Cloudflare Stream
        setStatusMessage({ type: 'info', text: 'Uploading video to Cloudflare Stream global CDN...' });

        const formData = new FormData();
        formData.append('file', videoFile);

        await axios.post(uploadUrl, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              const p = Math.round(30 + (e.loaded / e.total) * 55);
              setUploadProgress(p);
            }
          },
        });

        setUploadProgress(88);
      }

      // 3. Register Reel in Database
      setStatusMessage({ type: 'info', text: 'Registering reel in feed database...' });
      const res = await axios.post('/api/reels', {
        streamUid: finalStreamUid,
        caption: caption.trim(),
        audioName: audioName.trim() || 'Original Audio',
        videoSource: 'cloudflare',
        status: 'ready',
      });

      setUploadProgress(100);
      const createdReel = res.data?.doc || res.data?.data;
      setStatusMessage({
        type: 'success',
        text: '🎉 Reel published successfully! Available live on the feed now.',
      });

      if (onReelCreated) {
        onReelCreated(createdReel);
      }

      // Reset form after short delay
      setTimeout(() => {
        setVideoFile(null);
        setVideoPreviewUrl(null);
        setStreamUid('');
        setCaption('');
        setUploadProgress(0);
        setIsPublishing(false);
      }, 2500);
    } catch (err: any) {
      console.error('Publish error:', err);
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to publish reel',
      });
      setIsPublishing(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className={`w-full ${standalone ? 'max-w-5xl mx-auto p-4 md:p-8' : ''}`}>
      {/* Studio Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
            <UploadCloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Cloudflare Stream Creator Studio
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-medium">
                Live HLS
              </span>
            </h1>
            <p className="text-sm text-neutral-400">
              Upload videos directly to Cloudflare Stream or sync videos already uploaded in your Cloudflare dashboard.
            </p>
          </div>
        </div>

        {/* Sync Button */}
        <button
          type="button"
          disabled={isSyncing}
          onClick={handleSyncCloudflare}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-200 hover:text-white text-xs font-semibold shadow-lg transition-all duration-200 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 text-orange-400 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Cloudflare Videos'}</span>
        </button>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-2 gap-3 p-1.5 bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 rounded-2xl mb-8">
        <button
          type="button"
          onClick={() => {
            setUploadMode('file');
            setStatusMessage(null);
          }}
          className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl font-semibold text-xs transition-all duration-300 ${
            uploadMode === 'file'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>Direct Video File Upload</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setUploadMode('uid');
            setStatusMessage(null);
          }}
          className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl font-semibold text-xs transition-all duration-300 ${
            uploadMode === 'uid'
              ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/25'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Enter Cloudflare Stream UID / Sync</span>
        </button>
      </div>

      {/* Main Studio Body: Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Media Source Input & Live Preview (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <AnimatePresence mode="wait">
            {uploadMode === 'file' ? (
              <motion.div
                key="file-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* File Dropzone */}
                {!videoPreviewUrl ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    className="group border-2 border-dashed border-neutral-700 hover:border-orange-500/80 rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 bg-neutral-900/40 hover:bg-neutral-900/70 relative overflow-hidden"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-orange-500/20 transition-all duration-300">
                      <UploadCloud className="w-8 h-8 text-orange-400" />
                    </div>
                    <h3 className="text-base font-semibold text-white mb-1">
                      Choose a video or drag & drop here
                    </h3>
                    <p className="text-xs text-neutral-400 max-w-sm mb-4">
                      Supports MP4, MOV, WebM (up to 500MB). Video will automatically be transcoded to adaptive HLS (.m3u8) on Cloudflare Stream.
                    </p>
                    <span className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors">
                      Browse Video File
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                    />
                  </div>
                ) : (
                  <div className="relative rounded-3xl overflow-hidden border border-neutral-800 bg-neutral-950 shadow-2xl">
                    <video
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      className="w-full max-h-[460px] object-contain bg-black"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setVideoFile(null);
                        setVideoPreviewUrl(null);
                        setStreamUid('');
                      }}
                      className="absolute top-3 right-3 p-2 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md transition-colors"
                      title="Remove video"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="p-3.5 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-300">
                      <span className="truncate max-w-[280px] font-medium">{videoFile?.name}</span>
                      <span className="text-neutral-500">
                        {videoFile ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB` : ''}
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="uid-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Manual Stream UID Input */}
                <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Cloudflare Stream UID
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={streamUid}
                      onChange={(e) => setStreamUid(e.target.value.trim())}
                      placeholder="e.g. b4be7f9071bc3d1f29c030d87e9a10d4"
                      className="w-full bg-neutral-950 border border-neutral-700/80 rounded-2xl py-3.5 px-4 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors font-mono"
                    />
                  </div>
                  <p className="text-xs text-neutral-400">
                    Copy the UID from your Cloudflare Stream dashboard (dash.cloudflare.com) or click the <strong className="text-orange-400 font-semibold">Sync Cloudflare Videos</strong> button above to auto-import!
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload Progress Bar */}
          {isPublishing && (
            <div className="p-4 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-300 font-medium">Processing & Streaming Transcode</span>
                <span className="text-orange-400 font-bold">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* Status Message Banner */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
                  : 'bg-blue-950/60 border border-blue-800/80 text-blue-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Right Column: Metadata Details Form (5 Cols) */}
        <div className="lg:col-span-5 p-6 rounded-3xl bg-neutral-900/70 border border-neutral-800/80 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
            <Film className="w-4 h-4 text-orange-400" />
            Reel Details
          </h3>

          {/* Caption */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-400">Caption / Video Title *</label>
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What's this reel about? Add a catchy description..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl p-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors resize-none"
            />
          </div>

          {/* Audio Title */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-neutral-400" />
              Audio Track Name
            </label>
            <input
              type="text"
              value={audioName}
              onChange={(e) => setAudioName(e.target.value)}
              placeholder="Original Audio - Creator Name"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl py-2.5 px-3.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          {/* Publish Action Button */}
          <div className="pt-4 border-t border-neutral-800/80">
            <button
              type="button"
              disabled={isPublishing}
              onClick={handlePublish}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-rose-600 hover:from-orange-400 hover:via-amber-400 hover:to-rose-500 disabled:opacity-50 text-white font-bold text-sm tracking-wide shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2.5 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Publishing Reel...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Publish Reel to Feed</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
