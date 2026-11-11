import type { ChordSegment, ParsedSong, SongLine } from '../types';
import { isChordLine, isChordToken } from './chordNotation';

/**
 * Parses frontmatter metadata from raw song file text (replacing gray-matter).
 */
export function parseFrontmatter(rawContent: string): {
  metadata: Record<string, any>;
  body: string;
} {
  const trimmed = rawContent.trimStart();
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    return { metadata: {}, body: rawContent.trim() };
  }

  const rawYaml = match[1];
  const body = match[2].trim();
  const metadata: Record<string, any> = {};

  for (const line of rawYaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    if (val.startsWith('[') && val.endsWith(']')) {
      metadata[key] = val
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      metadata[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }

  return { metadata, body };
}

interface ChordTokenPosition {
  chord: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Extracts chord tokens and their 0-based column indices from a chord line.
 */
function extractChordPositions(chordLine: string): ChordTokenPosition[] {
  const positions: ChordTokenPosition[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(chordLine)) !== null) {
    positions.push({
      chord: match[0],
      startIndex: match.index,
      endIndex: regex.lastIndex,
    });
  }

  return positions;
}

/**
 * Binds a chord line with its following lyric line column-by-column into atomic segments (REQ-VIEW-1).
 */
function bindChordsAndLyrics(chordLine: string, lyricLine: string): ChordSegment[] {
  const chords = extractChordPositions(chordLine);
  if (chords.length === 0) {
    return [{ chord: '', lyrics: lyricLine }];
  }

  const segments: ChordSegment[] = [];

  // If lyrics start before the first chord column, add leading lyrics
  if (chords[0].startIndex > 0) {
    const leadingLyrics = lyricLine.slice(0, chords[0].startIndex);
    if (leadingLyrics.length > 0) {
      segments.push({ chord: '', lyrics: leadingLyrics });
    }
  }

  for (let i = 0; i < chords.length; i++) {
    const currentChord = chords[i];
    const nextChord = chords[i + 1];

    const sliceStart = currentChord.startIndex;
    const sliceEnd = nextChord ? nextChord.startIndex : lyricLine.length;

    const lyricsChunk = sliceStart < lyricLine.length ? lyricLine.slice(sliceStart, sliceEnd) : '';

    segments.push({
      chord: currentChord.chord,
      lyrics: lyricsChunk,
    });
  }

  return segments;
}

/**
 * Removes all empty (or whitespace-only) lines from a song body,
 * matching the canonical format where sections are separated only by [Headers].
 */
export function trimEmptyLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/**
 * Parses raw song text into a structured ParsedSong object (replacing chordsheetjs).
 */
export function parseSong(rawText: string, slug: string, filePath = ''): ParsedSong {
  const { metadata, body } = parseFrontmatter(rawText);

  const title = (metadata.title as string) || slug;
  const artist = (metadata.artist as string) || 'Nieznany wykonawca';
  const key = (metadata.key as string) || 'C';
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];

  const rawLines = body.split(/\r?\n/);
  const songLines: SongLine[] = [];
  const uniqueChordsSet = new Set<string>();

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // 1. Empty lines
    if (!trimmed) {
      songLines.push({ type: 'empty' });
      i++;
      continue;
    }

    // 2. Section headers like [Zwrotka 1], [Refren], [^Refren] (reference)
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1);
      const isRef = inner.startsWith('^');
      songLines.push({
        type: 'section-header',
        header: isRef ? inner.slice(1).trim() : inner,
        ...(isRef && { isRef: true }),
      });
      i++;
      continue;
    }

    // 3. Chord lines vs Lyric lines
    if (isChordLine(line)) {
      const nextLine = i + 1 < rawLines.length ? rawLines[i + 1] : '';
      const nextLineTrimmed = nextLine.trim();

      // Collect chords into uniqueChordsSet
      const chordTokens = extractChordPositions(line);
      for (const item of chordTokens) {
        if (isChordToken(item.chord)) {
          uniqueChordsSet.add(item.chord);
        }
      }

      // If next line is not a chord line and not a header, pair them together
      if (
        nextLineTrimmed &&
        !nextLineTrimmed.startsWith('[') &&
        !isChordLine(nextLine)
      ) {
        const segments = bindChordsAndLyrics(line, nextLine);
        songLines.push({
          type: 'chords-and-lyrics',
          segments,
        });
        i += 2;
        continue;
      }

      // Otherwise it's a chords-only line (e.g. in intro or solo)
      const segments: ChordSegment[] = chordTokens.map((ct) => ({
        chord: ct.chord,
        lyrics: '',
      }));
      songLines.push({
        type: 'chords-and-lyrics',
        segments,
      });
      i++;
      continue;
    }

    // 4. Standalone lyrics line (spoken or without chords)
    songLines.push({
      type: 'chords-and-lyrics',
      segments: [{ chord: '', lyrics: line }],
    });
    i++;
  }

  return {
    slug,
    title,
    artist,
    key,
    tags,
    rawLyrics: body,
    filePath,
    lines: songLines,
    uniqueChords: Array.from(uniqueChordsSet),
  };
}

/**
 * Loads and parses all songs from Vite eager glob (build-time / startup ingest).
 */
export function loadAllSongs(): ParsedSong[] {
  const songFiles = import.meta.glob<string>('/songs/**/*.txt', {
    eager: true,
    query: '?raw',
    import: 'default',
  });

  const parsedSongs: ParsedSong[] = [];

  for (const [path, rawContent] of Object.entries(songFiles)) {
    // Generate clean slug from filename (e.g. "/songs/lornetka.txt" -> "lornetka")
    const filename = path.split('/').pop()?.replace(/\.txt$/, '') || 'song';
    parsedSongs.push(parseSong(String(rawContent), filename, path));
  }

  // Sort alphabetically by title
  return parsedSongs.sort((a, b) => a.title.localeCompare(b.title, 'pl'));
}
