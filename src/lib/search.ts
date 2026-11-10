import type { ParsedSong, ArtistCatalogItem } from '../types';
import { isChordLine } from './chordNotation';

/**
 * Normalizes text for case-insensitive and Polish diacritic-insensitive search.
 * Handles Polish stroke characters (ł/Ł -> l) followed by Unicode NFD decomposition.
 */
export function normalizeSearchText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[łŁ]/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Strips chord tokens, directives, section headers, and chord lines from a lyric line.
 * Returns the cleaned lyric text, or null if the line contains no lyrics.
 */
export function cleanLyricLine(line: string): string | null {
  if (!line || typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('---')) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return null;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return null;
  if (isChordLine(trimmed)) return null;

  const stripped = trimmed
    .replace(/\[[A-Ga-gHh][#b]?[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped || isChordLine(stripped)) return null;
  return stripped;
}

/**
 * Extracts a 1-line contextual snippet from song lyrics when a query matches.
 * Returns formatted as '... [matching lyric line] ...' or null if no match.
 */
export function extractLyricSnippet(rawLyrics: string, query: string): string | null {
  if (!rawLyrics || !query || typeof rawLyrics !== 'string' || typeof query !== 'string') {
    return null;
  }
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;

  const lines = rawLyrics.split(/\r?\n/);
  for (const line of lines) {
    const clean = cleanLyricLine(line);
    if (!clean) continue;
    if (normalizeSearchText(clean).includes(normalizedQuery)) {
      return `... ${clean} ...`;
    }
  }
  return null;
}

/**
 * Evaluates whether a song matches a search query across title, artist, lyrics, and tags.
 * Provides field attribution and extracts contextual lyric snippet when lyrics match
 * and neither title nor artist matched (REQ-CAT-3).
 */
export function matchSong(
  song: ParsedSong,
  query: string
): {
  matches: boolean;
  matchedField: 'title' | 'artist' | 'tag' | 'lyrics' | null;
  lyricSnippet: string | null;
} {
  if (!song) return { matches: false, matchedField: null, lyricSnippet: null };
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return { matches: true, matchedField: null, lyricSnippet: null };

  if (normalizeSearchText(song.title).includes(normalizedQuery)) {
    return { matches: true, matchedField: 'title', lyricSnippet: null };
  }
  if (normalizeSearchText(song.artist).includes(normalizedQuery)) {
    return { matches: true, matchedField: 'artist', lyricSnippet: null };
  }

  const lyricSnippet = extractLyricSnippet(song.rawLyrics || '', normalizedQuery);
  if (lyricSnippet !== null) {
    return { matches: true, matchedField: 'lyrics', lyricSnippet };
  }

  const matchedTag = (song.tags || []).some((tag) =>
    normalizeSearchText(tag).includes(normalizedQuery)
  );
  if (matchedTag) {
    return { matches: true, matchedField: 'tag', lyricSnippet: null };
  }

  return { matches: false, matchedField: null, lyricSnippet: null };
}

/**
 * Collects, deduplicates, and alphabetically sorts all unique tags across the catalog.
 */
export function extractCatalogTags(songs: ParsedSong[]): string[] {
  if (!Array.isArray(songs)) return [];
  const tagSet = new Set<string>();
  for (const song of songs) {
    song?.tags?.forEach((tag) => {
      if (typeof tag === 'string' && tag.trim()) tagSet.add(tag.trim());
    });
  }
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'pl'));
}

/**
 * Converts an artist name into a URL-friendly, diacritic-insensitive slug.
 */
export function artistToSlug(artist: string): string {
  if (!artist || typeof artist !== 'string') return '';
  const slug = artist
    .replace(/[łŁ]/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || (artist.trim() ? 'artysta' : '');
}

/**
 * Groups catalog songs by unique artist and returns an alphabetically sorted artist catalog.
 */
export function extractArtistCatalog(songs: ParsedSong[]): ArtistCatalogItem[] {
  if (!songs || !Array.isArray(songs)) return [];
  const artistMap = new Map<string, ArtistCatalogItem>();

  for (const song of songs) {
    if (!song || !song.artist) continue;
    const name = song.artist.trim();
    if (!name) continue;
    const slug = artistToSlug(name);
    if (!slug) continue;

    const existing = artistMap.get(slug);
    if (existing) {
      existing.songCount += 1;
      existing.songs.push(song);
    } else {
      artistMap.set(slug, {
        name,
        slug,
        songCount: 1,
        songs: [song],
      });
    }
  }

  return Array.from(artistMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pl')
  );
}
