import type { ChordPosition, InstrumentData } from '../components/ChordSvg';
import type { Instrument } from '../types';

export const INSTRUMENT_DATA: Record<Instrument, InstrumentData> = {
  guitar: {
    strings: 6,
    fretsOnChord: 4,
    name: 'Gitara',
    tunings: {
      standard: ['E', 'A', 'D', 'G', 'B', 'E'],
    },
  },
  ukulele: {
    strings: 4,
    fretsOnChord: 4,
    name: 'Ukulele',
    tunings: {
      standard: ['G', 'C', 'E', 'A'],
    },
  },
};

// Cached database instances loaded lazily on demand
let guitarDbCache: any = null;
let ukuleleDbCache: any = null;

async function getInstrumentDb(instrument: Instrument) {
  if (instrument === 'guitar') {
    if (!guitarDbCache) {
      const module = await import('@tombatossals/chords-db/lib/guitar.json');
      guitarDbCache = module.default || module;
    }
    return guitarDbCache;
  } else {
    if (!ukuleleDbCache) {
      const module = await import('@tombatossals/chords-db/lib/ukulele.json');
      ukuleleDbCache = module.default || module;
    }
    return ukuleleDbCache;
  }
}

// Maps chord roots to chords-db keys
const GUITAR_KEY_MAP: Record<string, string> = {
  C: 'C',
  'C#': 'Csharp',
  Db: 'Csharp',
  D: 'D',
  'D#': 'Eb',
  Eb: 'Eb',
  E: 'E',
  F: 'F',
  'F#': 'Fsharp',
  Gb: 'Fsharp',
  G: 'G',
  'G#': 'Ab',
  Ab: 'Ab',
  A: 'A',
  'A#': 'Bb',
  Bb: 'Bb',
  B: 'B',
  H: 'B', // Polish H = B natural
};

const UKULELE_KEY_MAP: Record<string, string> = {
  C: 'C',
  'C#': 'Db',
  Db: 'Db',
  D: 'D',
  'D#': 'Eb',
  Eb: 'Eb',
  E: 'E',
  F: 'F',
  'F#': 'Gb',
  Gb: 'Gb',
  G: 'G',
  'G#': 'Ab',
  Ab: 'Ab',
  A: 'A',
  'A#': 'Bb',
  Bb: 'Bb',
  B: 'B',
  H: 'B',
};

// Maps common chord suffixes to chords-db suffixes
const SUFFIX_MAP: Record<string, string> = {
  '': 'major',
  maj: 'major',
  M: 'major',
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  '7': '7',
  m7: 'm7',
  min7: 'm7',
  maj7: 'maj7',
  M7: 'maj7',
  sus2: 'sus2',
  sus4: 'sus4',
  dim: 'dim',
  dim7: 'dim7',
  aug: 'aug',
  '6': '6',
  m6: 'm6',
  '9': '9',
  m9: 'm9',
  maj9: 'maj9',
};

/**
 * Normalizes bass notes for slash chords, handling Polish notation and enharmonics.
 */
function normalizeBassNote(bass: string, polishNotation: boolean): string {
  let note = bass.trim();
  if (polishNotation) {
    if (note === 'B') note = 'Bb';
    else if (note === 'H') note = 'B';
  } else {
    if (note === 'H') note = 'B';
  }

  // Normalize enharmonics to match chords-db slash notation conventions (e.g. /C#, /Eb, /F#, /G#, /Bb)
  const ENHARMONIC_BASS: Record<string, string> = {
    Db: 'C#',
    'D#': 'Eb',
    Gb: 'F#',
    Ab: 'G#',
    'A#': 'Bb',
  };
  return ENHARMONIC_BASS[note] || note;
}

/**
 * Parses chord string into db key and suffix.
 */
function parseChordParts(
  chordName: string,
  instrument: Instrument,
  polishNotation: boolean = true
): { key: string; suffix: string } | null {
  if (!chordName || typeof chordName !== 'string') return null;

  const match = chordName.trim().match(/^([A-G|H][#b]?)([^/]*)(?:\/([A-G|H][#b]?)(.*))?$/);
  if (!match) return null;

  let rawRoot = match[1];
  const rawQuality = match[2]?.trim() || '';
  const rawBass = match[3];

  // Polish notation handling: B -> Bb, H -> B
  if (polishNotation) {
    if (rawRoot === 'B') rawRoot = 'Bb';
    else if (rawRoot === 'H') rawRoot = 'B';
  } else {
    if (rawRoot === 'H') rawRoot = 'B';
  }

  const keyMap = instrument === 'guitar' ? GUITAR_KEY_MAP : UKULELE_KEY_MAP;
  const dbKey = keyMap[rawRoot];
  if (!dbKey) return null;

  let dbSuffix: string;
  if (rawBass) {
    const bass = normalizeBassNote(rawBass, polishNotation);
    if (rawQuality === 'm' || rawQuality === 'min' || rawQuality === '-') {
      dbSuffix = `m/${bass}`;
    } else if (!rawQuality || rawQuality === 'maj' || rawQuality === 'M') {
      dbSuffix = `/${bass}`;
    } else {
      // If quality is something else with slash (e.g. 7/G), construct it for lookup
      dbSuffix = `${rawQuality}/${bass}`;
    }
  } else {
    dbSuffix = SUFFIX_MAP[rawQuality] || rawQuality || 'major';
  }

  return { key: dbKey, suffix: dbSuffix };
}

/**
 * Looks up chord variations from the database for the given instrument.
 * Returns an array of ChordPosition or null if not found (REQ-CHD-2).
 */
export async function lookupChordPositions(
  chordName: string,
  instrument: Instrument,
  polishNotation: boolean = true
): Promise<ChordPosition[] | null> {
  const parsed = parseChordParts(chordName, instrument, polishNotation);
  if (!parsed) return null;

  const db = await getInstrumentDb(instrument);
  const keyChords = db.chords?.[parsed.key];
  if (!Array.isArray(keyChords)) return null;

  const chordEntry = keyChords.find(
    (c: any) => c.suffix.toLowerCase() === parsed.suffix.toLowerCase()
  );

  if (!chordEntry || !Array.isArray(chordEntry.positions) || chordEntry.positions.length === 0) {
    return null;
  }

  return chordEntry.positions as ChordPosition[];
}
