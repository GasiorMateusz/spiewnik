import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestRunner, assert } from './helpers/test_framework';
import { lookupChordPositions, INSTRUMENT_DATA } from '../src/lib/chordDb';
import { ChordSvg } from '../src/components/ChordSvg';
import guitarDb from '@tombatossals/chords-db/lib/guitar.json' with { type: 'json' };
import ukuleleDb from '@tombatossals/chords-db/lib/ukulele.json' with { type: 'json' };

export async function runTier2Tests(runner: TestRunner) {
  runner.setTier('Tier 2: Boundary & Corner Cases');

  // B01: Voicing count boundary N=1
  await runner.test('B01: Voicing count boundary N=1 (Ukulele C11)', async () => {
    const pos = await lookupChordPositions('C11', 'ukulele', true);
    assert(pos !== null, 'Ukulele C11 must resolve');
    assert.strictEqual(pos.length, 1, 'Ukulele C11 must have exactly 1 position (N=1 boundary)');
  });

  // B02: Voicing count boundary N=2
  await runner.test('B02: Voicing count boundary N=2 (Ukulele Amaj11)', async () => {
    const pos = await lookupChordPositions('Amaj11', 'ukulele', true);
    assert(pos !== null, 'Ukulele Amaj11 must resolve');
    assert.strictEqual(pos.length, 2, 'Ukulele Amaj11 must have exactly 2 positions (N=2 boundary)');
  });

  // B03: Voicing count boundary N=3
  await runner.test('B03: Voicing count boundary N=3 (Guitar D/F#)', async () => {
    const pos = await lookupChordPositions('D/F#', 'guitar', true);
    assert(pos !== null, 'Guitar D/F# must resolve');
    assert.strictEqual(pos.length, 3, 'Guitar D/F# must have exactly 3 positions (N=3 boundary)');
  });

  // B04: Voicing count boundary N=4
  await runner.test('B04: Voicing count boundary N=4 (Guitar C & Ukulele C)', async () => {
    const guitarC = await lookupChordPositions('C', 'guitar', true);
    const ukeC = await lookupChordPositions('C', 'ukulele', true);
    assert(guitarC !== null && guitarC.length === 4, 'Guitar C must have 4 positions');
    assert(ukeC !== null && ukeC.length === 4, 'Ukulele C must have 4 positions');
  });

  // B05: Voicing count boundary N=5
  await runner.test('B05: Voicing count boundary N=5 (Guitar C9 & Em7)', async () => {
    const c9 = await lookupChordPositions('C9', 'guitar', true);
    const em7 = await lookupChordPositions('Em7', 'guitar', true);
    assert(c9 !== null && c9.length === 5, 'Guitar C9 must have 5 positions (N=5 boundary)');
    assert(em7 !== null && em7.length === 5, 'Guitar Em7 must have 5 positions (N=5 boundary)');
  });

  // B06: Mathematical modulo invariant for all N in [1..10]
  await runner.test('B06: Modulo wrap-around invariant for all N in [1..10]', () => {
    for (let N = 1; N <= 10; N++) {
      for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        const prev = (i - 1 + N) % N;
        assert(next >= 0 && next < N, `Next position ${next} out of bounds for N=${N}`);
        assert(prev >= 0 && prev < N, `Prev position ${prev} out of bounds for N=${N}`);
      }
      // Wrap-around edges
      assert.strictEqual((0 - 1 + N) % N, N - 1, `Wrap-around backward at index 0 failed for N=${N}`);
      assert.strictEqual((N - 1 + 1) % N, 0, `Wrap-around forward at index N-1 failed for N=${N}`);
    }
  });

  // B07: Polish vs International B/H across multiple qualities
  await runner.test('B07: Polish vs International B/H across qualities (maj, m, 7, m7, maj7, sus4, dim)', async () => {
    const qualities = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'dim'];
    for (const q of qualities) {
      const plH = await lookupChordPositions(`H${q}`, 'guitar', true);
      const intB = await lookupChordPositions(`B${q}`, 'guitar', false);
      assert(plH !== null, `PL H${q} must resolve`);
      assert(intB !== null, `INT B${q} must resolve`);
      assert.deepStrictEqual(plH[0].frets, intB[0].frets, `PL H${q} frets must match INT B${q}`);

      const plB = await lookupChordPositions(`B${q}`, 'guitar', true);
      const intBb = await lookupChordPositions(`Bb${q}`, 'guitar', false);
      assert(plB !== null, `PL B${q} must resolve`);
      assert(intBb !== null, `INT Bb${q} must resolve`);
      assert.deepStrictEqual(plB[0].frets, intBb[0].frets, `PL B${q} frets must match INT Bb${q}`);
    }
  });

  // B08: Polish slash chords (G/H, E/H, D/B)
  await runner.test('B08: Polish slash chords (G/H, E/H, D/B)', async () => {
    const gh = await lookupChordPositions('G/H', 'guitar', true);
    const gb = await lookupChordPositions('G/B', 'guitar', false);
    assert(gh !== null && gb !== null, 'G/H and G/B must resolve');
    assert.deepStrictEqual(gh[0].frets, gb[0].frets, 'Polish G/H must equal International G/B');

    const eh = await lookupChordPositions('E/H', 'guitar', true);
    const eb = await lookupChordPositions('E/B', 'guitar', false);
    assert(eh !== null && eb !== null, 'E/H and E/B must resolve');
    assert.deepStrictEqual(eh[0].frets, eb[0].frets, 'Polish E/H must equal International E/B');

    const db = await lookupChordPositions('D/B', 'guitar', true);
    const dbb = await lookupChordPositions('D/Bb', 'guitar', false);
    assert(db !== null && dbb !== null, 'D/B and D/Bb must resolve');
    assert.deepStrictEqual(db[0].frets, dbb[0].frets, 'Polish D/B must equal International D/Bb');
  });

  // B09: Enharmonic bass normalization
  await runner.test('B09: Enharmonic bass normalization (E/Db -> E/C#)', async () => {
    const edb = await lookupChordPositions('E/Db', 'guitar', true);
    const ecsharp = await lookupChordPositions('E/C#', 'guitar', true);
    assert(edb !== null && ecsharp !== null, 'E/Db and E/C# must resolve');
    assert.deepStrictEqual(edb[0].frets, ecsharp[0].frets, 'E/Db must resolve to same frets as E/C#');
  });

  // B10: Uncataloged slash chords on Guitar
  await runner.test('B10: Uncataloged slash chords on Guitar return null', async () => {
    const uncatGuitarSlashes = ['C/D', 'G/A', 'A/B', 'Am/D', 'E/A'];
    for (const slash of uncatGuitarSlashes) {
      const res = await lookupChordPositions(slash, 'guitar', true);
      assert.strictEqual(res, null, `Uncataloged Guitar slash "${slash}" must return null`);
    }
  });

  // B11: Ukulele slash chords safely return null
  await runner.test('B11: Ukulele slash chords safely return null without runtime errors', async () => {
    const ukeSlashes = ['C/G', 'Am/G', 'D/F#', 'F/A', 'G/B', 'Em/B'];
    for (const slash of ukeSlashes) {
      const res = await lookupChordPositions(slash, 'ukulele', true);
      assert.strictEqual(res, null, `Ukulele slash "${slash}" must safely return null`);
    }
  });

  // B12: Fuzzing malformed chord names
  await runner.test('B12: Fuzzing malformed chord names (empty, whitespace, non-musical text)', async () => {
    const fuzzInputs = ['', '   ', 'N.C.', 'intro', 'verse', 'chorus', 'bridge', 'solo', '???', '(2x)', 'Cadd11'];
    for (const input of fuzzInputs) {
      const gRes = await lookupChordPositions(input, 'guitar', true);
      const uRes = await lookupChordPositions(input, 'ukulele', true);
      assert.strictEqual(gRes, null, `Fuzz input "${input}" on guitar must return null`);
      assert.strictEqual(uRes, null, `Fuzz input "${input}" on ukulele must return null`);
    }
  });

  // B13: Fuzzing code injection and malicious inputs
  await runner.test('B13: Fuzzing code injection and malicious inputs', async () => {
    const maliciousInputs = [
      '<script>alert(1)</script>',
      '--DROP TABLE chords;',
      '🎸',
      '\0',
      '\n\t\r',
      'Cmaj7sus4add9add11add13/F#sharp',
    ];
    for (const input of maliciousInputs) {
      const res = await lookupChordPositions(input, 'guitar', true);
      assert.strictEqual(res, null, `Malicious input "${input}" must safely return null without throwing`);
    }
  });

  // B14: Slash chord edge syntax
  await runner.test('B14: Slash chord edge syntax degradation', async () => {
    const edgeCases = ['C/', '/G', 'C//G', 'C\\G', '///', 'C/invalid', 'D/99'];
    for (const edge of edgeCases) {
      const res = await lookupChordPositions(edge, 'guitar', true);
      assert.strictEqual(res, null, `Edge case "${edge}" must safely return null`);
    }
  });

  // B15: Fretboard baseFret boundaries
  await runner.test('B15: Fretboard baseFret boundaries (nut line vs 2fr..12fr)', () => {
    for (const baseFret of [1, 2, 3, 5, 7, 10, 12]) {
      const svg = renderToStaticMarkup(
        React.createElement(ChordSvg, {
          chord: { frets: [-1, 1, 3, 3, 3, 1], baseFret },
          instrument: INSTRUMENT_DATA.guitar,
        })
      );
      if (baseFret === 1) {
        assert(svg.includes('stroke-width="2.5"') || svg.includes('strokeWidth="2.5"'), 'baseFret=1 must render nut line');
      } else {
        assert(svg.includes(`>${baseFret}fr<`), `baseFret=${baseFret} must render text offset`);
      }
    }
  });

  // B16: Barre boundaries
  await runner.test('B16: Barre boundaries (spanning 6, 5, 4 strings)', () => {
    // 6-string barre (F major)
    const svg6 = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [1, 3, 3, 2, 1, 1], barres: [1] },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg6.includes('width="50"'), '6-string barre must have width=50');

    // 5-string barre (Bb major)
    const svg5 = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [-1, 1, 3, 3, 3, 1], barres: [1] },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg5.includes('width="40"'), '5-string barre must have width=40');

    // Ukulele 4-string barre (Bb major)
    const svgUke4 = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [3, 2, 1, 1], barres: [1] },
        instrument: INSTRUMENT_DATA.ukulele,
      })
    );
    assert(svgUke4.includes('fill="#f59e0b"'), 'Ukulele barre must render amber accent');
  });

  // B17: Open and muted string combinations
  await runner.test('B17: Open / muted string combinations', () => {
    // All open
    const allOpenSvg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [0, 0, 0, 0, 0, 0] },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(!allOpenSvg.includes('>×<'), 'All open chord must have no muted marks');

    // Multiple muted strings (e.g. A string root with muted 6th and 1st)
    const multiMutedSvg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [-1, 3, 2, 0, 1, -1] },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    const mutedCount = (multiMutedSvg.match(/>×</g) || []).length;
    assert.strictEqual(mutedCount, 2, 'Chord with frets [-1, 3, 2, 0, 1, -1] must render exactly 2 muted markers');
  });

  // B18: Database exhaustiveness fuzz test (all 2,069 guitar + 2,114 ukulele chords)
  await runner.test('B18: Database exhaustiveness fuzz test (4,183 chords render with 0 errors)', () => {
    let rendered = 0;
    for (const key of Object.keys(guitarDb.chords)) {
      for (const chord of (guitarDb.chords as any)[key]) {
        for (const pos of chord.positions) {
          const svg = renderToStaticMarkup(
            React.createElement(ChordSvg, {
              chord: pos,
              instrument: INSTRUMENT_DATA.guitar,
            })
          );
          assert(svg.length > 100, `Empty SVG rendered for guitar ${key} ${chord.suffix}`);
          rendered++;
        }
      }
    }
    for (const key of Object.keys(ukuleleDb.chords)) {
      for (const chord of (ukuleleDb.chords as any)[key]) {
        for (const pos of chord.positions) {
          const svg = renderToStaticMarkup(
            React.createElement(ChordSvg, {
              chord: pos,
              instrument: INSTRUMENT_DATA.ukulele,
            })
          );
          assert(svg.length > 100, `Empty SVG rendered for ukulele ${key} ${chord.suffix}`);
          rendered++;
        }
      }
    }
    assert(rendered >= 4000, `Expected >= 4000 total rendered chords, got ${rendered}`);
  });
}
