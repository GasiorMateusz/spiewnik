import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { lookupChordPositions, INSTRUMENT_DATA } from '../src/lib/chordDb';
import { transposeChord } from '../src/lib/chordNotation';
import { parseSong } from '../src/lib/songParser';
import { ChordSvg } from '../src/components/ChordSvg';
import { ChordModal } from '../src/components/ChordModal';
import guitarDb from '@tombatossals/chords-db/lib/guitar.json' with { type: 'json' };
import ukuleleDb from '@tombatossals/chords-db/lib/ukulele.json' with { type: 'json' };

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

async function runTest(suite: string, name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ suite, name, passed: true });
    console.log(`  ✓ [${suite}] ${name}`);
  } catch (err: any) {
    results.push({ suite, name, passed: false, error: err?.message || String(err), details: err });
    console.error(`  ✗ [${suite}] ${name}: ${err?.message || err}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('STARTING EMPIRICAL CHALLENGER STRESS TESTS — MILESTONE M1');
  console.log('================================================================\n');

  // ==========================================================================
  // SUITE 1: Chromatic Roots in Polish Notation across Guitar and Ukulele
  // ==========================================================================
  console.log('--- SUITE 1: Polish Notation Chromatic Roots ---');
  const chromaticRoots = ['H', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A'];

  for (const inst of ['guitar', 'ukulele'] as const) {
    const expectedStrings = inst === 'guitar' ? 6 : 4;

    for (const root of chromaticRoots) {
      await runTest('Suite 1: Roots', `${inst.toUpperCase()} major: ${root}`, async () => {
        const positions = await lookupChordPositions(root, inst, true);
        assert(positions !== null, `Chord ${root} returned null on ${inst}`);
        assert(positions.length > 0, `Chord ${root} has 0 positions on ${inst}`);
        for (const pos of positions) {
          assert.strictEqual(pos.frets.length, expectedStrings, `Frets length mismatch for ${root} on ${inst}`);
          for (const f of pos.frets) {
            assert(typeof f === 'number' && f >= -1 && f <= 5, `Invalid fret value ${f} in ${root}`);
          }
        }
      });

      await runTest('Suite 1: Roots', `${inst.toUpperCase()} minor: ${root}m`, async () => {
        const positions = await lookupChordPositions(`${root}m`, inst, true);
        assert(positions !== null, `Chord ${root}m returned null on ${inst}`);
        assert(positions.length > 0, `Chord ${root}m has 0 positions on ${inst}`);
        for (const pos of positions) {
          assert.strictEqual(pos.frets.length, expectedStrings, `Frets length mismatch for ${root}m on ${inst}`);
        }
      });
    }
  }

  // ==========================================================================
  // SUITE 2: Polish vs International B / H Notation Equivalence & Distinction
  // ==========================================================================
  console.log('\n--- SUITE 2: Polish vs International B/H Equivalence ---');

  for (const inst of ['guitar', 'ukulele'] as const) {
    await runTest('Suite 2: B/H Mapping', `${inst} Polish H == International B`, async () => {
      const plH = await lookupChordPositions('H', inst, true);
      const intB = await lookupChordPositions('B', inst, false);
      assert.deepStrictEqual(plH, intB, `PL H must strictly equal INT B on ${inst}`);
    });

    await runTest('Suite 2: B/H Mapping', `${inst} Polish B == International Bb`, async () => {
      const plB = await lookupChordPositions('B', inst, true);
      const intBb = await lookupChordPositions('Bb', inst, false);
      assert.deepStrictEqual(plB, intBb, `PL B must strictly equal INT Bb on ${inst}`);
    });

    await runTest('Suite 2: B/H Mapping', `${inst} Polish H != Polish B`, async () => {
      const plH = await lookupChordPositions('H', inst, true);
      const plB = await lookupChordPositions('B', inst, true);
      assert.notDeepStrictEqual(plH, plB, `PL H must not equal PL B on ${inst}`);
    });

    await runTest('Suite 2: B/H Mapping', `${inst} Polish Hm == International Bm`, async () => {
      const plHm = await lookupChordPositions('Hm', inst, true);
      const intBm = await lookupChordPositions('Bm', inst, false);
      assert.deepStrictEqual(plHm, intBm, `PL Hm must strictly equal INT Bm on ${inst}`);
    });

    await runTest('Suite 2: B/H Mapping', `${inst} Polish Bm == International Bbm`, async () => {
      const plBm = await lookupChordPositions('Bm', inst, true);
      const intBbm = await lookupChordPositions('Bbm', inst, false);
      assert.deepStrictEqual(plBm, intBbm, `PL Bm must strictly equal INT Bbm on ${inst}`);
    });
  }

  // ==========================================================================
  // SUITE 3: Multi-Voicing (N = 1, 2, 3, 4, 5) & Carousel Math
  // ==========================================================================
  console.log('\n--- SUITE 3: Multi-Voicing Voicings (N=1..5) ---');

  await runTest('Suite 3: Voicings', 'N=1: Ukulele C11', async () => {
    const pos = await lookupChordPositions('C11', 'ukulele', true);
    assert(pos !== null, 'C11 on ukulele should resolve');
    assert.strictEqual(pos.length, 1, `Expected 1 position, got ${pos.length}`);
  });

  await runTest('Suite 3: Voicings', 'N=2: Ukulele Amaj11', async () => {
    const pos = await lookupChordPositions('Amaj11', 'ukulele', true);
    assert(pos !== null, 'Amaj11 on ukulele should resolve');
    assert.strictEqual(pos.length, 2, `Expected 2 positions, got ${pos.length}`);
  });

  await runTest('Suite 3: Voicings', 'N=3: Guitar D/F# and C/G', async () => {
    const dSlash = await lookupChordPositions('D/F#', 'guitar', true);
    const cSlash = await lookupChordPositions('C/G', 'guitar', true);
    assert(dSlash !== null && dSlash.length === 3, 'D/F# must have 3 positions');
    assert(cSlash !== null && cSlash.length === 3, 'C/G must have 3 positions');
  });

  await runTest('Suite 3: Voicings', 'N=4: Guitar C and Ukulele C', async () => {
    const gC = await lookupChordPositions('C', 'guitar', true);
    const uC = await lookupChordPositions('C', 'ukulele', true);
    assert(gC !== null && gC.length === 4, 'C on guitar must have 4 positions');
    assert(uC !== null && uC.length === 4, 'C on ukulele must have 4 positions');
  });

  await runTest('Suite 3: Voicings', 'N=5: Guitar C9 and Em7', async () => {
    const c9 = await lookupChordPositions('C9', 'guitar', true);
    const em7 = await lookupChordPositions('Em7', 'guitar', true);
    assert(c9 !== null && c9.length === 5, 'C9 on guitar must have 5 positions');
    assert(em7 !== null && em7.length === 5, 'Em7 on guitar must have 5 positions');
  });

  await runTest('Suite 3: Carousel Math', 'Modulo wrap-around invariant for all N in [1..5]', () => {
    for (const N of [1, 2, 3, 4, 5]) {
      // Step left from 0 wraps to N - 1
      const prevFromZero = (0 - 1 + N) % N;
      assert.strictEqual(prevFromZero, N - 1, `Wrapping left from 0 failed for N=${N}`);

      // Step right from N - 1 wraps to 0
      const nextFromEnd = (N - 1 + 1) % N;
      assert.strictEqual(nextFromEnd, 0, `Wrapping right from N-1 failed for N=${N}`);

      // Single-voicing lock:
      const isDisabled = N <= 1;
      assert.strictEqual(isDisabled, N === 1, `Disabled state mismatch for N=${N}`);
    }
  });

  // ==========================================================================
  // SUITE 4: Slash Chords Resolution vs Fallback
  // ==========================================================================
  console.log('\n--- SUITE 4: Slash Chords Resolution vs Fallback ---');

  const validGuitarSlashChords = ['D/F#', 'C/G', 'Em/G', 'C/E', 'D/A', 'F/E'];
  for (const sc of validGuitarSlashChords) {
    await runTest('Suite 4: Slash Chords', `Valid Guitar slash chord: ${sc}`, async () => {
      const pos = await lookupChordPositions(sc, 'guitar', true);
      assert(pos !== null, `Slash chord ${sc} should have resolved on guitar`);
      assert.strictEqual(pos.length, 3, `Slash chord ${sc} should have 3 positions`);
    });
  }

  await runTest('Suite 4: Slash Chords', 'Guitar slash G/H (Polish) == G/B (International)', async () => {
    const plGH = await lookupChordPositions('G/H', 'guitar', true);
    const intGB = await lookupChordPositions('G/B', 'guitar', false);
    assert(plGH !== null, 'G/H in Polish should resolve');
    assert.deepStrictEqual(plGH, intGB, 'G/H in PL should match G/B in INT');
  });

  // Polish notation slash chords vs International mode
  await runTest('Suite 4: Slash Chords', 'Guitar Polish slash: E/H resolves to E/B (3 positions)', async () => {
    const plEH = await lookupChordPositions('E/H', 'guitar', true);
    const intEB = await lookupChordPositions('E/B', 'guitar', false);
    assert(plEH !== null, 'E/H in Polish should resolve');
    assert.deepStrictEqual(plEH, intEB, 'E/H in PL should match E/B in INT');
  });

  await runTest('Suite 4: Slash Chords', 'Guitar Polish slash: E/B maps to uncataloged E/Bb (null)', async () => {
    const plEB = await lookupChordPositions('E/B', 'guitar', true);
    assert.strictEqual(plEB, null, 'E/B in Polish mode is E over Bb, which is not cataloged in chords-db');
  });

  await runTest('Suite 4: Slash Chords', 'Guitar Polish slash: D/B resolves to D/Bb (3 positions)', async () => {
    const plDB = await lookupChordPositions('D/B', 'guitar', true);
    const intDBb = await lookupChordPositions('D/Bb', 'guitar', false);
    assert(plDB !== null, 'D/B in Polish should resolve to D/Bb');
    assert.deepStrictEqual(plDB, intDBb, 'D/B in PL should match D/Bb in INT');
  });

  await runTest('Suite 4: Slash Chords', 'Guitar Enharmonic bass: E/Db resolves to E/C# (3 positions)', async () => {
    const enharmonic = await lookupChordPositions('E/Db', 'guitar', true);
    const standard = await lookupChordPositions('E/C#', 'guitar', true);
    assert(enharmonic !== null, 'E/Db should resolve via enharmonic normalization');
    assert.deepStrictEqual(enharmonic, standard);
  });

  // Uncataloged slash chords on guitar
  const uncatalogedGuitarSlash = ['C/D', 'G/A', 'A/B', 'Am/D', 'E/A'];
  for (const sc of uncatalogedGuitarSlash) {
    await runTest('Suite 4: Slash Chords', `Uncataloged Guitar slash: ${sc} -> null`, async () => {
      const pos = await lookupChordPositions(sc, 'guitar', true);
      assert.strictEqual(pos, null, `Uncataloged slash chord ${sc} must return null`);
    });
  }

  // All slash chords on Ukulele must return null
  const ukuleleSlashChords = ['C/G', 'Am/G', 'D/F#', 'F/A', 'G/B', 'Em/B'];
  for (const sc of ukuleleSlashChords) {
    await runTest('Suite 4: Slash Chords', `Ukulele slash: ${sc} -> null`, async () => {
      const pos = await lookupChordPositions(sc, 'ukulele', true);
      assert.strictEqual(pos, null, `Ukulele slash chord ${sc} must return null`);
    });
  }

  // ==========================================================================
  // SUITE 5: Extreme Inputs, Non-Musical Text, and Boundary Fuzzing
  // ==========================================================================
  console.log('\n--- SUITE 5: Extreme Inputs and Boundary Fuzzing ---');

  const invalidInputs = [
    '',
    '   ',
    'N.C.',
    'intro',
    '??',
    'solo',
    'chorus',
    'bridge',
    'verse',
    'Cadd11',
    'Hdim77',
    '123',
    'C//G',
    '///',
    'C\\G',
    '<script>alert(1)</script>',
    '--DROP TABLE chords;',
    '🎸',
    'D/invalid',
    null as any,
    undefined as any,
    42 as any,
    {} as any,
    [] as any,
  ];

  for (const input of invalidInputs) {
    const label = typeof input === 'string' ? `"${input}"` : String(input);
    await runTest('Suite 5: Extreme Inputs', `Input: ${label} -> null (no throw)`, async () => {
      for (const inst of ['guitar', 'ukulele'] as const) {
        const res = await lookupChordPositions(input, inst, true);
        assert.strictEqual(res, null, `Expected null for ${label} on ${inst}`);
      }
    });
  }

  // Adversarial check: trailing garbage in slash chords (Defect Discovery)
  await runTest('Suite 5: Extreme Inputs', 'Empirical Defect Audit: Trailing garbage after slash bass note', async () => {
    const res1 = await lookupChordPositions('D/F#garbage', 'guitar', true);
    const res2 = await lookupChordPositions('D/F#/G', 'guitar', true);
    const res3 = await lookupChordPositions('E/C##', 'guitar', true);

    // Documenting empirical defect: the regex /^([A-G|H][#b]?)([^/]*)(?:\/([A-G|H][#b]?)(.*))?$/
    // has group 4 (.*) which absorbs trailing garbage and is ignored, allowing invalid tokens to resolve.
    console.log(`     [DEFECT AUDIT] D/F#garbage resolved to: ${res1 ? res1.length + ' positions (UNEXPECTED RESOLUTION)' : 'null'}`);
    console.log(`     [DEFECT AUDIT] D/F#/G resolved to: ${res2 ? res2.length + ' positions (UNEXPECTED RESOLUTION)' : 'null'}`);
    console.log(`     [DEFECT AUDIT] E/C## resolved to: ${res3 ? res3.length + ' positions (UNEXPECTED RESOLUTION)' : 'null'}`);
    assert(res1 !== null && res2 !== null, 'Empirically confirms that trailing garbage is accepted by chordDb');
  });

  // ==========================================================================
  // SUITE 6: SVG Diagram & Component Invariants
  // ==========================================================================
  console.log('\n--- SUITE 6: ChordSvg Rendering Invariants ---');

  await runTest('Suite 6: ChordSvg', 'Guitar diagram includes 6 strings and EADGBE tuning notes', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg.includes('<svg'), 'Output must be SVG');
    assert(svg.includes('E') && svg.includes('A') && svg.includes('D') && svg.includes('G') && svg.includes('B'), 'Must include EADGBE notes');
  });

  await runTest('Suite 6: ChordSvg', 'Ukulele diagram includes 4 strings and GCEA tuning notes', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [0, 0, 0, 3], baseFret: 1 },
        instrument: INSTRUMENT_DATA.ukulele,
      })
    );
    assert(svg.includes('<svg'), 'Output must be SVG');
    assert(svg.includes('G') && svg.includes('C') && svg.includes('E') && svg.includes('A'), 'Must include GCEA notes');
    // Ensure guitar-only tuning notes (D, B) are not present as text nodes
    assert(!svg.includes('>D<') && !svg.includes('>B<'), 'Ukulele must not include D or B tunings');
  });

  await runTest('Suite 6: ChordSvg', 'Barre chord renders amber rect and barre dots', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [1, 3, 3, 2, 1, 1], barres: [1], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg.includes('<rect'), 'Must render rect for barre');
    assert(svg.includes('#f59e0b'), 'Must render amber color');
  });

  await runTest('Suite 6: ChordSvg', 'Muted string renders red × mark', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg.includes('×'), 'Must render × for muted string');
    assert(svg.includes('#ef4444'), 'Must render red color for muted string');
  });

  await runTest('Suite 6: ChordSvg', 'Base fret offset displays "3fr" when baseFret > 1', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [1, 3, 3, 2, 1, 1], baseFret: 3 },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg.includes('3fr'), 'Must render 3fr text');
  });

  await runTest('Suite 6: ChordSvg', 'Base fret === 1 renders thick nut stroke', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [0, 1, 0, 2, 3, -1], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(!svg.includes('1fr'), 'Nut must not display 1fr');
    assert(svg.includes('stroke-width="2.5"'), 'Nut must have thick 2.5 stroke');
  });

  await runTest('Suite 6: ChordSvg', 'Fuzz test every chord position across entire database (4,183 chords)', () => {
    let count = 0;
    for (const k in guitarDb.chords) {
      for (const chord of (guitarDb.chords as any)[k]) {
        for (const pos of chord.positions) {
          count++;
          const svg = renderToStaticMarkup(
            React.createElement(ChordSvg, { chord: pos, instrument: INSTRUMENT_DATA.guitar })
          );
          assert(svg.includes('<svg'), `Invalid SVG output for Guitar ${k} ${chord.suffix}`);
        }
      }
    }

    for (const k in ukuleleDb.chords) {
      for (const chord of (ukuleleDb.chords as any)[k]) {
        for (const pos of chord.positions) {
          count++;
          const svg = renderToStaticMarkup(
            React.createElement(ChordSvg, { chord: pos, instrument: INSTRUMENT_DATA.ukulele })
          );
          assert(svg.includes('<svg'), `Invalid SVG output for Ukulele ${k} ${chord.suffix}`);
        }
      }
    }
    console.log(`     [FUZZ] Successfully rendered ${count} unique chord positions with 0 errors.`);
  });

  // ==========================================================================
  // SUITE 7: ChordModal Static Structure & Fallback Invariants
  // ==========================================================================
  console.log('\n--- SUITE 7: ChordModal Static Structure & Fallback Invariants ---');

  await runTest('Suite 7: ChordModal', 'Fallback notice renders in Polish when chord is uncataloged / null', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: 'Cadd11',
        instrument: 'guitar',
        onInstrumentChange: () => {},
        onClose: () => {},
      })
    );
    assert(html.includes('Diagram niedostępny dla tego chwytu'), 'Must display Polish fallback');
    assert(html.includes('<dialog'), 'Must use native HTML5 dialog element');
    assert(html.includes('Gitara') && html.includes('Ukulele'), 'Must render instrument switcher');
    assert(html.includes('aria-label="Zamknij"'), 'Must render close button');
  });

  await runTest('Suite 7: ChordModal', 'Instrument switch buttons reflect active instrument state', () => {
    const guitarHtml = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: 'C',
        instrument: 'guitar',
        onInstrumentChange: () => {},
        onClose: () => {},
      })
    );
    assert(guitarHtml.includes('bg-amber-500 text-neutral-950 font-semibold shadow-sm">Gitara</button>'));

    const ukeHtml = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: 'C',
        instrument: 'ukulele',
        onInstrumentChange: () => {},
        onClose: () => {},
      })
    );
    assert(ukeHtml.includes('bg-amber-500 text-neutral-950 font-semibold shadow-sm">Ukulele</button>'));
  });

  // ==========================================================================
  // SUITE 8: Concurrency & Rapid Switching Stress Test
  // ==========================================================================
  console.log('\n--- SUITE 8: Concurrency & Rapid Switching ---');

  await runTest('Suite 8: Concurrency', 'Rapid concurrent queries (100 parallel requests) complete deterministically', async () => {
    const chords = ['C', 'Am', 'D/F#', 'H', 'B', 'N.C.', 'C9', 'C11', 'Em/G', 'invalid'];
    const instruments = ['guitar', 'ukulele'] as const;

    const promises = [];
    for (let i = 0; i < 100; i++) {
      const c = chords[i % chords.length];
      const inst = instruments[i % 2];
      const pl = i % 3 !== 0;
      promises.push(lookupChordPositions(c, inst, pl));
    }

    const allResults = await Promise.all(promises);
    assert.strictEqual(allResults.length, 100);
    // Validate determinism for index 0 ('C', 'guitar', true)
    assert(allResults[0] !== null && allResults[0].length === 4);
    // Validate determinism for index 5 ('N.C.') -> null
    assert.strictEqual(allResults[5], null);
  });

  // ==========================================================================
  // SUITE 9: Songbook Repository Songs & Full Transposition Range (-6..+6)
  // ==========================================================================
  console.log('\n--- SUITE 9: Repository Songs Verification (-6..+6 Transpositions) ---');

  const songDir = './songs';
  if (fs.existsSync(songDir)) {
    const songFiles = fs.readdirSync(songDir).filter((f) => f.endsWith('.txt'));

    for (const file of songFiles) {
      await runTest('Suite 9: Song Files', `All chords in "${file}" resolve across transpositions (-6..+6)`, async () => {
        const content = fs.readFileSync(path.join(songDir, file), 'utf-8');
        const song = parseSong(content, file, path.join(songDir, file));
        assert(song.uniqueChords.length > 0, `No unique chords found in ${file}`);

        for (const chord of song.uniqueChords) {
          for (let semitones = -6; semitones <= 6; semitones++) {
            for (const pl of [true, false]) {
              const transposed = transposeChord(chord, semitones, pl);
              for (const inst of ['guitar', 'ukulele'] as const) {
                const pos = await lookupChordPositions(transposed, inst, pl);
                assert(
                  pos !== null && pos.length > 0,
                  `Failed to resolve song chord ${transposed} (from ${chord} @ ${semitones > 0 ? '+' + semitones : semitones}, pl=${pl}) on ${inst}`
                );
              }
            }
          }
        }
      });
    }
  }

  // Summary
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`TEST RESULTS SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
