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

const CloudflareVideoUpload: React.FC = () => {
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

  // YouTube Ingestion State
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [isFetchingMeta, setIsFetchingMeta] = useState<boolean>(false);
  const [ytPreview, setYtPreview] = useState<YouTubePreview | null>(null);
  const [ytStep, setYtStep] = useState<number>(0); // 0: idle, 1: downloading, 2: cloudflare, 3: done

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
  const handleYouTubeImport = async () => {
    if (!youtubeUrl.trim()) return;

    setState({
      status: 'uploading',
      progress: 25,
      streamUid: null,
      hlsUrl: null,
      thumbnailUrl: null,
      errorMessage: null,
      fileName: 'YouTube Short (1080p Remux)',
      fileSize: null,
    });
    setYtStep(1);

    try {
      setTimeout(() => {
        setYtStep(2);
        setState((prev) => ({ ...prev, progress: 65 }));
      }, 1800);

      const res = await fetch('/api/youtube/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          caption: captionValue || ytPreview?.title || '',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Import failed: HTTP ${res.status}`);
      }

      const { data } = await res.json();
      setYtStep(3);

      // Populate Payload CMS form fields automatically!
      setStreamUid(data.streamUid);
      setVideoSource('cloudflare');
      setHlsUrl(data.hlsUrl);
      if (data.thumbnailUrl) setThumbnailUrl(data.thumbnailUrl);
      if (data.animatedWebpUrl) setAnimatedWebpUrl(data.animatedWebpUrl);
      if (data.caption && !captionValue) setCaption(data.caption);
      setStatus('ready');

      setState({
        status: 'done',
        progress: 100,
        streamUid: data.streamUid,
        hlsUrl: data.hlsUrl,
        thumbnailUrl: data.thumbnailUrl,
        errorMessage: null,
        fileName: `${data.caption || 'YouTube Short'} (1080p)`,
        fileSize: null,
      });
    } catch (err: any) {
      console.error('YouTube import error in CMS:', err);
      setYtStep(0);
      setState({
        status: 'error',
        progress: 0,
        streamUid: null,
        hlsUrl: null,
        thumbnailUrl: null,
        errorMessage: err.message || 'Failed to import YouTube Short. Please verify the URL.',
        fileName: null,
        fileSize: null,
      });
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
        const urlRes = await fetch('/api/cloudflare/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxDurationSeconds: 300 }),
        });

        if (!urlRes.ok) {
          throw new Error(`Failed to get upload URL: HTTP ${urlRes.status}`);
        }

        const { data } = await urlRes.json();
        const { uploadUrl, streamUid, hlsUrl, thumbnailUrl } = data;

        setState((prev) => ({ ...prev, status: 'uploading', progress: 0 }));

        await directUpload(uploadUrl, file, (pct) => {
          setState((prev) => ({ ...prev, progress: pct }));
        });

        setStreamUid(streamUid);
        setVideoSource('cloudflare');
        setHlsUrl(hlsUrl);
        if (thumbnailUrl) setThumbnailUrl(thumbnailUrl);
        setStatus('ready');

        if (!captionValue) {
          const cleanName = file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          setCaption(cleanName);
        }

        setState({
          status: 'done',
          progress: 100,
          streamUid,
          hlsUrl,
          thumbnailUrl: thumbnailUrl || null,
          errorMessage: null,
          fileName: file.name,
          fileSize: file.size,
        });
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: err.message || 'Upload failed. Please try again.',
        }));
      }
    },
    [setStreamUid, setVideoSource, setHlsUrl, setThumbnailUrl, setCaption, setStatus, captionValue]
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

  const handleReset = () => {
    setState({
      status: 'idle',
      progress: 0,
      streamUid: null,
      hlsUrl: null,
      thumbnailUrl: null,
      errorMessage: null,
      fileName: null,
      fileSize: null,
    });
    setYoutubeUrl('');
    setYtPreview(null);
    setYtStep(0);
    setStreamUid('');
    setVideoSource('cloudflare');
    setHlsUrl('');
    setThumbnailUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={styles.wrapper}>
      {/* ── Mode Switcher Tabs ── */}
      <div style={styles.tabContainer}>
        <button
          type="button"
          onClick={() => {
            setActiveTab('youtube');
            if (state.status === 'error') setState((p) => ({ ...p, status: 'idle', errorMessage: null }));
          }}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'youtube' ? styles.tabButtonActiveYt : {}),
          }}
        >
          <span style={{ fontSize: 16 }}>⚡</span>
          <span>Import from YouTube Shorts</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('file');
            if (state.status === 'error') setState((p) => ({ ...p, status: 'idle', errorMessage: null }));
          }}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'file' ? styles.tabButtonActiveFile : {}),
          }}
        >
          <span style={{ fontSize: 16 }}>📁</span>
          <span>Direct Video File Upload</span>
        </button>
      </div>

      {/* ── ERROR BANNER ── */}
      {state.status === 'error' && (
        <div style={styles.errorBanner}>
          <span>⚠️</span>
          <span>{state.errorMessage}</span>
          <button type="button" onClick={() => setState((p) => ({ ...p, status: 'idle', errorMessage: null }))} style={styles.errorDismiss}>
            ✕
          </button>
        </div>
      )}

      {/* ── ACTIVE TAB: YOUTUBE SHORTS IMPORTER ── */}
      {activeTab === 'youtube' && (state.status === 'idle' || state.status === 'error') && (
        <div style={styles.cardBox}>
          <div style={styles.ytInputHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#ef4444', fontSize: 18 }}>▶</span>
              <span style={styles.ytInputTitle}>Paste YouTube Shorts or Video Link</span>
            </div>
            <span style={styles.badgeHq}>1080p Full HD Lossless Remux</span>
          </div>

          <div style={styles.inputWrapper}>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/shorts/..."
              style={styles.ytInput}
            />
            {isFetchingMeta && <div style={styles.miniSpinner} />}
          </div>

          <p style={styles.helperText}>
            The system will automatically download the 1080p stream and transcode it to Cloudflare Stream HLS.
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
                <span style={styles.ytShortBadge}>Shorts</span>
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>
                  @{ytPreview.authorName}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', lineHeight: 1.4 }}>
                  {ytPreview.title}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={styles.badgeGreen}>Ready for Cloudflare Ingestion</span>
                  <span style={styles.badgePill}>Multi-bitrate Adaptive HLS</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              disabled={!youtubeUrl.trim() || isFetchingMeta}
              onClick={handleYouTubeImport}
              style={{
                ...styles.importBtn,
                opacity: !youtubeUrl.trim() || isFetchingMeta ? 0.5 : 1,
                cursor: !youtubeUrl.trim() || isFetchingMeta ? 'not-allowed' : 'pointer',
              }}
            >
              <span>⚡</span>
              <span>Import & Transcode 1080p to Cloudflare</span>
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVE TAB: DIRECT FILE DROPZONE ── */}
      {activeTab === 'file' && (state.status === 'idle' || state.status === 'error') && (
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
              {isDragOver ? 'Drop it here!' : 'Drag & drop your video here'}
            </p>
            <p style={styles.dropzoneSub}>or click to browse from your device</p>
            <div style={styles.browseBtn}>Choose Video File</div>
            <p style={styles.dropzoneFormats}>MP4 · MOV · WebM · AVI — up to 500 MB</p>
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

      {/* ── REQUESTING / UPLOADING STATE ── */}
      {(state.status === 'requesting' || state.status === 'uploading') && (
        <div style={styles.uploadingCard}>
          <div style={styles.fileRow}>
            <span style={styles.fileIcon}>⚡</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.fileName}>{state.fileName || 'Processing video stream…'}</p>
              <p style={styles.fileMeta}>
                {ytStep === 1
                  ? 'Extracting 1080p video & high-bitrate audio from YouTube…'
                  : ytStep === 2
                  ? 'Streaming into Cloudflare CDN & generating HLS manifest…'
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
            ⚡ Ingesting master video to Cloudflare Stream — please keep this tab open
          </p>
        </div>
      )}

      {/* ── DONE SUCCESS CARD ── */}
      {state.status === 'done' && state.streamUid && (
        <div style={styles.doneCard}>
          <div style={styles.doneHeader}>
            <div style={styles.doneCheck}>✓</div>
            <div>
              <p style={styles.doneTitle}>Video ready on Cloudflare Stream</p>
              <p style={styles.doneSub}>
                Adaptive multi-bitrate HLS manifest configured — click <strong>Save</strong> above to finalize!
              </p>
            </div>
          </div>

          {state.thumbnailUrl && (
            <div style={styles.thumbWrapper}>
              <img
                src={state.thumbnailUrl}
                alt="Video thumbnail"
                style={styles.thumbImg}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div style={styles.thumbOverlay}>
                <span style={styles.thumbPlayIcon}>▶</span>
              </div>
            </div>
          )}

          <div style={styles.infoGrid}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Stream UID</span>
              <code style={styles.infoValue}>{state.streamUid}</code>
            </div>
            {state.hlsUrl && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>HLS URL</span>
                <span style={{ ...styles.infoValue, fontSize: 11, wordBreak: 'break-all' }}>
                  {state.hlsUrl}
                </span>
              </div>
            )}
          </div>

          <div style={styles.doneActions}>
            <button type="button" onClick={handleReset} style={styles.reuploadBtn}>
              Upload / Import Another Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudflareVideoUpload;

// ─── Inline Styles ────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    fontFamily: 'inherit',
    marginBottom: 20,
  },
  tabContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    background: '#121214',
    border: '1px solid #27272a',
    borderRadius: 10,
    padding: 6,
    marginBottom: 16,
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: 7,
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  tabButtonActiveYt: {
    background: '#ef4444',
    color: '#ffffff',
    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
  },
  tabButtonActiveFile: {
    background: '#f97316',
    color: '#ffffff',
    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
  },
  cardBox: {
    padding: 20,
    background: '#121214',
    border: '1px solid #27272a',
    borderRadius: 10,
  },
  ytInputHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ytInputTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#f4f4f5',
  },
  badgeHq: {
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 999,
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  ytInput: {
    width: '100%',
    padding: '12px 14px',
    background: '#09090b',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  miniSpinner: {
    position: 'absolute',
    right: 14,
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '2px solid rgba(239, 68, 68, 0.3)',
    borderTopColor: '#ef4444',
    animation: 'spin 0.8s linear infinite',
  },
  helperText: {
    margin: '8px 0 0',
    fontSize: 11,
    color: '#71717a',
  },
  ytPreviewCard: {
    marginTop: 14,
    padding: 12,
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 8,
    display: 'flex',
    gap: 14,
    alignItems: 'center',
  },
  ytPosterWrapper: {
    position: 'relative',
    width: 64,
    aspectRatio: '9 / 16',
    borderRadius: 6,
    overflow: 'hidden',
    background: '#000000',
    flexShrink: 0,
  },
  ytPosterImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  ytShortBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    fontSize: 9,
    fontWeight: 700,
    background: 'rgba(0,0,0,0.7)',
    color: '#ffffff',
    padding: '1px 4px',
    borderRadius: 3,
  },
  badgeGreen: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  badgePill: {
    fontSize: 10,
    fontWeight: 500,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#27272a',
    color: '#d4d4d8',
  },
  importBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '12px 18px',
    background: 'linear-gradient(to right, #ef4444, #f97316)',
    border: 'none',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 700,
    boxShadow: '0 2px 10px rgba(239, 68, 68, 0.3)',
    transition: 'opacity 0.2s ease',
  },
  dropzone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '36px 20px',
    border: '2px dashed #27272a',
    borderRadius: 8,
    background: '#121214',
    cursor: 'pointer',
    textAlign: 'center',
  },
  dropzoneDragOver: {
    background: '#18181b',
    borderColor: '#f97316',
  },
  dropzoneIcon: { fontSize: 32, marginBottom: 2 },
  dropzoneTitle: { margin: 0, fontSize: 14, fontWeight: 600, color: '#ffffff' },
  dropzoneSub: { margin: '2px 0 10px', fontSize: 12, color: '#71717a' },
  browseBtn: {
    padding: '7px 18px',
    background: '#ffffff',
    color: '#09090b',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  dropzoneFormats: { margin: '8px 0 0', fontSize: 11, color: '#52525b' },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    padding: '10px 14px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 6,
    fontSize: 12,
    color: '#fca5a5',
  },
  errorDismiss: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#fca5a5',
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
  fileName: { margin: 0, fontSize: 13, fontWeight: 600, color: '#ffffff' },
  fileMeta: { margin: '2px 0 0', fontSize: 11, color: '#a1a1aa' },
  progressPct: { fontSize: 14, fontWeight: 700, color: '#f97316' },
  progressTrack: {
    width: '100%',
    height: 6,
    background: '#27272a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(to right, #ef4444, #f97316)',
    transition: 'width 0.3s ease',
  },
  uploadingNote: { margin: '8px 0 0', fontSize: 11, color: '#71717a' },
  doneCard: {
    padding: 18,
    background: '#121214',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: 8,
  },
  doneHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  doneCheck: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.2)',
    border: '1px solid #10b981',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
  },
  doneTitle: { margin: 0, fontSize: 14, fontWeight: 600, color: '#ffffff' },
  doneSub: { margin: '2px 0 0', fontSize: 11, color: '#71717a' },
  thumbWrapper: {
    position: 'relative',
    width: '100%',
    maxHeight: 180,
    borderRadius: 6,
    overflow: 'hidden',
    background: '#000000',
    marginBottom: 14,
    display: 'flex',
    justifyContent: 'center',
  },
  thumbImg: { maxHeight: 180, objectFit: 'contain' },
  thumbOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
  },
  thumbPlayIcon: { color: '#ffffff', fontSize: 24, opacity: 0.9 },
  infoGrid: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 },
  infoLabel: { color: '#71717a' },
  infoValue: { color: '#ffffff', fontFamily: 'monospace' },
  doneActions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  reuploadBtn: {
    padding: '7px 14px',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: 6,
    color: '#d4d4d8',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
