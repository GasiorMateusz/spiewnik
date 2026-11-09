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
 * Normalizes note casing (e.g. 'c#' -> 'C#', 'bb' -> 'Bb', 'h' -> 'H', 'a' -> 'A').
 */
function normalizeNoteName(note: string): string {
  if (!note) return note;
  const upperFirst = note.charAt(0).toUpperCase();
  const rest = note.slice(1).toLowerCase();
  return upperFirst + (rest === 'b' ? 'b' : rest === '#' ? '#' : rest);
}

/**
 * Resolves chromatic index (0-11) for a given note name.
 */
function getNoteIndex(note: string): number | undefined {
  const norm = normalizeNoteName(note);
  return NOTE_TO_INDEX[norm];
}

/**
 * Formats a single root note according to Polish or International notation (REQ-NOT-4).
 * - Polish mode: B natural -> H, A#/Bb -> B
 * - International mode: B natural -> B, A#/Bb -> Bb or A#
 */
export function formatNote(note: string, polishNotation = true): string {
  const norm = normalizeNoteName(note);
  if (polishNotation) {
    if (norm === 'B') return 'H';
    if (norm === 'A#' || norm === 'Bb') return 'B';
    return norm;
  }
  // International notation
  if (norm === 'H') return 'B';
  return norm;
}

/**
 * Transposes a single note by given semitones (+/- N), respecting sharp preferences and notation mode.
 */
function transposeNote(note: string, semitones: number, polishNotation = true): string {
  const index = getNoteIndex(note);
  if (index === undefined) return formatNote(note, polishNotation);

  const transposedIndex = ((index + semitones) % 12 + 12) % 12;
  const standardNote = CHROMATIC_SCALE[transposedIndex];
  return formatNote(standardNote, polishNotation);
}

/**
 * Normalizes chord quality suffixes, ensuring standard minor formatting (REQ-NOT-3):
 * - 'min' or 'MIN' -> 'm' (e.g. 'amin' -> 'Am', 'Amin' -> 'Am', 'c#min7' -> 'C#m7')
 */
function normalizeSuffix(suffix: string): string {
  if (!suffix) return '';
  if (/^min/i.test(suffix)) {
    return 'm' + suffix.slice(3);
  }
  return suffix;
}

// Regex to capture root note, optional quality/modifier, and optional slash bass
// Case-insensitive match for root (C-G, A, B, H followed optionally by # or b)
const CHORD_REGEX = /^([a-g|h][#b]?)([^/]*)(?:\/([a-g|h][#b]?)(.*))?$/i;

/**
 * Transposes a chord string (including complex suffixes and slash chords like D/F# or Cmaj7).
 * Ensures standard minor chord formatting (uppercase root + lowercase m, e.g. Am, C#m, Hm).
 * Examples:
 * - transposeChord('Am', 2, true) -> 'Hm'
 * - transposeChord('am', 0, true) -> 'Am'
 * - transposeChord('amin', 0, true) -> 'Am'
 * - transposeChord('D/F#', 1, true) -> 'D#/G'
 * - transposeChord('Bb', 0, true) -> 'B' (Polish)
 * - transposeChord('Bb', 0, false) -> 'Bb' (International)
 */
export function transposeChord(chord: string, semitones: number, polishNotation = true): string {
  if (!chord || typeof chord !== 'string' || chord.trim() === '') return chord || '';

  const trimmed = chord.trim();
  const match = trimmed.match(CHORD_REGEX);
  if (!match) {
    // If not matching standard chord regex, return as-is
    return trimmed;
  }

  const [, root, suffix = '', bassRoot, bassSuffix = ''] = match;
  const newRoot = transposeNote(root, semitones, polishNotation);
  const normalizedSuffix = normalizeSuffix(suffix);

  if (bassRoot) {
    const newBass = transposeNote(bassRoot, semitones, polishNotation);
    const normalizedBassSuffix = normalizeSuffix(bassSuffix);
    return `${newRoot}${normalizedSuffix}/${newBass}${normalizedBassSuffix}`;
  }

  return `${newRoot}${normalizedSuffix}`;
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
  return /^[a-g|h][#b]?(?:maj|min|m|M|sus|dim|aug|add)?[0-9]?(?:\/[a-g|h][#b]?)?$/i.test(token.trim());
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
