'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useField } from '@payloadcms/ui';

interface YouTubeMetadata {
  videoId: string;
  title: string;
  caption: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  embedUrl: string;
  hlsUrl: string;
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.trim().match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

interface YouTubeUrlFieldProps {
  path?: string;
  field?: {
    label?: string;
    admin?: {
      description?: string;
    };
  };
}

const YouTubeUrlField: React.FC<YouTubeUrlFieldProps> = ({ path: propsPath }) => {
  const fieldPath = propsPath || 'youtubeUrl';

  // Fields connected via Payload's useField hook
  const { value: rawUrl, setValue: setUrl } = useField<string>({ path: fieldPath });
  const { value: captionValue, setValue: setCaption } = useField<string>({ path: 'caption' });
  const { value: streamUidValue, setValue: setStreamUid } = useField<string>({ path: 'streamUid' });
  const { value: hlsUrlValue, setValue: setHlsUrl } = useField<string>({ path: 'hlsUrl' });
  const { value: thumbValue, setValue: setThumbnailUrl } = useField<string>({ path: 'thumbnailUrl' });
  const { setValue: setAnimatedWebpUrl } = useField<string>({ path: 'animatedWebpUrl' });
  const { setValue: setStatus } = useField<string>({ path: 'status' });
  const { setValue: setVideoSource } = useField<string>({ path: 'videoSource' });

  const [inputVal, setInputVal] = useState<string>(rawUrl ? String(rawUrl) : '');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<YouTubeMetadata | null>(null);
  const [lastFetchedId, setLastFetchedId] = useState<string | null>(null);

  // Keep internal input synced if form value changes externally
  useEffect(() => {
    if (rawUrl && rawUrl !== inputVal) {
      setInputVal(String(rawUrl));
    }
  }, [rawUrl]);

  // If already populated on initial load (e.g. editing an existing reel)
  useEffect(() => {
    const ytId = extractYouTubeId(String(rawUrl || ''));
    if (ytId && captionValue && thumbValue && !meta) {
      setLastFetchedId(ytId);
      setMeta({
        videoId: ytId,
        title: String(captionValue),
        caption: String(captionValue),
        authorName: 'YouTube Creator',
        authorUrl: `https://www.youtube.com/shorts/${ytId}`,
        thumbnailUrl: String(thumbValue),
        embedUrl: `https://www.youtube.com/shorts/${ytId}`,
        hlsUrl: `https://www.youtube.com/shorts/${ytId}`,
      });
    }
  }, []);

  // Fetch details from backend route
  const fetchDetails = useCallback(
    async (url: string, force = false) => {
      const ytId = extractYouTubeId(url);
      if (!ytId) {
        setError('Please enter a valid YouTube Shorts URL');
        return;
      }

      if (!force && ytId === lastFetchedId && meta) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/youtube/metadata?url=${encodeURIComponent(url.trim())}`);
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to fetch YouTube details');
        }

        const data: YouTubeMetadata = json.data;
        setMeta(data);
        setLastFetchedId(data.videoId);

        // Auto-fill all Payload CMS fields
        setUrl(url.trim());
        setVideoSource('youtube');
        setStreamUid(data.videoId);
        setCaption(data.title || data.caption);
        setHlsUrl(data.hlsUrl || `https://www.youtube.com/shorts/${data.videoId}`);
        setThumbnailUrl(data.thumbnailUrl);
        setAnimatedWebpUrl(data.thumbnailUrl);
        setStatus('ready');
      } catch (err: any) {
        setError(err.message || 'Failed to load video details');
      } finally {
        setLoading(false);
      }
    },
    [lastFetchedId, meta, setUrl, setVideoSource, setStreamUid, setCaption, setHlsUrl, setThumbnailUrl, setAnimatedWebpUrl, setStatus]
  );

  // Debounced auto-fetch on typing/pasting
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputVal(val);
    setError(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = val.trim();
    if (!trimmed) {
      setMeta(null);
      setLastFetchedId(null);
      setUrl('');
      return;
    }

    const ytId = extractYouTubeId(trimmed);
    if (ytId) {
      // Auto-trigger fetch after short debounce
      debounceTimerRef.current = setTimeout(() => {
        fetchDetails(trimmed);
      }, 400);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && extractYouTubeId(pasted.trim())) {
      // Immediate fetch on paste without waiting for debounce
      setTimeout(() => {
        fetchDetails(pasted.trim(), true);
      }, 50);
    }
  };

  const handleClear = () => {
    setInputVal('');
    setUrl('');
    setMeta(null);
    setLastFetchedId(null);
    setError(null);
  };

  return (
    <div style={styles.fieldContainer}>
      {/* Label and Helper Header */}
      <div style={styles.labelRow}>
        <label style={styles.label}>
          <span style={styles.ytIcon}>▶</span>
          <span>YouTube Short URL</span>
          <span style={styles.requiredStar}>*</span>
        </label>
        <span style={styles.badgeAuto}>⚡ Auto-fetch enabled</span>
      </div>

      {/* Input Group */}
      <div style={styles.inputWrapper}>
        <div style={styles.inputPrefix}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ff0000" style={{ display: 'block' }}>
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
        </div>
        <input
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          onPaste={handlePaste}
          placeholder="Paste YouTube Shorts link (e.g. https://www.youtube.com/shorts/...)"
          style={{
            ...styles.input,
            borderColor: error ? '#ef4444' : loading ? '#3b82f6' : '#27272a',
          }}
          disabled={loading}
        />
        {inputVal && !loading && (
          <button
            type="button"
            onClick={handleClear}
            style={styles.clearBtn}
            title="Clear URL"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => fetchDetails(inputVal, true)}
          disabled={loading || !extractYouTubeId(inputVal)}
          style={{
            ...styles.fetchBtn,
            opacity: loading || !extractYouTubeId(inputVal) ? 0.5 : 1,
            cursor: loading || !extractYouTubeId(inputVal) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <span style={styles.btnLoading}>
              <span style={styles.spinner} />
              Fetching…
            </span>
          ) : (
            'Fetch Details'
          )}
        </button>
      </div>

      <p style={styles.helpText}>
        Paste any YouTube Shorts URL. Title, thumbnail, author, and playback links will be automatically extracted and filled into the form fields below.
      </p>

      {/* Loading state indicator */}
      {loading && (
        <div style={styles.loadingBanner}>
          <span style={styles.spinner} />
          <span>Contacting YouTube & extracting metadata…</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={styles.errorBanner}>
          <span style={styles.errorIcon}>⚠️</span>
          <span style={styles.errorText}>{error}</span>
          <button
            type="button"
            onClick={() => fetchDetails(inputVal, true)}
            style={styles.retryBtn}
          >
            Retry
          </button>
        </div>
      )}

      {/* Success Metadata Preview Card — Pure Payload Black Theme */}
      {meta && !loading && (
        <div style={styles.previewCard}>
          <div style={styles.previewHeader}>
            <div style={styles.statusPill}>
              <span style={styles.checkIcon}>✓</span>
              <span>Details auto-fetched</span>
            </div>
            <div style={styles.headerActions}>
              <a
                href={meta.embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.linkOut}
              >
                Watch on YouTube ↗
              </a>
              <button
                type="button"
                onClick={() => fetchDetails(inputVal, true)}
                style={styles.refreshBtn}
                title="Re-fetch metadata from YouTube"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div style={styles.cardBody}>
            {/* Thumbnail */}
            <div style={styles.thumbBox}>
              <img
                src={meta.thumbnailUrl}
                alt={meta.title}
                style={styles.thumbImg}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${meta.videoId}/hqdefault.jpg`;
                }}
              />
              <span style={styles.shortsTag}>SHORTS</span>
            </div>

            {/* Video Info */}
            <div style={styles.metaDetails}>
              <div style={styles.metaTitle}>{meta.title}</div>
              <div style={styles.metaChannel}>
                <span style={styles.channelIcon}>👤</span>
                <a
                  href={meta.authorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.channelLink}
                >
                  {meta.authorName}
                </a>
              </div>

              {/* Form Autofill Notification Chips */}
              <div style={styles.chipsRow}>
                <span style={styles.chip}>
                  <strong>ID:</strong> {meta.videoId}
                </span>
                <span style={styles.chip}>
                  <strong>Status:</strong> Ready
                </span>
              </div>
            </div>
          </div>

          <div style={styles.cardFooter}>
            <span style={styles.footerNote}>
              ✓ Title, thumbnail, and stream links have been automatically populated in the fields below. You can edit them if desired.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Native Payload Black Theme Inline Styles ──────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  fieldContainer: {
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontFamily: 'inherit',
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '2px',
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#e4e4e7',
    letterSpacing: '-0.01em',
  },
  ytIcon: {
    color: '#ef4444',
    fontSize: '12px',
  },
  requiredStar: {
    color: '#ef4444',
    marginLeft: '2px',
  },
  badgeAuto: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.12)',
    padding: '2px 8px',
    borderRadius: '12px',
    border: '1px solid rgba(16, 185, 129, 0.25)',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
    background: '#121214',
    borderRadius: '8px',
    border: '1px solid #27272a',
    overflow: 'hidden',
    transition: 'border-color 0.2s ease',
  },
  inputPrefix: {
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
  },
  input: {
    flex: 1,
    height: '42px',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontFamily: 'inherit',
    padding: '0 4px',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    fontSize: '13px',
    padding: '0 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fetchBtn: {
    height: '42px',
    padding: '0 18px',
    background: '#27272a',
    border: 'none',
    borderLeft: '1px solid #3f3f46',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease',
  },
  btnLoading: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  helpText: {
    margin: '0',
    fontSize: '12px',
    color: '#71717a',
    lineHeight: '1.4',
  },
  loadingBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    background: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#93c5fd',
  },
  spinner: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    borderTopColor: '#ffffff',
    display: 'inline-block',
    animation: 'spin 0.8s linear infinite',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#fca5a5',
  },
  errorIcon: {
    marginRight: '6px',
  },
  errorText: {
    flex: 1,
  },
  retryBtn: {
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#ffffff',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
    fontWeight: 600,
  },

  // ── Preview Card — Dark & Monochromatic to match Payload ──────────────────
  previewCard: {
    marginTop: '6px',
    background: '#121214',
    border: '1px solid #27272a',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: '#18181b',
    borderBottom: '1px solid #27272a',
  },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#10b981',
    letterSpacing: '0.02em',
  },
  checkIcon: {
    fontSize: '12px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  linkOut: {
    fontSize: '11px',
    color: '#a1a1aa',
    textDecoration: 'none',
    fontWeight: 500,
  },
  refreshBtn: {
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    fontSize: '11px',
    cursor: 'pointer',
    padding: 0,
  },
  cardBody: {
    display: 'flex',
    gap: '16px',
    padding: '14px',
    alignItems: 'flex-start',
  },
  thumbBox: {
    position: 'relative',
    width: '80px',
    height: '120px',
    borderRadius: '6px',
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
  shortsTag: {
    position: 'absolute',
    bottom: '4px',
    left: '4px',
    background: 'rgba(239, 68, 68, 0.9)',
    color: '#ffffff',
    fontSize: '9px',
    fontWeight: 800,
    padding: '1px 4px',
    borderRadius: '3px',
    letterSpacing: '0.05em',
  },
  metaDetails: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  metaTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
    lineHeight: '1.4',
  },
  metaChannel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#a1a1aa',
  },
  channelIcon: {
    fontSize: '12px',
  },
  channelLink: {
    color: '#e4e4e7',
    textDecoration: 'none',
    fontWeight: 500,
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px',
  },
  chip: {
    fontSize: '10px',
    color: '#a1a1aa',
    background: '#1e1e24',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid #2e2e38',
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '2px',
  },
  tagPill: {
    fontSize: '10px',
    color: '#71717a',
  },
  cardFooter: {
    padding: '8px 14px',
    background: '#141416',
    borderTop: '1px solid #222226',
  },
  footerNote: {
    fontSize: '11px',
    color: '#52525b',
  },
};

export default YouTubeUrlField;
