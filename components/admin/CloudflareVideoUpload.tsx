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

// ─── Format helper ────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const CloudflareVideoUpload: React.FC = () => {
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

  // Sync initial values from existing Payload form data
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

  const processFile = useCallback(async (file: File) => {
    // Validate file type
    const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!allowed.includes(file.type)) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: 'Unsupported format. Please upload MP4, MOV, or WebM.',
      }));
      return;
    }

    // Validate size (max 500 MB)
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
      // 1. Request a direct upload URL from Cloudflare Stream via our API
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

      // 2. Direct upload file to Cloudflare Stream CDN
      await directUpload(uploadUrl, file, (pct) => {
        setState((prev) => ({ ...prev, progress: pct }));
      });

      // 3. Update Payload form fields
      setStreamUid(streamUid);
      setVideoSource('cloudflare');
      setHlsUrl(hlsUrl);
      setThumbnailUrl(thumbnailUrl);

      if (!captionValue) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setCaption(cleanName);
      }

      setState((prev) => ({
        ...prev,
        status: 'done',
        progress: 100,
        streamUid,
        hlsUrl,
        thumbnailUrl,
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: err.message || 'Upload failed. Please try again.',
      }));
    }
  }, [setStreamUid, setVideoSource, setHlsUrl, setThumbnailUrl, setCaption, captionValue]);

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
    setStreamUid('');
    setVideoSource('cloudflare');
    setHlsUrl('');
    setThumbnailUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>☁️</span>
        <div>
          <p style={styles.headerTitle}>Cloudflare Stream — Direct Upload</p>
          <p style={styles.headerSub}>
            Upload MP4, MOV, or WebM · Max 500 MB · HLS adaptive streaming
          </p>
        </div>
      </div>

      {/* ── IDLE / DRAG DROP ZONE ── */}
      {(state.status === 'idle' || state.status === 'error') && (
        <>
          <div
            style={{
              ...styles.dropzone,
              ...(isDragOver ? styles.dropzoneDragOver : {}),
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
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
          {state.status === 'error' && (
            <div style={styles.errorBanner}>
              <span>⚠️</span> {state.errorMessage}
            </div>
          )}
        </>
      )}

      {/* ── REQUESTING URL ── */}
      {state.status === 'requesting' && (
        <div style={styles.statusCard}>
          <div style={styles.spinner} />
          <div>
            <p style={styles.statusTitle}>Preparing upload…</p>
            <p style={styles.statusSub}>Getting secure upload URL from Cloudflare</p>
          </div>
        </div>
      )}

      {/* ── UPLOADING ── */}
      {state.status === 'uploading' && (
        <div style={styles.uploadingCard}>
          <div style={styles.fileRow}>
            <span style={styles.fileIcon}>🎥</span>
            <div style={{ flex: 1 }}>
              <p style={styles.fileName}>{state.fileName}</p>
              <p style={styles.fileMeta}>{formatBytes(state.fileSize || 0)}</p>
            </div>
            <span style={styles.progressPct}>{state.progress}%</span>
          </div>

          {/* Progress bar track */}
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${state.progress}%`,
              }}
            />
          </div>
          <p style={styles.uploadingNote}>
            ⚡ Uploading directly to Cloudflare Stream — do not close this page
          </p>
        </div>
      )}

      {/* ── DONE ── */}
      {state.status === 'done' && state.streamUid && (
        <div style={styles.doneCard}>
          <div style={styles.doneHeader}>
            <div style={styles.doneCheck}>✓</div>
            <div>
              <p style={styles.doneTitle}>Video uploaded successfully</p>
              <p style={styles.doneSub}>
                Cloudflare is transcoding — HLS will be ready in ~30 seconds
              </p>
            </div>
          </div>

          {/* Thumbnail preview */}
          {state.thumbnailUrl && (
            <div style={styles.thumbWrapper}>
              <img
                src={state.thumbnailUrl}
                alt="Video thumbnail"
                style={styles.thumbImg}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div style={styles.thumbOverlay}>
                <span style={styles.thumbPlayIcon}>▶</span>
              </div>
            </div>
          )}

          {/* UID info */}
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
            <a
              href={`https://dash.cloudflare.com/?to=/:account/stream/${state.streamUid}`}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.dashLink}
            >
              View in Cloudflare Dashboard ↗
            </a>
            <button onClick={handleReset} style={styles.reuploadBtn}>
              Upload a Different Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Inline Styles ────────────────────────────────────────────────────────────
// Using inline styles to work regardless of admin CSS framework

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    fontFamily: 'inherit',
    marginBottom: 20,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    padding: '12px 16px',
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 8,
  },
  headerIcon: { fontSize: 20, flexShrink: 0 },
  headerTitle: { margin: 0, fontWeight: 600, fontSize: 13, color: '#f4f4f5' },
  headerSub: { margin: '2px 0 0', fontSize: 12, color: '#71717a' },

  // Dropzone
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
    transition: 'all 0.15s ease',
    textAlign: 'center',
  },
  dropzoneDragOver: {
    background: '#18181b',
    borderColor: '#52525b',
    transform: 'scale(1.005)',
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
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },
  dropzoneFormats: { margin: '8px 0 0', fontSize: 11, color: '#52525b' },

  // Error
  errorBanner: {
    marginTop: 12,
    padding: '10px 14px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: 6,
    fontSize: 12,
    color: '#fca5a5',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },

  // Status card (requesting)
  statusCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '16px 18px',
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 8,
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2px solid rgba(255, 255, 255, 0.15)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  },
  statusTitle: { margin: 0, fontWeight: 600, fontSize: 13, color: '#f4f4f5' },
  statusSub: { margin: '2px 0 0', fontSize: 12, color: '#71717a' },

  // Uploading card
  uploadingCard: {
    padding: '16px 18px',
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 8,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  fileIcon: { fontSize: 20, flexShrink: 0 },
  fileName: { margin: 0, fontWeight: 600, fontSize: 13, color: '#ffffff' },
  fileMeta: { margin: '2px 0 0', fontSize: 11, color: '#71717a' },
  progressPct: { fontWeight: 700, fontSize: 14, color: '#ffffff', flexShrink: 0 },
  progressTrack: {
    height: 4,
    background: '#27272a',
    borderRadius: 99,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    background: '#ffffff',
    borderRadius: 99,
    transition: 'width 0.2s ease',
  },
  uploadingNote: {
    margin: 0,
    fontSize: 11,
    color: '#71717a',
    textAlign: 'center',
  },

  // Done card
  doneCard: {
    padding: '16px 18px',
    background: '#121214',
    border: '1px solid #27272a',
    borderRadius: 8,
  },
  doneHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  doneCheck: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#10b981',
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  doneTitle: { margin: 0, fontWeight: 600, fontSize: 13, color: '#10b981' },
  doneSub: { margin: '2px 0 0', fontSize: 12, color: '#71717a' },

  // Thumbnail
  thumbWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: 160,
    aspectRatio: '9/16',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 14,
    background: '#09090b',
    border: '1px solid #27272a',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  thumbOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.2)',
  },
  thumbPlayIcon: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.85)',
  },

  // Info grid
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 14,
    padding: '10px 12px',
    background: '#18181b',
    borderRadius: 6,
    border: '1px solid #27272a',
  },
  infoRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#71717a',
  },
  infoValue: {
    fontSize: 12,
    color: '#e4e4e7',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },

  // Done actions
  doneActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  dashLink: {
    fontSize: 12,
    color: '#ffffff',
    textDecoration: 'none',
    fontWeight: 500,
    padding: '5px 10px',
    background: '#27272a',
    borderRadius: 4,
    border: '1px solid #3f3f46',
  },
  reuploadBtn: {
    fontSize: 12,
    color: '#a1a1aa',
    background: 'transparent',
    border: '1px solid #27272a',
    borderRadius: 4,
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};

// Inject keyframe animation for spinner
if (typeof document !== 'undefined') {
  const styleId = 'cf-upload-spin';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  }
}

export default CloudflareVideoUpload;
