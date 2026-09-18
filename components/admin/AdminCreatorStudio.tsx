'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  Youtube,
  ExternalLink,
  ArrowRight,
  BadgeCheck,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import axios from 'axios';
import { reelsApi } from '../../lib/api';

interface AdminCreatorStudioProps {
  onReelCreated?: (reel: any) => void;
  standalone?: boolean;
}

interface YouTubePreviewMeta {
  videoId: string;
  title: string;
  authorName: string;
  thumbnailUrl: string;
  audioName?: string;
  hashtags?: string[];
}

export const AdminCreatorStudio: React.FC<AdminCreatorStudioProps> = ({
  onReelCreated,
  standalone = true,
}) => {
  // Video upload mode: 'file' | 'youtube' | 'uid'
  const [uploadMode, setUploadMode] = useState<'file' | 'youtube' | 'uid'>('youtube');

  // Video File State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [streamUid, setStreamUid] = useState<string>('');

  // YouTube Ingestion State
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [isFetchingYtMeta, setIsFetchingYtMeta] = useState<boolean>(false);
  const [ytMeta, setYtMeta] = useState<YouTubePreviewMeta | null>(null);
  const [ytImportStep, setYtImportStep] = useState<number>(0); // 0: idle, 1: stream, 2: cloudflare, 3: ready
  const [createdReel, setCreatedReel] = useState<any | null>(null);

  // Metadata State
  const [caption, setCaption] = useState<string>('');
  const [audioName, setAudioName] = useState<string>('Original Audio');

  // Submission & Sync States
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ytDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Debounced YouTube Metadata Fetcher ──────────────────────────────────────
  useEffect(() => {
    if (uploadMode !== 'youtube') return;

    const trimmed = youtubeUrl.trim();
    if (!trimmed || (!trimmed.includes('youtu.be') && !trimmed.includes('youtube.com'))) {
      setYtMeta(null);
      return;
    }

    if (ytDebounceTimerRef.current) {
      clearTimeout(ytDebounceTimerRef.current);
    }

    ytDebounceTimerRef.current = setTimeout(async () => {
      setIsFetchingYtMeta(true);
      setStatusMessage(null);

      try {
        const data = await reelsApi.getYouTubeMetadata(trimmed);
        if (data) {
          setYtMeta({
            videoId: data.videoId,
            title: data.title,
            authorName: data.authorName,
            thumbnailUrl: data.thumbnailUrl,
            audioName: data.audioName,
            hashtags: data.hashtags,
          });

          // Auto-fill caption and audio if not modified
          setCaption(data.title);
          if (data.audioName) {
            setAudioName(data.audioName);
          }
        }
      } catch (err: any) {
        console.warn('Metadata preview error:', err);
      } finally {
        setIsFetchingYtMeta(false);
      }
    }, 450);

    return () => {
      if (ytDebounceTimerRef.current) {
        clearTimeout(ytDebounceTimerRef.current);
      }
    };
  }, [youtubeUrl, uploadMode]);

  // File Drop / Selection handler
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setStatusMessage({
        type: 'error',
        text: 'Please select a valid video file (.mp4, .mov, .webm)',
      });
      return;
    }
    setVideoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(objectUrl);
    setStatusMessage(null);

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
    setStatusMessage({
      type: 'info',
      text: 'Connecting to Cloudflare Stream and syncing videos...',
    });

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

  // ── Handle YouTube Shorts Automated Ingestion ──────────────────────────────
  const handleYouTubeImport = async () => {
    if (!youtubeUrl.trim()) {
      setStatusMessage({ type: 'error', text: 'Please paste a valid YouTube Shorts link' });
      return;
    }

    setIsPublishing(true);
    setYtImportStep(1); // Ingesting stream
    setUploadProgress(25);
    setStatusMessage({
      type: 'info',
      text: 'Extracting video stream from YouTube...',
    });

    try {
      // Advance step indicator to step 2 after short delay for visual realism
      setTimeout(() => {
        setYtImportStep(2); // Uploading to Cloudflare
        setUploadProgress(65);
        setStatusMessage({
          type: 'info',
          text: 'Streaming video to Cloudflare Stream CDN & generating HLS manifest...',
        });
      }, 1500);

      const imported = await reelsApi.importYouTubeShort(
        youtubeUrl.trim(),
        caption.trim() || undefined
      );

      setYtImportStep(3); // Ready
      setUploadProgress(100);
      setCreatedReel(imported);

      setStatusMessage({
        type: 'success',
        text: '🎉 YouTube Short successfully ingested and transcoded to Cloudflare Stream!',
      });

      if (onReelCreated) {
        onReelCreated(imported);
      }
    } catch (err: any) {
      console.error('YouTube import error:', err);
      setYtImportStep(0);
      setUploadProgress(0);
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to import YouTube Short',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Handle Direct File or UID Publishing ──────────────────────────────────
  const handlePublish = async () => {
    if (uploadMode === 'youtube') {
      return handleYouTubeImport();
    }

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
        setStatusMessage({ type: 'info', text: 'Requesting Cloudflare Stream Direct Upload URL...' });
        setUploadProgress(15);

        const uploadMeta = await reelsApi.getDirectUploadUrl(300);
        finalStreamUid = uploadMeta.streamUid;
        const uploadUrl = uploadMeta.uploadUrl;
        setStreamUid(finalStreamUid);
        setUploadProgress(30);

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

      setStatusMessage({ type: 'info', text: 'Registering reel in feed database...' });
      const res = await axios.post('/api/reels', {
        streamUid: finalStreamUid,
        caption: caption.trim(),
        audioName: audioName.trim() || 'Original Audio',
        videoSource: 'cloudflare',
        status: 'ready',
      });

      setUploadProgress(100);
      const newDoc = res.data?.doc || res.data?.data;
      setCreatedReel(newDoc);
      setStatusMessage({
        type: 'success',
        text: '🎉 Reel published successfully! Available live on the feed now.',
      });

      if (onReelCreated) {
        onReelCreated(newDoc);
      }
    } catch (err: any) {
      console.error('Publish error:', err);
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to publish reel',
      });
      setUploadProgress(0);
    } finally {
      setIsPublishing(false);
    }
  };

  const resetAll = () => {
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setStreamUid('');
    setYoutubeUrl('');
    setYtMeta(null);
    setCaption('');
    setCreatedReel(null);
    setYtImportStep(0);
    setUploadProgress(0);
    setStatusMessage(null);
  };

  return (
    <div className={`w-full ${standalone ? 'max-w-5xl mx-auto p-4 md:p-8' : ''}`}>
      {/* Studio Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 via-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/25">
            <UploadCloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Creator Studio
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-medium">
                Cloudflare Stream & YouTube
              </span>
            </h1>
            <p className="text-sm text-neutral-400">
              Import YouTube Shorts or upload video files directly to Cloudflare Stream with adaptive HLS delivery.
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
      <div className="grid grid-cols-3 gap-2 p-1.5 bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 rounded-2xl mb-8">
        <button
          type="button"
          onClick={() => {
            setUploadMode('youtube');
            setStatusMessage(null);
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-semibold text-xs transition-all duration-300 ${
            uploadMode === 'youtube'
              ? 'bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-lg shadow-red-500/25'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Youtube className="w-4 h-4" />
          <span className="truncate">Import YouTube Shorts</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setUploadMode('file');
            setStatusMessage(null);
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-semibold text-xs transition-all duration-300 ${
            uploadMode === 'file'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span className="truncate">Direct Video Upload</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setUploadMode('uid');
            setStatusMessage(null);
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-semibold text-xs transition-all duration-300 ${
            uploadMode === 'uid'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-500 text-white shadow-lg shadow-purple-500/25'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Film className="w-4 h-4" />
          <span className="truncate">Cloudflare UID / Sync</span>
        </button>
      </div>

      {/* Main Studio Body: Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Media Source Input & Live Preview (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <AnimatePresence mode="wait">
            {/* ── TAB 1: YOUTUBE SHORTS AUTOMATED IMPORTER ── */}
            {uploadMode === 'youtube' && (
              <motion.div
                key="youtube-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {/* YouTube Link Input Box */}
                <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                      <Youtube className="w-4 h-4 text-red-500" />
                      Paste YouTube Shorts URL
                    </label>
                    <span className="text-[11px] text-neutral-500">
                      e.g. youtube.com/shorts/...
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/shorts/..."
                      className="w-full bg-neutral-950 border border-neutral-700/80 rounded-2xl py-3.5 pl-4 pr-11 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors"
                    />
                    {isFetchingYtMeta && (
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-neutral-400">
                    The video stream will be downloaded and transcoded directly to Cloudflare Stream HLS with zero external embeds.
                  </p>
                </div>

                {/* Instant YouTube Preview Card */}
                {ytMeta && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-5 rounded-3xl bg-neutral-950 border border-neutral-800 shadow-2xl relative overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row items-center gap-5">
                      {/* Vertical Aspect Poster */}
                      <div className="relative w-28 aspect-[9/16] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 shadow-lg flex-shrink-0">
                        <img
                          src={ytMeta.thumbnailUrl}
                          alt={ytMeta.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] font-bold text-white flex items-center gap-1">
                          <Youtube className="w-2.5 h-2.5 text-red-500" />
                          Short
                        </div>
                      </div>

                      {/* Video Information */}
                      <div className="flex-1 space-y-2.5 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                          <span className="font-semibold text-white">@{ytMeta.authorName}</span>
                          <BadgeCheck className="w-3.5 h-3.5 text-blue-400" />
                        </div>

                        <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">
                          {ytMeta.title}
                        </h4>

                        {ytMeta.hashtags && ytMeta.hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {ytMeta.hashtags.slice(0, 4).map((tag, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800 text-neutral-300"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 font-semibold flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            1080p Full HD Lossless Remux
                          </span>
                          <span className="text-[11px] px-2 py-1 rounded-lg bg-neutral-800/80 text-neutral-400 font-mono">
                            Multi-bitrate Adaptive
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Stepper Progress Indicator when Publishing */}
                {isPublishing && (
                  <div className="p-5 rounded-3xl bg-neutral-900/90 border border-neutral-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-orange-400" />
                        1080p High-Quality Ingestion Pipeline
                      </h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-bold">
                        Master MP4
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      {/* Step 1 */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            ytImportStep > 1
                              ? 'bg-emerald-500 text-black'
                              : ytImportStep === 1
                              ? 'bg-orange-500 text-white animate-pulse'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {ytImportStep > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
                        </div>
                        <span className={ytImportStep === 1 ? 'text-white font-semibold' : 'text-neutral-400'}>
                          Extracting 1080p video & high-bitrate audio streams
                        </span>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            ytImportStep > 2
                              ? 'bg-emerald-500 text-black'
                              : ytImportStep === 2
                              ? 'bg-orange-500 text-white animate-pulse'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {ytImportStep > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
                        </div>
                        <span className={ytImportStep === 2 ? 'text-white font-semibold' : 'text-neutral-400'}>
                          Losslessly remuxing into pristine MP4 & streaming to Cloudflare CDN
                        </span>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            ytImportStep >= 3
                              ? 'bg-emerald-500 text-black'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {ytImportStep >= 3 ? <Check className="w-3.5 h-3.5" /> : '3'}
                        </div>
                        <span className={ytImportStep >= 3 ? 'text-white font-semibold' : 'text-neutral-400'}>
                          Adaptive HLS ready & published to live feed
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-emerald-500"
                        initial={{ width: '15%' }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── TAB 2: DIRECT VIDEO FILE UPLOAD ── */}
            {uploadMode === 'file' && (
              <motion.div
                key="file-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
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
            )}

            {/* ── TAB 3: CLOUDFLARE UID / SYNC ── */}
            {uploadMode === 'uid' && (
              <motion.div
                key="uid-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
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
                      className="w-full bg-neutral-950 border border-neutral-700/80 rounded-2xl py-3.5 px-4 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors font-mono"
                    />
                  </div>
                  <p className="text-xs text-neutral-400">
                    Copy the UID from your Cloudflare Stream dashboard (dash.cloudflare.com) or click the <strong className="text-orange-400 font-semibold">Sync Cloudflare Videos</strong> button above to auto-import!
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
              <span className="flex-1">{statusMessage.text}</span>
            </div>
          )}

          {/* Success Card with Action Buttons */}
          {createdReel && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-5 rounded-3xl bg-gradient-to-r from-emerald-950/80 to-neutral-950 border border-emerald-800/80 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <Play className="w-5 h-5 fill-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Reel is Live & Ready!</h4>
                  <p className="text-xs text-neutral-400">Stream UID: {createdReel.streamUid}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <Link
                  href={`/shorts/${createdReel.id}`}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shadow-lg transition-all"
                >
                  <Eye className="w-4 h-4" />
                  <span>Watch in Feed</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={resetAll}
                  className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors"
                >
                  New Video
                </button>
              </div>
            </motion.div>
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
            <label className="block text-xs font-semibold text-neutral-400">
              Caption / Video Title *
            </label>
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
              disabled={isPublishing || (uploadMode === 'youtube' && !youtubeUrl.trim())}
              onClick={handlePublish}
              className={`w-full py-4 px-6 rounded-2xl text-white font-bold text-sm tracking-wide shadow-xl flex items-center justify-center gap-2.5 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none ${
                uploadMode === 'youtube'
                  ? 'bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 hover:from-red-500 hover:to-orange-400 shadow-red-600/20'
                  : 'bg-gradient-to-r from-orange-500 via-amber-500 to-rose-600 hover:from-orange-400 hover:via-amber-400 hover:to-rose-500 shadow-orange-500/20'
              }`}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>
                    {uploadMode === 'youtube' ? 'Ingesting YouTube Short...' : 'Publishing Reel...'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>
                    {uploadMode === 'youtube'
                      ? 'Import & Transcode to Cloudflare'
                      : 'Publish Reel to Feed'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
