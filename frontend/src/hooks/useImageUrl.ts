import { useEffect, useState } from 'react';
import { api } from '../api';

// Bounded LRU-ish cache — an unbounded Map<string, blobUrl> here means every
// full-resolution image ever opened in a labelling session stays pinned in
// memory (never revoked) for the lifetime of the page. Evict the oldest
// entries past this cap and revoke their blob URLs.
const MAX_CACHED_BLOBS = 60;
const cache = new Map<string, string>();

function cacheSet(key: string, url: string) {
  cache.set(key, url);
  while (cache.size > MAX_CACHED_BLOBS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldestUrl = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

// Map iteration order is insertion order — re-inserting on access keeps
// recently-viewed images from being the ones evicted first.
function cacheGet(key: string): string | undefined {
  const url = cache.get(key);
  if (url !== undefined) {
    cache.delete(key);
    cache.set(key, url);
  }
  return url;
}

/**
 * Fetches an image URL through axios (with JWT auth) and returns a blob URL.
 * Caches results so the same image isn't fetched multiple times.
 */
export function useImageUrl(apiPath: string | null | undefined): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => {
    if (!apiPath) return null;
    return cacheGet(apiPath) || null;
  });

  useEffect(() => {
    if (!apiPath) return;
    const cached = cacheGet(apiPath);
    if (cached) {
      setBlobUrl(cached);
      return;
    }

    let cancelled = false;
    api.get(apiPath, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return;
        const url = URL.createObjectURL(res.data);
        cacheSet(apiPath, url);
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null);
      });

    return () => { cancelled = true; };
  }, [apiPath]);

  return blobUrl;
}