import { useEffect, useState } from 'react';
import { api } from '../api';

const cache = new Map<string, string>();

/**
 * Fetches an image URL through axios (with JWT auth) and returns a blob URL.
 * Caches results so the same image isn't fetched multiple times.
 */
export function useImageUrl(apiPath: string | null | undefined): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => {
    if (!apiPath) return null;
    return cache.get(apiPath) || null;
  });

  useEffect(() => {
    if (!apiPath) return;
    if (cache.has(apiPath)) {
      setBlobUrl(cache.get(apiPath)!);
      return;
    }

    let cancelled = false;
    api.get(apiPath, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return;
        const url = URL.createObjectURL(res.data);
        cache.set(apiPath, url);
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null);
      });

    return () => { cancelled = true; };
  }, [apiPath]);

  return blobUrl;
}