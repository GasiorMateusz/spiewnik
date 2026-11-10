import { useSyncExternalStore } from 'react';
import type { Route } from '../types';

/**
 * Pure parsing function for hash routes.
 * Normalizes query params, duplicate slashes, and percent-encoded diacritics.
 *
 * Supported schemas:
 * - #/ , "" , "#" , "#!/"        => { type: 'catalog' }
 * - #/song/:slug                 => { type: 'song', slug }
 * - #/artist/:slug               => { type: 'artist', slug }
 * - everything else              => { type: 'not-found', path }
 */
export function parseHashRoute(hash: string): Route {
  if (!hash) {
    return { type: 'catalog' };
  }

  // Strip leading hash/shebang marks
  const clean = hash.replace(/^[#!]+/, '');
  // Strip query parameters (?...) and secondary hash fragments (#...)
  const pathWithoutQuery = clean.split('?')[0].split('#')[0];
  // Split into segments and filter empty entries
  const segments = pathWithoutQuery.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { type: 'catalog' };
  }

  const keyword = segments[0].toLowerCase();

  if ((keyword === 'song' || keyword === 'artist') && segments.length === 2 && segments[1]) {
    let slug = segments[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // Fallback to raw string if malformed percent-encoding
    }
    return { type: keyword, slug };
  }

  return { type: 'not-found', path: '/' + segments.join('/') };
}

/**
 * Structural equality check for Route objects.
 * Prevents snapshot churn if hash string changed but semantic route remained identical.
 */
export function areRoutesEqual(a: Route, b: Route): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;
  if (a.type === 'catalog') return true;
  if (a.type === 'not-found') return a.path === (b as typeof a).path;
  return a.slug === (b as typeof a).slug;
}

// Module-level snapshot cache to guarantee referential equality for React 19
let cachedRawHash: string | null = null;
let cachedRoute: Route = { type: 'catalog' };

export function getSnapshot(): Route {
  if (typeof window === 'undefined') {
    return SERVER_SNAPSHOT;
  }

  const currentHash = window.location.hash || '#/';
  if (currentHash !== cachedRawHash) {
    cachedRawHash = currentHash;
    const nextRoute = parseHashRoute(currentHash);
    if (!areRoutesEqual(cachedRoute, nextRoute)) {
      cachedRoute = nextRoute;
    }
  }
  return cachedRoute;
}

const SERVER_SNAPSHOT: Route = Object.freeze({ type: 'catalog' });

export function getServerSnapshot(): Route {
  return SERVER_SNAPSHOT;
}

export function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}

/**
 * Zero-dependency hash routing hook powered by React 19 useSyncExternalStore (REQ-CAT-5).
 * Guarantees referential stability between render passes when the route is unchanged.
 */
export function useHashRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Programmatic navigation helper.
 * Normalizes input hash, prepends #/ if omitted, and updates window.location.hash.
 */
export function navigate(targetHash: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = targetHash.trim();
  let normalized = trimmed;
  if (!normalized || normalized === '#' || normalized === '#/') {
    normalized = '#/';
  } else if (!normalized.startsWith('#')) {
    normalized = `#${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
  }

  if (window.location.hash !== normalized) {
    window.location.hash = normalized;
  }
}
