import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { TestRunner, assert } from './helpers/test_framework';
import { lookupChordPositions, INSTRUMENT_DATA } from '../src/lib/chordDb';
import { transposeChord, formatChordForDisplay } from '../src/lib/chordNotation';
import { parseSong } from '../src/lib/songParser';
import { ChordModal } from '../src/components/ChordModal';

export async function runTier3Tests(runner: TestRunner) {
  runner.setTier('Tier 3: Cross-Feature Combinations');

  // C01: Transpose + Polish Notation + Modal Trigger
  await runner.test('C01: Transpose + Polish Notation + Modal Trigger interaction', async () => {
    // Starting chord G
    const rootChord = 'G';
    const transposeSteps = 4; // G -> G# -> A -> A# -> B (PL: H)

    const plTransposed = transposeChord(rootChord, transposeSteps, true);
    assert.strictEqual(plTransposed, 'H', 'Transposing G by +4 in PL mode yields "H"');

    // Resolving in modal for PL 'H'
    const plPositions = await lookupChordPositions(plTransposed, 'guitar', true);
    assert(plPositions !== null && plPositions.length > 0, 'PL "H" must resolve');

    // Switching to International notation
    const intTransposed = transposeChord(rootChord, transposeSteps, false);
    assert.strictEqual(intTransposed, 'B', 'Transposing G by +4 in INT mode yields "B"');

    const intPositions = await lookupChordPositions(intTransposed, 'guitar', false);
    assert(intPositions !== null && intPositions.length > 0, 'INT "B" must resolve');

    // Frets must be identical (B natural)
    assert.deepStrictEqual(plPositions[0].frets, intPositions[0].frets, 'PL "H" and INT "B" must resolve to identical frets');

    // Modal render check with PL chord
    const modalHtml = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: plTransposed,
        instrument: 'guitar',
        onInstrumentChange: () => {},
        onClose: () => {},
        polishNotation: true,
      })
    );
    assert(modalHtml.includes('>H<'), 'Modal must display chord name "H" in header');
  });

  // C02: In-Modal Instrument Switch + Carousel State Reset
  await runner.test('C02: In-Modal Instrument Switch + Carousel State Reset', async () => {
    const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');

    // In ChordModal: on instrument or chord change, useEffect resets variationIndex to 0
    assert(
      chordModalSrc.includes('setVariationIndex(0);'),
      'ChordModal must reset variationIndex to 0 when instrument or chord changes'
    );

    // Verify Guitar C positions count vs Ukulele C positions count
    const guitarC = await lookupChordPositions('C', 'guitar');
    const ukeC = await lookupChordPositions('C', 'ukulele');
    assert(guitarC !== null && guitarC.length === 4, 'Guitar C has 4 positions');
    assert(ukeC !== null && ukeC.length === 4, 'Ukulele C has 4 positions');

    // Verify first position of Guitar is 6 strings, Ukulele is 4 strings
    assert.strictEqual(guitarC[0].frets.length, 6, 'Guitar frets length must be 6');
    assert.strictEqual(ukeC[0].frets.length, 4, 'Ukulele frets length must be 4');
  });

  // C03: Header Instrument Switch + In-Modal Instrument Switch + App State Synchronization
  await runner.test('C03: Header Instrument Switch + In-Modal Instrument Switch + App State Synchronization', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');

    // Header passes instrument and setInstrument to ChordModal
    assert(
      appSrc.includes('instrument={instrument}'),
      'App must pass active instrument state to ChordModal'
    );
    assert(
      appSrc.includes('onInstrumentChange={setInstrument}'),
      'App must pass setInstrument updater to ChordModal'
    );
    // Modal buttons trigger onInstrumentChange
    const modalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    assert(modalSrc.includes("onInstrumentChange('guitar')"), 'Modal Gitara button calls onInstrumentChange');
    assert(modalSrc.includes("onInstrumentChange('ukulele')"), 'Modal Ukulele button calls onInstrumentChange');
  });

  // C04: Transpose + Slash Chords + Polish Normalization
  await runner.test('C04: Transpose + Slash Chords + Polish Normalization', async () => {
    // 1. D/F# + 1 semitone -> D#/G
    const transposedSlash = transposeChord('D/F#', 1, true);
    assert.strictEqual(transposedSlash, 'D#/G', 'D/F# + 1 semitone must transpose to D#/G');

    // 2. G/B in Polish mode -> G/H
    const plSlash = transposeChord('G/B', 0, true);
    assert.strictEqual(plSlash, 'G/H', 'G/B in Polish mode formats as G/H');

    // 3. Resolve G/H on Guitar -> 3 positions
    const ghPositions = await lookupChordPositions('G/H', 'guitar', true);
    assert(ghPositions !== null && ghPositions.length === 3, 'G/H on Guitar must resolve to 3 positions');

    // 4. Resolve G/B on Guitar in INT mode -> exact same 3 positions
    const gbPositions = await lookupChordPositions('G/B', 'guitar', false);
    assert(gbPositions !== null && gbPositions.length === 3, 'G/B on Guitar must resolve to 3 positions');
    assert.deepStrictEqual(ghPositions[0].frets, gbPositions[0].frets);
  });

  // C05: Modal Lifecycle Transitions under Rapid Interactions
  await runner.test('C05: Modal Lifecycle Transitions under Rapid Interactions', () => {
    const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');

    // Verify cancellation flag in useEffect
    assert(chordModalSrc.includes('let isCancelled = false;'), 'Async lookup must maintain isCancelled flag');
    assert(chordModalSrc.includes('return () => {'), 'useEffect cleanup must cancel previous pending lookups');
    assert(chordModalSrc.includes('isCancelled = true;'), 'Cleanup must set isCancelled = true to prevent race conditions');
  });

  // C06: Song Line Syllable Wrapping + Inline Chord Tokens
  await runner.test('C06: Song Line Syllable Wrapping + Inline Chord Tokens', () => {
    const sampleSongText = `
[Zwrotka 1]
    G         C          D
To jest pierwsza linijka tekstu
`.trim();

    const parsed = parseSong(sampleSongText, 'sample', 'sample.txt');
    assert(parsed.lines.length > 0, 'Must parse lines');
    const chordLine = parsed.lines.find((l) => l.type === 'chords-and-lyrics');
    assert(chordLine && chordLine.segments, 'Must produce chords-and-lyrics segments');

    // Verify segments pair chord with corresponding syllable
    const nonTrivialSegments = chordLine.segments.filter((s) => s.chord);
    assert.strictEqual(nonTrivialSegments.length, 3, 'Must extract exactly 3 chords (G, C, D)');
    assert.strictEqual(nonTrivialSegments[0].chord, 'G');
    assert.strictEqual(nonTrivialSegments[1].chord, 'C');
    assert.strictEqual(nonTrivialSegments[2].chord, 'D');

    // Verify syllable layout markup structure in App.tsx
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('inline-flex flex-col align-top mr-1'), 'Segments must align vertically as atomic columns');
    assert(appSrc.includes('whitespace-pre font-sans'), 'Lyrics must preserve whitespaces');
  });

  // C07: Notation Toggle + Transposition Zero (No-Op Invariant)
  await runner.test('C07: Notation Toggle + Transposition Zero Invariants', () => {
    const chords = ['C', 'D', 'E', 'F', 'G', 'A', 'H', 'B', 'C#', 'Eb', 'F#', 'Ab', 'Bb'];
    for (const c of chords) {
      // 12 semitones up equals 0 semitones
      const up12 = transposeChord(c, 12, false);
      const zero = transposeChord(c, 0, false);
      assert.strictEqual(up12, zero, `12 semitone transposition must equal 0 semitones for ${c}`);

      // 12 semitones down equals 0 semitones
      const down12 = transposeChord(c, -12, false);
      assert.strictEqual(down12, zero, `-12 semitone transposition must equal 0 semitones for ${c}`);
    }
  });

  // C08: Rapid Concurrent Queries under Multi-Instrument Switching
  await runner.test('C08: Rapid Concurrent Queries (100 parallel queries across instruments)', async () => {
    const testChords = ['C', 'Am', 'D/F#', 'H', 'B', 'N.C.', 'C9', 'C11', 'Em/G', 'invalid'];
    const instruments = ['guitar', 'ukulele'] as const;
    const queries = [];

    for (let i = 0; i < 100; i++) {
      const chord = testChords[i % testChords.length];
      const inst = instruments[i % instruments.length];
      const pl = i % 2 === 0;
      queries.push(lookupChordPositions(chord, inst, pl));
    }

    const results = await Promise.all(queries);
    assert.strictEqual(results.length, 100, 'All 100 queries must complete');
    assert(results[0] !== null && results[0].length === 4, 'Guitar C query resolves correctly');
    assert.strictEqual(results[5], null, 'N.C. query safely resolves to null');
  });
}
