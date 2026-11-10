import type React from 'react';

export type Instrument = 'guitar' | 'ukulele';

export interface SongMetadata {
  slug: string;
  title: string;
  artist: string;
  key: string;
  tags: string[];
  rawLyrics: string;
  filePath?: string;
  isCustom?: boolean;
  createdAt?: number;
}

export interface ChordSegment {
  chord: string;      // e.g. "Cmaj7", "Am", or "" if empty/lyrics-only segment
  lyrics: string;     // e.g. "Kupiłek "
}

export interface SongLine {
  type: 'section-header' | 'chords-and-lyrics' | 'empty';
  header?: string;    // e.g. "Zwrotka 1", "Refren"
  segments?: ChordSegment[];
}

export interface ParsedSong extends SongMetadata {
  lines: SongLine[];
  uniqueChords: string[];
}

export interface SongPreferences {
  transpose: number;
  scrollSpeed: number;
}

export interface AppPreferences {
  instrument: Instrument;
  theme: 'dark' | 'light';
  polishNotation: boolean;
  fontSizeOffset: number;
  favorites: string[];
  songPreferences: Record<string, SongPreferences>;
}

export interface SongViewerProps {
  song: ParsedSong;
  instrument?: Instrument;
  onInstrumentChange?: (instrument: Instrument) => void;
  onBack?: () => void;
  theme?: 'dark' | 'light';
  initialTranspose?: number;
  initialPolishNotation?: boolean;
  initialFontSizeOffset?: number;
  initialScrollSpeed?: number;
  onScrollSpeedChange?: (speed: number) => void;
  onTransposeChange?: (transpose: number) => void;
  onPolishNotationChange?: (polishNotation: boolean) => void;
  onFontSizeOffsetChange?: (fontSizeOffset: number) => void;
  onDeleteCustomSong?: (slug: string) => void;
}

export type Route =
  | { type: 'catalog' }
  | { type: 'song'; slug: string }
  | { type: 'artist'; slug: string }
  | { type: 'not-found'; path: string };

export type AutoScrollState = 'idle' | 'scrolling' | 'interrupted';

export interface AutoScrollProps {
  initialSpeed?: number;
  onSpeedChange?: (speed: number) => void;
  scrollTarget?: 'window' | HTMLElement | null;
  containerRef?: React.RefObject<HTMLElement | null>;
  theme?: 'dark' | 'light';
  className?: string;
  onStateChange?: (state: AutoScrollState) => void;
}

export interface UseWakeLockResult {
  isSupported: boolean;
  isActive: boolean;
  error: Error | null;
  request: () => Promise<void>;
  release: () => Promise<void>;
}

export type SongListTab = 'songs' | 'artists' | 'favorites';

export interface ArtistCatalogItem {
  name: string;
  slug: string;
  songCount: number;
  songs: ParsedSong[];
}

export interface SongListProps {
  songs: ParsedSong[];
  theme?: 'dark' | 'light';
  favorites: string[];
  onToggleFavorite: (slug: string) => void;
  onSelectSong?: (slug: string) => void;
  onSelectArtist?: (artistSlug: string) => void;
  className?: string;
}


