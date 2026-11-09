// 12-semitone chromatic scale defaulting to sharp spellings (REQ-NOT-2)
const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// Enharmonic / alias normalization table to chromatic indices 0-11
const NOTE_TO_INDEX: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  H: 11, // Polish notation: H = B natural
};

/**
 * Formats a single root note according to Polish or International notation (REQ-NOT-4).
 * - Polish mode: B natural -> H, A#/Bb -> B
 * - International mode: B natural -> B, A#/Bb -> Bb or A#
 */
export function formatNote(note: string, polishNotation = true): string {
  if (polishNotation) {
    if (note === 'B') return 'H';
    if (note === 'A#' || note === 'Bb') return 'B';
    return note;
  }
  // International notation
  if (note === 'H') return 'B';
  return note;
}

/**
 * Transposes a single note by given semitones (+/- N), respecting sharp preferences and notation mode.
 */
function transposeNote(note: string, semitones: number, polishNotation = true): string {
  const index = NOTE_TO_INDEX[note];
  if (index === undefined) return note;

  const transposedIndex = ((index + semitones) % 12 + 12) % 12;
  const standardNote = CHROMATIC_SCALE[transposedIndex];
  return formatNote(standardNote, polishNotation);
}

// Regex to capture root note, optional quality/modifier, and optional slash bass
// Matches root (C-G, A, B, H followed optionally by # or b)
const CHORD_REGEX = /^([A-G|H][#b]?)([^/]*)(?:\/([A-G|H][#b]?)(.*))?$/;

/**
 * Transposes a chord string (including complex suffixes and slash chords like D/F# or Cmaj7).
 * Examples:
 * - transposeChord('Am', 2, true) -> 'Hm'
 * - transposeChord('D/F#', 1, true) -> 'D#/G'
 * - transposeChord('Bb', 0, true) -> 'B' (Polish)
 * - transposeChord('Bb', 0, false) -> 'Bb' (International)
 */
export function transposeChord(chord: string, semitones: number, polishNotation = true): string {
  if (!chord || chord.trim() === '') return chord;

  const trimmed = chord.trim();
  const match = trimmed.match(CHORD_REGEX);
  if (!match) {
    // If not matching standard chord regex, return as-is
    return trimmed;
  }

  const [, root, suffix = '', bassRoot, bassSuffix = ''] = match;
  const newRoot = transposeNote(root, semitones, polishNotation);

  if (bassRoot) {
    const newBass = transposeNote(bassRoot, semitones, polishNotation);
    return `${newRoot}${suffix}/${newBass}${bassSuffix}`;
  }

  return `${newRoot}${suffix}`;
}

/**
 * Formats a chord for display without changing pitch, applying Polish notation formatting.
 */
export function formatChordForDisplay(chord: string, polishNotation = true): string {
  return transposeChord(chord, 0, polishNotation);
}

/**
 * Determines whether a given word/token looks like a valid musical chord.
 */
export function isChordToken(token: string): boolean {
  if (!token || token.length > 10) return false;
  return /^[A-G|H][#b]?(?:maj|min|m|M|sus|dim|aug|add)?[0-9]?(?:\/[A-G|H][#b]?)?$/.test(token.trim());
}

/**
 * Determines whether a full text line is a chords line (i.e. consists predominantly of chords and spaces).
 */
export function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  // If at least 75% of tokens look like chords, treat as chord line
  const chordCount = tokens.filter((t) => isChordToken(t)).length;
  return chordCount / tokens.length >= 0.75;
}
