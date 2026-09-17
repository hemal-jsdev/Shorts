'use client';

import { useEffect } from 'react';

/**
 * Automatically cleans stale `?notFound=<id>` query parameters from the browser URL
 * so deleted document flash notices do not persist across refreshes.
 */
export default function AdminUrlCleaner() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.location.search.includes('notFound=')) {
      const timeout = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('notFound');
        const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }, 2500);

      return () => clearTimeout(timeout);
    }
  }, []);

  return null;
}
