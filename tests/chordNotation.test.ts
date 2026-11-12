/**
 * Unit tests for chord notation utilities:
 * - International mode: standard (Dm, B, Bb)
 * - Polish mode:        Polish  (Dm, H, B)
 * - European mode:      European minor (d, h, b — lowercase root, no 'm')
 *
 * Covers: major chords, minor chords, sharps/flats, B/H edge cases,
 * extensions (7, maj7, sus4), slash chords, and transposition combos.
 */
import { TestRunner, assert } from './helpers/test_framework.ts';
import {
  transposeChord,
  formatChordForDisplay,
  formatNote,
} from '../src/lib/chordNotation.ts';

export async function runChordNotationTests(runner: TestRunner) {
  runner.setTier('Chord Notation — Unit Tests');

  // ─── International mode ──────────────────────────────────────────────────

  await runner.test('INT: major chords stay uppercase', () => {
    assert(transposeChord('C', 0, 'international') === 'C', 'C');
    assert(transposeChord('D', 0, 'international') === 'D', 'D');
    assert(transposeChord('G', 0, 'international') === 'G', 'G');
    assert(transposeChord('A', 0, 'international') === 'A', 'A');
  });

  await runner.test('INT: minor chords = uppercase root + m', () => {
    assert(transposeChord('Dm', 0, 'international') === 'Dm', 'Dm');
    assert(transposeChord('Am', 0, 'international') === 'Am', 'Am');
    assert(transposeChord('Em', 0, 'international') === 'Em', 'Em');
  });

  await runner.test('INT: B-natural stays B', () => {
    assert(transposeChord('B', 0, 'international') === 'B', 'B major');
    assert(transposeChord('Bm', 0, 'international') === 'Bm', 'Bm');
    assert(transposeChord('H', 0, 'international') === 'B', 'H → B');
  });

  await runner.test('INT: B-flat → A# (sharp preferred in chromatic scale)', () => {
    // The chromatic scale uses sharps by default; Bb is enharmonic to A#
    assert(transposeChord('Bb', 0, 'international') === 'A#', 'Bb→A# INT');
    assert(transposeChord('Bbm', 0, 'international') === 'A#m', 'Bbm→A#m INT');
  });

  await runner.test('INT: sharp chords', () => {
    assert(transposeChord('F#m', 0, 'international') === 'F#m', 'F#m');
    assert(transposeChord('C#', 0, 'international') === 'C#', 'C#');
  });

  await runner.test('INT: extensions (7, maj7, sus4, dim, aug, add9)', () => {
    assert(transposeChord('Am7',  0, 'international') === 'Am7',  'Am7');
    assert(transposeChord('Cmaj7',0, 'international') === 'Cmaj7','Cmaj7');
    assert(transposeChord('Gsus4',0, 'international') === 'Gsus4','Gsus4');
    assert(transposeChord('Ddim', 0, 'international') === 'Ddim', 'Ddim');
    assert(transposeChord('Caug', 0, 'international') === 'Caug', 'Caug');
  });

  await runner.test('INT: slash chords', () => {
    assert(transposeChord('D/F#', 0, 'international') === 'D/F#', 'D/F#');
    assert(transposeChord('Am/E', 0, 'international') === 'Am/E', 'Am/E');
    assert(transposeChord('C/G',  0, 'international') === 'C/G',  'C/G');
  });

  await runner.test('INT: transposition', () => {
    assert(transposeChord('Am', 2, 'international') === 'Bm', 'Am+2→Bm INT');
    assert(transposeChord('C',  7, 'international') === 'G',  'C+7→G');
    assert(transposeChord('Bb', 2, 'international') === 'C',  'Bb+2→C');
  });

  // ─── Polish mode ─────────────────────────────────────────────────────────

  await runner.test('PL: B-natural → H', () => {
    assert(transposeChord('B',  0, 'polish') === 'H',  'B→H');
    assert(transposeChord('Bm', 0, 'polish') === 'Hm', 'Bm→Hm');
  });

  await runner.test('PL: B-flat → B', () => {
    assert(transposeChord('Bb',  0, 'polish') === 'B',  'Bb→B');
    assert(transposeChord('Bbm', 0, 'polish') === 'Bm', 'Bbm→Bm');
  });

  await runner.test('PL: minor chords keep m suffix', () => {
    assert(transposeChord('Dm', 0, 'polish') === 'Dm', 'Dm PL');
    assert(transposeChord('Am', 0, 'polish') === 'Am', 'Am PL');
  });

  await runner.test('PL: transposition Am+2 → Hm', () => {
    assert(transposeChord('Am', 2, 'polish') === 'Hm', 'Am+2→Hm PL');
  });

  await runner.test('PL: legacy boolean true behaves like polish', () => {
    assert(transposeChord('B',  0, true) === 'H',  'legacy true: B→H');
    assert(transposeChord('Bb', 0, true) === 'B',  'legacy true: Bb→B');
    assert(transposeChord('Am', 2, true) === 'Hm', 'legacy true: Am+2→Hm');
  });

  await runner.test('PL: legacy boolean false behaves like international', () => {
    assert(transposeChord('B',  0, false) === 'B',   'legacy false: B stays');
    assert(transposeChord('Bb', 0, false) === 'A#',  'legacy false: Bb→A# (sharp default)');
    assert(transposeChord('Am', 2, false) === 'Bm', 'legacy false: Am+2→Bm');
  });

  // ─── European mode ───────────────────────────────────────────────────────

  await runner.test('EUR: major chords stay uppercase', () => {
    assert(transposeChord('C', 0, 'european') === 'C', 'C EUR');
    assert(transposeChord('D', 0, 'european') === 'D', 'D EUR');
    assert(transposeChord('G', 0, 'european') === 'G', 'G EUR');
    assert(transposeChord('A', 0, 'european') === 'A', 'A EUR');
  });

  await runner.test('EUR: minor chords → lowercase root, no m', () => {
    assert(transposeChord('Dm', 0, 'european') === 'd',  'Dm→d');
    assert(transposeChord('Am', 0, 'european') === 'a',  'Am→a');
    assert(transposeChord('Em', 0, 'european') === 'e',  'Em→e');
  });

  await runner.test('EUR: sharp minor → lowercase root with #', () => {
    assert(transposeChord('F#m', 0, 'european') === 'f#', 'F#m→f#');
    assert(transposeChord('C#m', 0, 'european') === 'c#', 'C#m→c#');
  });

  await runner.test('EUR: flat minor → lowercase root with # (sharp preferred)', () => {
    // Bb is enharmonic to A# on the chromatic scale (sharps preferred)
    assert(transposeChord('Bbm', 0, 'european') === 'a#', 'Bbm→a# EUR (A# enharmonic)');
    assert(transposeChord('Ebm', 0, 'european') === 'd#', 'Ebm→d# EUR (D# enharmonic)');
  });

  await runner.test('EUR: B-natural stays B (not H)', () => {
    assert(transposeChord('B',  0, 'european') === 'B',  'B EUR stays B');
    assert(transposeChord('Bm', 0, 'european') === 'b',  'Bm EUR → b');
    assert(transposeChord('H',  0, 'european') === 'B',  'H → B in EUR');
  });

  await runner.test('EUR: B-flat → A# (sharp preferred), stays major', () => {
    assert(transposeChord('Bb', 0, 'european') === 'A#', 'Bb EUR → A# (sharp default, major unchanged)');
  });

  await runner.test('EUR: extensions on minor chords', () => {
    assert(transposeChord('Am7',   0, 'european') === 'a7',   'Am7→a7');
    assert(transposeChord('Dm7',   0, 'european') === 'd7',   'Dm7→d7');
    assert(transposeChord('F#m7',  0, 'european') === 'f#7',  'F#m7→f#7');
  });

  await runner.test('EUR: maj7 on major chords stays uppercase', () => {
    assert(transposeChord('Cmaj7', 0, 'european') === 'Cmaj7', 'Cmaj7 unchanged');
    assert(transposeChord('Dmaj7', 0, 'european') === 'Dmaj7', 'Dmaj7 unchanged');
  });

  await runner.test('EUR: sus4, dim, aug unchanged (major quality)', () => {
    assert(transposeChord('Gsus4', 0, 'european') === 'Gsus4', 'Gsus4');
    assert(transposeChord('Ddim',  0, 'european') === 'Ddim',  'Ddim');
    assert(transposeChord('Caug',  0, 'european') === 'Caug',  'Caug');
  });

  await runner.test('EUR: slash chords — main chord lowercased if minor, bass stays', () => {
    assert(transposeChord('Dm/F',  0, 'european') === 'd/F',   'Dm/F→d/F');
    assert(transposeChord('Am/E',  0, 'european') === 'a/E',   'Am/E→a/E');
    assert(transposeChord('D/F#',  0, 'european') === 'D/F#',  'D/F# major unchanged');
  });

  await runner.test('EUR: transposition Am+2 → b (B minor European)', () => {
    // Am + 2 = Bm → European: 'b'
    assert(transposeChord('Am', 2, 'european') === 'b', 'Am+2→b EUR');
  });

  await runner.test('EUR: transposition Dm+2 → em (E minor European)', () => {
    // Dm + 2 = Em → European: 'e'
    assert(transposeChord('Dm', 2, 'european') === 'e', 'Dm+2→e EUR');
  });

  // ─── Normalize / input casing ─────────────────────────────────────────

  await runner.test('normalize: lowercase input works for all modes', () => {
    assert(transposeChord('am', 0, 'international') === 'Am', 'am → Am INT');
    assert(transposeChord('am', 0, 'polish')        === 'Am', 'am → Am PL');
    assert(transposeChord('am', 0, 'european')      === 'a',  'am → a EUR');
  });

  await runner.test('normalize: "amin" suffix normalization', () => {
    assert(transposeChord('amin', 0, 'international') === 'Am', 'amin INT');
    assert(transposeChord('amin', 0, 'polish')        === 'Am', 'amin PL');
    assert(transposeChord('amin', 0, 'european')      === 'a',  'amin EUR');
  });

  // ─── formatNote ──────────────────────────────────────────────────────────

  await runner.test('formatNote: mode param overrides boolean', () => {
    assert(formatNote('B', 'international') === 'B',  'formatNote B INT');
    assert(formatNote('B', 'polish')        === 'H',  'formatNote B PL');
    assert(formatNote('B', 'european')      === 'B',  'formatNote B EUR');
    assert(formatNote('Bb','international') === 'Bb', 'formatNote Bb INT');
    assert(formatNote('Bb','polish')        === 'B',  'formatNote Bb PL');
    assert(formatNote('Bb','european')      === 'Bb', 'formatNote Bb EUR');
  });

  // ─── formatChordForDisplay ───────────────────────────────────────────────

  await runner.test('formatChordForDisplay: applies mode without transposing', () => {
    assert(formatChordForDisplay('Am',  'international') === 'Am', 'fCFD Am INT');
    assert(formatChordForDisplay('Am',  'polish')        === 'Am', 'fCFD Am PL');
    assert(formatChordForDisplay('Am',  'european')      === 'a',  'fCFD Am EUR');
    assert(formatChordForDisplay('Cmaj7','european')     === 'Cmaj7', 'fCFD Cmaj7 EUR unchanged');
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  await runner.test('edge: empty / blank / non-chord strings returned as-is', () => {
    assert(transposeChord('',    0, 'european') === '',    'empty string');
    assert(transposeChord('xyz', 0, 'european') === 'xyz', 'non-chord');
  });

  await runner.test('edge: wrap-around transposition', () => {
    // B + 1 = C (wraps around)
    assert(transposeChord('B', 1, 'international') === 'C', 'B+1→C');
    assert(transposeChord('C', -1, 'international') === 'B', 'C-1→B');
  });
}
