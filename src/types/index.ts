export type Instrument = 'guitar' | 'ukulele';

export interface SongMetadata {
  slug: string;
  title: string;
  artist: string;
  key: string;
  tags: string[];
  rawLyrics: string;
  filePath?: string;
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
