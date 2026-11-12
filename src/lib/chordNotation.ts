export type ChordNotation = 'international' | 'polish' | 'european';

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
 * Formats a single root note according to the selected notation mode.
 * - Polish mode:        B natural → H,  A#/Bb → B
 * - International mode: B natural → B,  A#/Bb → Bb (or A#)
 * - European mode:      same root spelling as International (H → B, Bb stays Bb)
 *
 * When polishNotation (legacy bool) is provided it maps to 'polish'/'international'
 * so existing callers keep working.
 */
export function formatNote(note: string, polishNotationOrMode: boolean | ChordNotation = true): string {
  const norm = normalizeNoteName(note);
  const mode: ChordNotation =
    typeof polishNotationOrMode === 'boolean'
      ? polishNotationOrMode ? 'polish' : 'international'
      : polishNotationOrMode;

  if (mode === 'polish') {
    if (norm === 'B') return 'H';
    if (norm === 'A#' || norm === 'Bb') return 'B';
    return norm;
  }
  // International and European both use standard International root names
  if (norm === 'H') return 'B';
  return norm;
}

/**
 * Transposes a single note by given semitones (+/- N), respecting sharp preferences and notation mode.
 */
function transposeNote(note: string, semitones: number, mode: boolean | ChordNotation = true): string {
  const index = getNoteIndex(note);
  if (index === undefined) return formatNote(note, mode);

  const transposedIndex = ((index + semitones) % 12 + 12) % 12;
  const standardNote = CHROMATIC_SCALE[transposedIndex];
  return formatNote(standardNote, mode);
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
 *
 * Accepts a `ChordNotation` mode string or the legacy `polishNotation` boolean:
 * - 'international' / false: B natural = B, B-flat = Bb, minor chords = Dm, Am
 * - 'polish'        / true:  B natural = H, B-flat = B,  minor chords = Dm, Am
 * - 'european':              B natural = B, B-flat = Bb, minor chords = d, a, f# (lowercase root, no m)
 *
 * Examples:
 * - transposeChord('Am',  2, 'polish')        → 'Hm'
 * - transposeChord('Am',  0, 'european')      → 'a'
 * - transposeChord('F#m', 0, 'european')      → 'f#'
 * - transposeChord('Bbm', 0, 'european')      → 'bb'
 * - transposeChord('am',  0, 'polish')        → 'Am'
 * - transposeChord('amin',0, 'international') → 'Am'
 * - transposeChord('D/F#',1, 'polish')        → 'D#/G'
 */
export function transposeChord(chord: string, semitones: number, mode: boolean | ChordNotation = true): string {
  if (!chord || typeof chord !== 'string' || chord.trim() === '') return chord || '';

  const trimmed = chord.trim();
  const match = trimmed.match(CHORD_REGEX);
  if (!match) {
    return trimmed;
  }

  const [, root, suffix = '', bassRoot, bassSuffix = ''] = match;
  const resolvedMode: ChordNotation =
    typeof mode === 'boolean'
      ? mode ? 'polish' : 'international'
      : mode;

  const newRoot = transposeNote(root, semitones, resolvedMode);
  const normalizedSuffix = normalizeSuffix(suffix);

  let chordStr: string;
  if (bassRoot) {
    const newBass = transposeNote(bassRoot, semitones, resolvedMode);
    const normalizedBassSuffix = normalizeSuffix(bassSuffix);
    chordStr = `${newRoot}${normalizedSuffix}/${newBass}${normalizedBassSuffix}`;
  } else {
    chordStr = `${newRoot}${normalizedSuffix}`;
  }

  // European mode: minor chords get a lowercase root and drop the 'm'
  // A chord is minor if its quality suffix starts with 'm' (not 'maj')
  if (resolvedMode === 'european') {
    chordStr = applyEuropeanMinor(chordStr);
  }

  return chordStr;
}

/**
 * Converts a chord already formatted in International style to European minor notation:
 * Minor chords (suffix starts with 'm' but not 'maj') → lowercase root, drop 'm'.
 * Slash chords: applies to the main root only; bass stays International.
 * e.g. "Dm7" → "d7", "F#m" → "f#", "Cmaj7" → "Cmaj7" (unchanged), "Dm/F" → "d/F"
 */
function applyEuropeanMinor(chord: string): string {
  // Handle slash chord: "MainChord/Bass"
  const slashIdx = chord.indexOf('/');
  if (slashIdx !== -1) {
    const main = chord.slice(0, slashIdx);
    const bass = chord.slice(slashIdx); // includes '/'
    return applyEuropeanMinorToRoot(main) + bass;
  }
  return applyEuropeanMinorToRoot(chord);
}

function applyEuropeanMinorToRoot(chord: string): string {
  // Match root (e.g. "C", "F#", "Bb") + suffix (e.g. "m", "m7", "maj7")
  const m = chord.match(/^([A-H][b#]?)(.*)$/);
  if (!m) return chord;
  const [, root, suffix] = m;
  // Minor: suffix starts with 'm' but not 'maj'
  if (suffix.startsWith('m') && !suffix.startsWith('maj')) {
    // Drop the leading 'm', lowercase the root
    return root.toLowerCase() + suffix.slice(1);
  }
  return chord;
}

/**
 * Formats a chord for display without changing pitch, applying the given notation mode.
 */
export function formatChordForDisplay(chord: string, mode: boolean | ChordNotation = true): string {
  return transposeChord(chord, 0, mode);
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
