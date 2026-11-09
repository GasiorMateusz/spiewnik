import type { Song } from 'chordsheetjs';

export type Instrument = 'guitar' | 'ukulele';

export interface SongMetadata {
  slug: string;
  title: string;
  artist: string;
  key: string;
  tags: string[];
  rawLyrics: string;
  filePath: string;
}

export interface ParsedSong extends SongMetadata {
  parsedSong: Song;
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
