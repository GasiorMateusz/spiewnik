import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework';
import { lookupChordPositions, INSTRUMENT_DATA } from '../src/lib/chordDb';
import { transposeChord } from '../src/lib/chordNotation';
import { parseSong } from '../src/lib/songParser';
import { ChordSvg } from '../src/components/ChordSvg';
import { ChordModal } from '../src/components/ChordModal';

export async function runTier4Tests(runner: TestRunner) {
  runner.setTier('Tier 4: Real-World Musician Scenarios');

  const songDir = './songs';

  // S01: "Wehikuł Czasu" (Dżem) Live Gig Workflow
  await runner.test('S01: "Wehikuł Czasu" (Dżem) Live Gig Workflow (Guitar & Ukulele)', async () => {
    const rawContent = fs.readFileSync(path.join(songDir, 'wehikul-czasu.txt'), 'utf8');
    const song = parseSong(rawContent, 'wehikul-czasu', 'songs/wehikul-czasu.txt');

    assert.strictEqual(song.key, 'A', 'Original key must be A');
    assert(song.uniqueChords.length >= 4, 'Must have at least 4 unique chords');
    assert(song.uniqueChords.includes('A') && song.uniqueChords.includes('E') && song.uniqueChords.includes('D'));

    // Step 1: Musician opens song in original key on Guitar
    for (const chord of song.uniqueChords) {
      const pos = await lookupChordPositions(chord, 'guitar', true);
      assert(pos !== null && pos.length > 0, `Original chord ${chord} must resolve on Guitar`);
      const svg = renderToStaticMarkup(
        React.createElement(ChordSvg, { chord: pos[0], instrument: INSTRUMENT_DATA.guitar })
      );
      assert(svg.includes('viewBox="0 0 80 70"'), `SVG for ${chord} must render correctly`);
    }

    // Step 2: Musician transposes -2 to G major for acoustic vocal comfort
    const transpose = -2;
    for (const chord of song.uniqueChords) {
      const transposed = transposeChord(chord, transpose, true);
      const pos = await lookupChordPositions(transposed, 'guitar', true);
      assert(pos !== null && pos.length > 0, `Transposed (-2) chord ${transposed} must resolve on Guitar`);
    }

    // Step 3: Musician switches to Ukulele
    for (const chord of song.uniqueChords) {
      const transposed = transposeChord(chord, transpose, true);
      const ukePos = await lookupChordPositions(transposed, 'ukulele', true);
      assert(ukePos !== null && ukePos.length > 0, `Transposed (-2) chord ${transposed} must resolve on Ukulele`);
      assert.strictEqual(ukePos[0].frets.length, 4, 'Ukulele voicing must have 4 strings');
    }
  });

  // S02: "Whisky" (Dżem) Open Mic Workflow
  await runner.test('S02: "Whisky" (Dżem) Open Mic Workflow (Multi-Voicing & Capo Transpose)', async () => {
    const rawContent = fs.readFileSync(path.join(songDir, 'whisky.txt'), 'utf8');
    const song = parseSong(rawContent, 'whisky', 'songs/whisky.txt');

    assert.strictEqual(song.key, 'G', 'Whisky key must be G');
    assert(song.uniqueChords.includes('G') && song.uniqueChords.includes('C') && song.uniqueChords.includes('D'));

    // Step 1: Musician tests all carousel positions for G, C, D on Guitar
    for (const chord of ['G', 'C', 'D']) {
      const positions = await lookupChordPositions(chord, 'guitar', true);
      assert(positions !== null && positions.length >= 3, `${chord} must have at least 3 positions`);
      for (let i = 0; i < positions.length; i++) {
        const svg = renderToStaticMarkup(
          React.createElement(ChordSvg, { chord: positions[i], instrument: INSTRUMENT_DATA.guitar })
        );
        assert(svg.includes('viewBox="0 0 80 70"'), `Position ${i + 1} of ${chord} must render SVG`);
      }
    }

    // Step 2: Capo / Vocal Transposition: Musician transposes +3
    // In Polish mode: G -> B (Polish B = Bb major), C -> D# (Eb), D -> F
    const transChord = transposeChord('G', 3, true);
    assert.strictEqual(transChord, 'B', 'G + 3 in Polish notation must yield "B" (Bb major)');

    const bPositions = await lookupChordPositions(transChord, 'guitar', true);
    assert(bPositions !== null, 'Polish chord "B" must resolve');
    assert.deepStrictEqual(bPositions[0].frets, [-1, 1, 3, 3, 3, 1], 'Polish "B" must resolve to Bb major frets');
  });

  // S03: "Lornetka" (Golec uOrkiestra) Folk-Rock Chromatic Transposition Stress Test
  await runner.test('S03: "Lornetka" (Golec uOrkiestra) Chromatic Transposition Sweep (-6..+6)', async () => {
    const rawContent = fs.readFileSync(path.join(songDir, 'lornetka.txt'), 'utf8');
    const song = parseSong(rawContent, 'lornetka', 'songs/lornetka.txt');

    assert(song.uniqueChords.length >= 6, 'Lornetka must have at least 6 unique chords');

    // Sweep all 13 semitones (-6 to +6) across both instruments and Polish/International notation
    for (const chord of song.uniqueChords) {
      for (let st = -6; st <= 6; st++) {
        for (const pl of [true, false]) {
          const transposed = transposeChord(chord, st, pl);
          for (const inst of ['guitar', 'ukulele'] as const) {
            const pos = await lookupChordPositions(transposed, inst, pl);
            assert(
              pos !== null && pos.length > 0,
              `Lornetka chord "${chord}" transposed by ${st > 0 ? '+' + st : st} (notated: "${transposed}", pl=${pl}) failed on ${inst}`
            );
          }
        }
      }
    }
  });

  // S04: "Bieszczadzkie Anioły" (SDM) Campfire Ballad Workflow
  await runner.test('S04: "Bieszczadzkie Anioły" (SDM) Campfire Ballad (Polish H / Hm Voicings)', async () => {
    const rawContent = fs.readFileSync(path.join(songDir, 'bieszczadzkie-anioly.txt'), 'utf8');
    const song = parseSong(rawContent, 'bieszczadzkie-anioly', 'songs/bieszczadzkie-anioly.txt');

    assert.strictEqual(song.key, 'G', 'Key must be G');

    // Transpose +4 in Polish mode: G -> H (B natural in PL)
    const transposedG4 = transposeChord('G', 4, true);
    assert.strictEqual(transposedG4, 'H', 'G + 4 in Polish mode yields "H"');

    // Verify H on Guitar resolves to B natural
    const hGuitar = await lookupChordPositions(transposedG4, 'guitar', true);
    assert(hGuitar !== null && hGuitar.length >= 3, 'H on guitar must have >= 3 positions');
    assert.deepStrictEqual(hGuitar[0].frets, [2, 2, 4, 4, 4, 2], 'H on guitar must have standard B natural frets');

    // Verify H on Ukulele resolves to B natural
    const hUke = await lookupChordPositions(transposedG4, 'ukulele', true);
    assert(hUke !== null && hUke.length >= 3, 'H on ukulele must have >= 3 positions');
    assert.deepStrictEqual(hUke[0].frets, [4, 3, 2, 2], 'H on ukulele must have standard B natural frets');

    // Transpose +5 (to C) and -4 (to D#)
    for (const chord of song.uniqueChords) {
      for (const st of [5, -4]) {
        const trans = transposeChord(chord, st, true);
        const guitarPos = await lookupChordPositions(trans, 'guitar', true);
        const ukePos = await lookupChordPositions(trans, 'ukulele', true);
        assert(guitarPos !== null && ukePos !== null, `Song chord ${trans} must resolve on both instruments`);
      }
    }
  });

  // S05: End-to-End Musician Performance Rapid Playback Simulation
  await runner.test('S05: Full Musician Performance Sequential Playback Simulation', async () => {
    const coreRepertoire = ['wehikul-czasu.txt', 'whisky.txt', 'lornetka.txt', 'bieszczadzkie-anioly.txt'];
    const songFiles = fs.readdirSync(songDir).filter((f) => f.endsWith('.txt') && coreRepertoire.includes(f));
    let totalChordTaps = 0;

    for (const file of songFiles) {
      const raw = fs.readFileSync(path.join(songDir, file), 'utf8');
      const song = parseSong(raw, file, path.join(songDir, file));

      // Simulate musician tapping every inline chord token in order
      for (const line of song.lines) {
        if (line.type === 'chords-and-lyrics' && line.segments) {
          for (const seg of line.segments) {
            if (seg.chord) {
              totalChordTaps++;
              const pos = await lookupChordPositions(seg.chord, 'guitar', true);
              assert(pos !== null && pos.length > 0, `Inline chord ${seg.chord} in ${file} must resolve`);

              // Render chord diagram modal markup
              const html = renderToStaticMarkup(
                React.createElement(ChordModal, {
                  isOpen: true,
                  chord: seg.chord,
                  instrument: 'guitar',
                  onInstrumentChange: () => {},
                  onClose: () => {},
                })
              );
              assert(html.includes('<dialog'), 'Dialog must render for each tapped chord');
            }
          }
        }
      }
    }
    assert(totalChordTaps >= 50, `Expected at least 50 total chord taps in performance simulation, got ${totalChordTaps}`);
  });
}
