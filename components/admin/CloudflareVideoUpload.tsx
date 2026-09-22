'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useField } from '@payloadcms/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadState {
  status: 'idle' | 'requesting' | 'uploading' | 'done' | 'error';
  progress: number; // 0–100
  streamUid: string | null;
  hlsUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  fileName: string | null;
  fileSize: number | null;
}

interface YouTubePreview {
  videoId: string;
  title: string;
  authorName: string;
  thumbnailUrl: string;
  audioName?: string;
  hashtags?: string[];
}

// ─── Cloudflare Stream Direct Upload helper ───────────────────────────────

async function directUpload(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let errMessage = `HTTP ${xhr.status}`;
        try {
          const json = JSON.parse(xhr.responseText);
          if (json?.errors?.[0]?.message) {
            errMessage += `: ${json.errors[0].message}`;
          }
        } catch (_) {}
        reject(new Error(`Direct upload failed (${errMessage})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during video upload. Please check your connection.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out.'));
    };

    xhr.send(formData);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const CloudflareVideoUpload: React.FC = () => {
  // Connect to Payload CMS collection fields
  const { value: streamUidValue, setValue: setStreamUid } = useField<string>({
    path: 'streamUid',
  });
  const { value: videoSourceValue, setValue: setVideoSource } = useField<string>({
    path: 'videoSource',
  });
  const { value: hlsUrlValue, setValue: setHlsUrl } = useField<string>({
    path: 'hlsUrl',
  });
  const { value: thumbnailValue, setValue: setThumbnailUrl } = useField<string>({
    path: 'thumbnailUrl',
  });
  const { value: captionValue, setValue: setCaption } = useField<string>({
    path: 'caption',
  });
  const { setValue: setAnimatedWebpUrl } = useField<string>({
    path: 'animatedWebpUrl',
  });
  const { setValue: setStatus } = useField<string>({
    path: 'status',
  });

  // Active Mode: 'youtube' | 'file'
  const [activeTab, setActiveTab] = useState<'youtube' | 'file'>('youtube');
  const [isReplacing, setIsReplacing] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // YouTube Ingestion State
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [isFetchingMeta, setIsFetchingMeta] = useState<boolean>(false);
  const [ytPreview, setYtPreview] = useState<YouTubePreview | null>(null);
  const [ytStep, setYtStep] = useState<number>(0); // 0: idle, 1: downloading, 2: cloudflare, 3: done
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const [state, setState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    streamUid: null,
    hlsUrl: null,
    thumbnailUrl: null,
    errorMessage: null,
    fileName: null,
    fileSize: null,
  });

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Copy helper
  const copyText = (text: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(id);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Sync initial values from existing Payload document (e.g. editing)
  useEffect(() => {
    if (streamUidValue && state.status === 'idle') {
      setState((prev) => ({
        ...prev,
        streamUid: String(streamUidValue),
        hlsUrl: hlsUrlValue ? String(hlsUrlValue) : null,
        thumbnailUrl: thumbnailValue ? String(thumbnailValue) : null,
        status: 'done',
      }));
    }
  }, []);

  // ── Debounced YouTube Metadata Fetcher ──────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'youtube') return;

    const trimmed = youtubeUrl.trim();
    if (!trimmed || (!trimmed.includes('youtu.be') && !trimmed.includes('youtube.com'))) {
      setYtPreview(null);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsFetchingMeta(true);
      try {
        const res = await fetch(`/api/youtube/metadata?url=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setYtPreview(json.data);
            if (!captionValue && json.data.title) {
              setCaption(json.data.title);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch YouTube metadata preview:', err);
      } finally {
        setIsFetchingMeta(false);
      }
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [youtubeUrl, activeTab, captionValue, setCaption]);

  // ── Handle YouTube Shorts Automated Ingestion ──────────────────────────────
  const handleYouTubeImport = async (directMode = false) => {
    if (!youtubeUrl.trim()) return;

    setState({
      status: 'uploading',
      progress: directMode ? 75 : 25,
      streamUid: null,
      hlsUrl: null,
      thumbnailUrl: null,
      errorMessage: null,
      fileName: directMode ? 'YouTube Short (Instant Stream)' : 'YouTube Short (1080p Remux)',
      fileSize: null,
    });
    setYtStep(directMode ? 2 : 1);
    setImportNotice(null);

    try {
      if (!directMode) {
        setTimeout(() => {
          setYtStep(2);
          setState((prev) => ({ ...prev, progress: 65 }));
        }, 1800);
      }

      const res = await fetch('/api/youtube/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          caption: captionValue || ytPreview?.title || '',
          directMode,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Import failed: HTTP ${res.status}`);
      }

      const { data, notice } = await res.json();
      setYtStep(3);

      // Populate Payload CMS form fields automatically
      setStreamUid(data.streamUid);
      setVideoSource(data.videoSource || (data.isDirectYouTube ? 'youtube' : 'cloudflare'));
      setHlsUrl(data.hlsUrl);
      if (data.thumbnailUrl) setThumbnailUrl(data.thumbnailUrl);
      if (data.animatedWebpUrl) setAnimatedWebpUrl(data.animatedWebpUrl);
      if (data.caption && !captionValue) setCaption(data.caption);
      setStatus('ready');

      if (notice || data.isDirectYouTube) {
        setImportNotice(notice || 'Imported via High-Speed Direct YouTube Stream (Lossless 1080p).');
      }

      setState({
        status: 'done',
        progress: 100,
        streamUid: data.streamUid,
        hlsUrl: data.hlsUrl,
        thumbnailUrl: data.thumbnailUrl,
        errorMessage: null,
        fileName: `${data.caption || 'YouTube Short'} (${data.quality || '1080p'})`,
        fileSize: null,
      });
      setIsReplacing(false);
    } catch (err: any) {
      console.error('YouTube import error in CMS:', err);
      setYtStep(0);
      let msg = err.message || 'Failed to import YouTube Short. Please verify the URL.';
      if (msg.toLowerCase().includes('login') || msg.toLowerCase().includes('bot')) {
        msg = 'YouTube Bot Protection: YouTube restricts automated server downloads from cloud hosting providers. Click "⚡ Instant Direct Stream" below to link this Short instantly.';
      }
      setState((prev) => ({
        ...prev,
        status: 'error',
        progress: 0,
        errorMessage: msg,
      }));
    }
  };

  // ── Handle Direct File Upload ──────────────────────────────────────────────
  const processFile = useCallback(
    async (file: File) => {
      const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
      if (!allowed.includes(file.type)) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: 'Unsupported format. Please upload MP4, MOV, or WebM.',
        }));
        return;
      }

      if (file.size > 500 * 1024 * 1024) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: 'File too large. Maximum size is 500 MB.',
        }));
        return;
      }

      setState({
        status: 'requesting',
        progress: 0,
        streamUid: null,
        hlsUrl: null,
        thumbnailUrl: null,
        errorMessage: null,
        fileName: file.name,
        fileSize: file.size,
      });

      try {
        // Step 1: Request Direct Upload URL from backend
        const tokenRes = await fetch('/api/cloudflare/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            maxDurationSeconds: 120,
            meta: {
              name: captionValue || file.name.replace(/\.[^/.]+$/, ''),
              source: 'cms-direct-upload',
            },
          }),
        });

        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({}));
          throw new Error(errData.error || `Upload token request failed: HTTP ${tokenRes.status}`);
        }

        const { uploadURL, uid } = await tokenRes.json();

        // Step 2: Stream binary directly to Cloudflare
        setState((prev) => ({ ...prev, status: 'uploading', progress: 5, streamUid: uid }));

        await directUpload(uploadURL, file, (pct) => {
          setState((prev) => ({ ...prev, progress: Math.max(5, pct) }));
        });

        // Step 3: Populate Payload CMS fields
        const streamDomain = 'customer-d3tadt8nvkirw68k.cloudflarestream.com';
        const finalHls = `https://${streamDomain}/${uid}/manifest/video.m3u8`;
        const finalThumb = `https://${streamDomain}/${uid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
        const finalGif = `https://${streamDomain}/${uid}/thumbnails/thumbnail.gif`;

        setStreamUid(uid);
        setVideoSource('cloudflare');
        setHlsUrl(finalHls);
        setThumbnailUrl(finalThumb);
        setAnimatedWebpUrl(finalGif);
        if (!captionValue) {
          const autoCaption = file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/^[a-zA-Z0-9.-]+\s*-\s*/, '')
            .replace(/[_-]/g, ' ')
            .trim();
          setCaption(autoCaption);
        }
        setStatus('ready');

        setState({
          status: 'done',
          progress: 100,
          streamUid: uid,
          hlsUrl: finalHls,
          thumbnailUrl: finalThumb,
          errorMessage: null,
          fileName: file.name,
          fileSize: file.size,
        });
        setIsReplacing(false);
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          progress: 0,
          errorMessage: err.message || 'Video upload failed. Please try again.',
        }));
      }
    },
    [setStreamUid, setVideoSource, setHlsUrl, setThumbnailUrl, setAnimatedWebpUrl, setCaption, setStatus, captionValue]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const isYouTube =
    videoSourceValue === 'youtube' ||
    Boolean(state.hlsUrl && (state.hlsUrl.includes('youtube.com') || state.hlsUrl.includes('youtu.be')));

  const isVideoLoaded = state.status === 'done' && Boolean(state.streamUid);

  return (
    <div style={styles.wrapper}>
      {/* ── CASE 1: Video is Already Loaded & Ready (Display Done Card) ── */}
      {isVideoLoaded && !isReplacing && (
        <div style={styles.doneCard}>
          {/* Header Bar */}
          <div style={styles.doneHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={styles.statusPill}>
                <span style={styles.checkIcon}>✓</span>
                <span>{isYouTube ? 'YouTube Short Stream Active' : 'Cloudflare Stream Ready'}</span>
              </div>
              <span style={isYouTube ? styles.badgeSourceYt : styles.badgeSourceCf}>
                {isYouTube ? 'Direct HD' : 'Cloudflare HLS'}
              </span>
            </div>

            <div style={styles.headerActions}>
              {state.hlsUrl && (
                <a
                  href={state.hlsUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.previewLinkBtn}
                >
                  <span>↗</span>
                  <span>Preview Stream</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setIsReplacing(true)}
                style={styles.replaceBtn}
                title="Replace with another video"
              >
                <span>🔄</span>
                <span>Change / Replace Video</span>
              </button>
            </div>
          </div>

          {/* Optional import fallback banner */}
          {importNotice && (
            <div style={styles.noticeBox}>
              <span style={{ fontSize: 15 }}>✨</span>
              <span>{importNotice}</span>
            </div>
          )}

          {/* Card Body: 9:16 Vertical Poster (Left) + Rich Details (Right) */}
          <div style={styles.cardBody}>
            {/* 9:16 Vertical Thumbnail Poster */}
            <div style={styles.thumbBox}>
              {state.thumbnailUrl ? (
                <img
                  src={state.thumbnailUrl}
                  alt="Video thumbnail"
                  style={styles.thumbImg}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${state.streamUid}/hqdefault.jpg`;
                  }}
                />
              ) : (
                <div style={styles.thumbPlaceholder}>
                  <span>9:16</span>
                </div>
              )}
              <div style={styles.thumbBadge}>
                {isYouTube ? 'SHORTS' : 'HLS'}
              </div>
            </div>

            {/* Video Details & Stream Meta */}
            <div style={styles.metaDetails}>
              <div style={styles.metaTitle}>
                {captionValue || state.fileName || 'Reel Video Stream'}
              </div>

              {/* Status Chips */}
              <div style={styles.chipsRow}>
                <span style={styles.chip}>
                  <strong>Status:</strong> Ready
                </span>
                <span style={styles.chip}>
                  <strong>Quality:</strong> Lossless 1080p
                </span>
                <span style={styles.chip}>
                  <strong>Format:</strong> {isYouTube ? 'YouTube Adaptive' : 'HLS (.m3u8)'}
                </span>
              </div>

              {/* Stream UID Monospace Box with Copy */}
              <div style={styles.codeSnippetGroup}>
                <span style={styles.snippetLabel}>STREAM UID</span>
                <div style={styles.snippetBox}>
                  <code style={styles.snippetCode}>{state.streamUid}</code>
                  <button
                    type="button"
                    onClick={() => copyText(state.streamUid || '', 'uid')}
                    style={styles.copyBtn}
                    title="Copy Stream UID"
                  >
                    {copiedField === 'uid' ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
              </div>

              {/* Stream URL Monospace Box with Copy */}
              {state.hlsUrl && (
                <div style={styles.codeSnippetGroup}>
                  <span style={styles.snippetLabel}>STREAM MANIFEST URL</span>
                  <div style={styles.snippetBox}>
                    <code style={styles.snippetCodeUrl}>{state.hlsUrl}</code>
                    <button
                      type="button"
                      onClick={() => copyText(state.hlsUrl || '', 'hls')}
                      style={styles.copyBtn}
                      title="Copy Stream URL"
                    >
                      {copiedField === 'hls' ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card Footer Note */}
          <div style={styles.cardFooter}>
            <span style={styles.footerNote}>
              ✓ Video stream is configured and synced with form fields. Click <strong>Save</strong> above to finalize and publish.
            </span>
          </div>
        </div>
      )}

      {/* ── CASE 2: No Video Yet, or User Explicitly Triggered Replace Mode ── */}
      {(!isVideoLoaded || isReplacing) && (
        <>
          {/* Replace Mode Active Warning Banner (only when replacing existing video) */}
          {isReplacing && state.streamUid && (
            <div style={styles.replaceHeaderBar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {state.thumbnailUrl ? (
                  <div style={styles.miniThumbWrapper}>
                    <img
                      src={state.thumbnailUrl}
                      alt="Current Video"
                      style={styles.miniThumbImg}
                    />
                  </div>
                ) : (
                  <div style={styles.miniThumbPlaceholder}>🎬</div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🔄 Replacing Current Video</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 3 }}>
                    Current UID: <code style={styles.inlineCode}>{state.streamUid}</code> (safe until replaced)
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsReplacing(false);
                  setState((p) => ({ ...p, status: 'done', errorMessage: null }));
                }}
                style={styles.cancelReplaceBtn}
              >
                ✕ Cancel & Keep Current Video
              </button>
            </div>
          )}

          {/* Mode Switcher Tabs: Clean Native Dark Segmented Control */}
          <div style={styles.tabContainer}>
            <button
              type="button"
              onClick={() => setActiveTab('youtube')}
              style={{
                ...styles.tabButton,
                ...(activeTab === 'youtube' ? styles.tabButtonActive : {}),
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill={activeTab === 'youtube' ? '#ef4444' : '#71717a'}>
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              <span>Import from YouTube Shorts</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('file')}
              style={{
                ...styles.tabButton,
                ...(activeTab === 'file' ? styles.tabButtonActive : {}),
              }}
            >
              <span style={{ fontSize: 15 }}>📁</span>
              <span>Direct Video File Upload</span>
            </button>
          </div>

          {/* Error Banner */}
          {state.status === 'error' && (
            <div style={styles.errorBanner}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>{state.errorMessage}</span>
                {state.errorMessage?.includes('Instant Direct Stream') && (
                  <button
                    type="button"
                    onClick={() => handleYouTubeImport(true)}
                    style={styles.quickFixBtn}
                  >
                    ⚡ Switch to Instant Direct Stream
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  setState((p) => ({
                    ...p,
                    status: isReplacing && state.streamUid ? 'done' : 'idle',
                    errorMessage: null,
                  }))
                }
                style={styles.errorDismiss}
              >
                ✕
              </button>
            </div>
          )}

          {/* Uploading State */}
          {(state.status === 'requesting' || state.status === 'uploading') && (
            <div style={styles.uploadingCard}>
              <div style={styles.fileRow}>
                <span style={styles.fileIcon}>⚡</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.fileName}>{state.fileName || 'Processing video stream…'}</p>
                  <p style={styles.fileMeta}>
                    {ytStep === 1
                      ? 'Extracting video & audio stream metadata…'
                      : ytStep === 2
                      ? 'Configuring adaptive HLS stream & CDN manifest…'
                      : 'Uploading video directly to Cloudflare Stream…'}
                  </p>
                </div>
                <span style={styles.progressPct}>{state.progress}%</span>
              </div>

              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${state.progress}%`,
                  }}
                />
              </div>
              <p style={styles.uploadingNote}>
                ⚡ Ingesting master video stream — please keep this tab open
              </p>
            </div>
          )}

          {/* Active Tab: YouTube Shorts */}
          {activeTab === 'youtube' && (state.status === 'idle' || state.status === 'error' || isReplacing) && (
            <div style={styles.cardBox}>
              <div style={styles.ytInputHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#ef4444', fontSize: 15 }}>▶</span>
                  <span style={styles.ytInputTitle}>Paste YouTube Shorts or Video Link</span>
                </div>
                <span style={styles.badgeAuto}>⚡ Auto-fetch enabled</span>
              </div>

              <div style={styles.inputWrapper}>
                <div style={styles.inputPrefix}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </div>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste YouTube Shorts link (e.g. https://www.youtube.com/shorts/...)"
                  style={styles.ytInput}
                />
                {youtubeUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setYoutubeUrl('');
                      setYtPreview(null);
                    }}
                    style={styles.clearBtn}
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
                {isFetchingMeta && <div style={styles.miniSpinner} />}
              </div>

              <p style={styles.helperText}>
                Select <strong>Instant Direct Stream</strong> for instant connection, or <strong>Cloudflare Ingest</strong> to transcode.
              </p>

              {/* Instant Metadata Preview Card */}
              {ytPreview && (
                <div style={styles.ytPreviewCard}>
                  <div style={styles.ytPosterWrapper}>
                    <img
                      src={ytPreview.thumbnailUrl}
                      alt={ytPreview.title}
                      style={styles.ytPosterImg}
                    />
                    <span style={styles.ytShortBadge}>SHORTS</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 600 }}>
                      @{ytPreview.authorName}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', lineHeight: 1.4 }}>
                      {ytPreview.title}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      <span style={styles.badgeGreen}>Ready for Instant Stream</span>
                      <span style={styles.badgePill}>Multi-bitrate Lossless</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={!youtubeUrl.trim() || isFetchingMeta}
                  onClick={() => handleYouTubeImport(true)}
                  style={{
                    ...styles.importDirectBtn,
                    opacity: !youtubeUrl.trim() || isFetchingMeta ? 0.5 : 1,
                    cursor: !youtubeUrl.trim() || isFetchingMeta ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span>⚡</span>
                  <span>Instant Direct Stream (Recommended)</span>
                </button>

                <button
                  type="button"
                  disabled={!youtubeUrl.trim() || isFetchingMeta}
                  onClick={() => handleYouTubeImport(false)}
                  style={{
                    ...styles.importTranscodeBtn,
                    opacity: !youtubeUrl.trim() || isFetchingMeta ? 0.5 : 1,
                    cursor: !youtubeUrl.trim() || isFetchingMeta ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span>☁️</span>
                  <span>Cloudflare Ingest</span>
                </button>
              </div>
            </div>
          )}

          {/* Active Tab: File Upload */}
          {activeTab === 'file' && (state.status === 'idle' || state.status === 'error' || isReplacing) && (
            <>
              <div
                style={{
                  ...styles.dropzone,
                  ...(isDragOver ? styles.dropzoneDragOver : {}),
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={styles.dropzoneIcon}>🎬</div>
                <p style={styles.dropzoneTitle}>
                  {isDragOver ? 'Drop video file here!' : 'Drag & drop short-form video file here'}
                </p>
                <p style={styles.dropzoneSub}>MP4, MOV, or WebM up to 500 MB</p>
                <div style={styles.browseBtn}>Browse Video File</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

// ─── Native Payload Dark Theme Styles with Comfortable Font Sizes ───────────

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    fontFamily: 'inherit',
    marginBottom: 20,
  },

  // ── Segmented Tabs: Clean Native Payload Dark Style ───────────────────────
  tabContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6,
    background: '#121214',
    border: '1px solid #27272a',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 18px',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: '#8b8b93',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tabButtonActive: {
    background: '#27272a',
    color: '#ffffff',
    border: '1px solid #3f3f46',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
  },

  // ── Card Box for YouTube Importer ─────────────────────────────────────────
  cardBox: {
    padding: 18,
    background: '#121214',
    border: '1px solid #27272a',
    borderRadius: 8,
  },
  ytInputHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ytInputTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#f4f4f5',
  },
  badgeAuto: {
    fontSize: 12,
    fontWeight: 500,
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.12)',
    padding: '3px 10px',
    borderRadius: 12,
    border: '1px solid rgba(16, 185, 129, 0.25)',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    background: '#09090b',
    border: '1px solid #27272a',
    borderRadius: 6,
    overflow: 'hidden',
  },
  inputPrefix: {
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ytInput: {
    flex: 1,
    height: 44,
    padding: '0 10px',
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    fontSize: 14,
    padding: '0 12px',
    cursor: 'pointer',
  },
  miniSpinner: {
    marginRight: 12,
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    borderTopColor: '#ffffff',
    animation: 'spin 0.8s linear infinite',
  },
  helperText: {
    margin: '10px 0 0',
    fontSize: 12,
    color: '#71717a',
    lineHeight: 1.5,
  },

  // ── YouTube Preview Miniature ─────────────────────────────────────────────
  ytPreviewCard: {
    marginTop: 14,
    padding: 14,
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 8,
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  ytPosterWrapper: {
    position: 'relative',
    width: 80,
    aspectRatio: '9 / 16',
    borderRadius: 6,
    overflow: 'hidden',
    background: '#000000',
    flexShrink: 0,
    border: '1px solid #27272a',
  },
  ytPosterImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  ytShortBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    fontSize: 9,
    fontWeight: 700,
    background: 'rgba(239, 68, 68, 0.9)',
    color: '#ffffff',
    padding: '2px 5px',
    borderRadius: 3,
  },
  badgeGreen: {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 4,
    background: 'rgba(16, 185, 129, 0.12)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.25)',
  },
  badgePill: {
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: 4,
    background: '#27272a',
    color: '#d4d4d8',
  },

  // ── Action Buttons ────────────────────────────────────────────────────────
  importDirectBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: '1 1 220px',
    padding: '11px 18px',
    background: 'linear-gradient(to right, #059669, #10b981)',
    border: 'none',
    borderRadius: 6,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 700,
    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  importTranscodeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: '1 1 180px',
    padding: '11px 18px',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: 6,
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // ── Dropzone for Direct Video Files ───────────────────────────────────────
  dropzone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '32px 20px',
    border: '2px dashed #27272a',
    borderRadius: 8,
    background: '#121214',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s ease',
  },
  dropzoneDragOver: {
    background: '#18181b',
    borderColor: '#3b82f6',
  },
  dropzoneIcon: { fontSize: 32, marginBottom: 2 },
  dropzoneTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: '#ffffff' },
  dropzoneSub: { margin: '2px 0 12px', fontSize: 12, color: '#71717a' },
  browseBtn: {
    padding: '8px 16px',
    background: '#27272a',
    color: '#e4e4e7',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    border: '1px solid #3f3f46',
  },

  // ── Replace Header Bar ────────────────────────────────────────────────────
  replaceHeaderBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  miniThumbWrapper: {
    width: 36,
    height: 54,
    borderRadius: 4,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.15)',
    background: '#000',
    flexShrink: 0,
  },
  miniThumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  miniThumbPlaceholder: {
    width: 36,
    height: 54,
    borderRadius: 4,
    background: '#27272a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    flexShrink: 0,
  },
  inlineCode: {
    color: '#ffffff',
    background: '#27272a',
    padding: '2px 8px',
    borderRadius: 4,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
  },
  cancelReplaceBtn: {
    padding: '7px 14px',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: 6,
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },

  // ── Banners (Error, Notice, Uploading) ─────────────────────────────────────
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: 8,
    fontSize: 13,
    color: '#fca5a5',
  },
  errorDismiss: {
    background: 'none',
    border: 'none',
    color: '#fca5a5',
    cursor: 'pointer',
    fontSize: 14,
  },
  quickFixBtn: {
    alignSelf: 'flex-start',
    marginTop: 3,
    padding: '5px 12px',
    borderRadius: 5,
    background: '#10b981',
    color: '#ffffff',
    border: 'none',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  uploadingCard: {
    padding: 18,
    background: '#121214',
    border: '1px solid #27272a',
    borderRadius: 8,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  fileIcon: { fontSize: 22 },
  fileName: { margin: 0, fontSize: 14, fontWeight: 600, color: '#ffffff' },
  fileMeta: { margin: '3px 0 0', fontSize: 12, color: '#a1a1aa' },
  progressPct: { fontSize: 14, fontWeight: 700, color: '#10b981' },
  progressTrack: {
    width: '100%',
    height: 6,
    background: '#27272a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(to right, #10b981, #059669)',
    transition: 'width 0.3s ease',
  },
  uploadingNote: { margin: '10px 0 0', fontSize: 12, color: '#71717a' },

  // ── DONE SUCCESS CARD: Pure Payload Dark Theme (Side-by-Side Flex Layout) ──
  doneCard: {
    background: '#121214',
    border: '1px solid #27272a',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  doneHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#18181b',
    borderBottom: '1px solid #27272a',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.12)',
    padding: '4px 10px',
    borderRadius: 12,
    border: '1px solid rgba(16, 185, 129, 0.25)',
  },
  checkIcon: {
    fontSize: 12,
    fontWeight: 700,
  },
  badgeSourceYt: {
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 4,
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  badgeSourceCf: {
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 4,
    background: 'rgba(249, 115, 22, 0.15)',
    color: '#fb923c',
    border: '1px solid rgba(249, 115, 22, 0.3)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  previewLinkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    color: '#a1a1aa',
    textDecoration: 'none',
    fontWeight: 500,
  },
  replaceBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: 6,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  noticeBox: {
    margin: '12px 16px 0',
    padding: '10px 14px',
    borderRadius: 6,
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    color: '#34d399',
    fontSize: 12,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  // ── Done Card Body: 9:16 Vertical Poster (Left) + Details (Right) ──────────
  cardBody: {
    display: 'flex',
    gap: 18,
    padding: 16,
    alignItems: 'flex-start',
  },
  thumbBox: {
    position: 'relative',
    width: 104,
    aspectRatio: '9 / 16',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#000000',
    flexShrink: 0,
    border: '1px solid #27272a',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#71717a',
    fontSize: 13,
    fontWeight: 600,
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    background: 'rgba(0, 0, 0, 0.8)',
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: 3,
    letterSpacing: '0.04em',
  },
  metaDetails: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  metaTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#ffffff',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    fontSize: 12,
    padding: '3px 10px',
    borderRadius: 4,
    background: '#18181b',
    border: '1px solid #27272a',
    color: '#a1a1aa',
  },
  codeSnippetGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 2,
  },
  snippetLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#71717a',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  snippetBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#09090b',
    border: '1px solid #27272a',
    borderRadius: 6,
    padding: '6px 10px',
    gap: 10,
  },
  snippetCode: {
    fontSize: 13,
    color: '#e4e4e7',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  snippetCodeUrl: {
    fontSize: 13,
    color: '#a1a1aa',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  copyBtn: {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 5,
    color: '#d4d4d8',
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  cardFooter: {
    background: '#141416',
    borderTop: '1px solid #1f1f23',
    padding: '10px 16px',
    fontSize: 12,
    color: '#a1a1aa',
    lineHeight: 1.4,
  },
  footerNote: {
    display: 'block',
  },
};

export default CloudflareVideoUpload;
