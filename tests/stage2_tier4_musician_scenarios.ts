import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework';
import { SongViewer } from '../src/components/SongViewer';
import { parseSong } from '../src/lib/songParser';
import { transposeChord } from '../src/lib/chordNotation';
import { lookupChordPositions } from '../src/lib/chordDb';

export async function runStage2Tier4Tests(runner: TestRunner) {
  runner.setTier('Stage 2 — Tier 4: Real-World Musician Scenarios');

  const songDir = './songs';

  // M01: Stand distance scaling scenario
  await runner.test('M01: Stand distance scaling scenario (night gig on dark stage, +12px scaling on Wehikuł Czasu)', () => {
    const rawContent = fs.readFileSync(path.join(songDir, 'wehikul-czasu.txt'), 'utf8');
    const song = parseSong(rawContent, 'wehikul-czasu', 'songs/wehikul-czasu.txt');

    // Musician enlarges to maximum +12px offset in dark theme
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song,
        theme: 'dark',
        initialFontSizeOffset: 12,
        initialTranspose: 0,
        initialPolishNotation: true,
      })
    );

    // 1. High contrast OLED dark styling
    assert(html.includes('bg-neutral-900 border-neutral-800'), 'Dark theme container classes must be applied');
    assert(html.includes('text-neutral-100') && html.includes('text-neutral-200'), 'High contrast text must be used');

    // 2. Large stand-distance font size styles
    assert(html.includes('font-size:28px;line-height:1.35'), 'Lyrics must scale to 28px');
    assert(html.includes('font-size:20px;height:25px'), 'Chords must scale to 20px font-size and 25px row height');

    // 3. Vertical alignment invariant
    assert(!html.includes('h-4 select-none'), 'No hardcoded h-4 clipping chord row');

    // 4. Atomic tokens preserved
    assert(html.includes('inline-flex flex-col align-top mr-1'), 'Atomic column tokens preserved');
    assert(html.includes('overflow-x-hidden'), 'Container prevents horizontal body blowout');

    // 5. Unique chords present in toolbar
    for (const ch of song.uniqueChords) {
      assert(html.includes(`>${ch}</button>`), `Unique chord ${ch} must be in quick bar`);
    }
  });

  // M02: Campfire vocal range transposition scenario
  await runner.test('M02: Vocal range transposition scenario (transposing Wehikuł Czasu -2 and Whisky +3)', async () => {
    // 1. Wehikuł Czasu (A major -> G major by -2 semitones)
    const wehikulRaw = fs.readFileSync(path.join(songDir, 'wehikul-czasu.txt'), 'utf8');
    const wehikul = parseSong(wehikulRaw, 'wehikul-czasu', 'songs/wehikul-czasu.txt');

    const htmlWehikul = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: wehikul,
        initialTranspose: -2,
      })
    );
    assert(htmlWehikul.includes('>-2</span>'), 'Transposition offset must show -2');
    assert(htmlWehikul.includes('>Reset</button>'), 'One-tap Reset button must be present');

    // Verify chords in -2 key: A->G, E->D, F#m->Em, D->C
    for (const orig of wehikul.uniqueChords) {
      const transposed = transposeChord(orig, -2, true);
      assert(htmlWehikul.includes(`>${transposed}</button>`), `Transposed chord ${transposed} must appear in viewer`);

      // Both guitar and ukulele must resolve the transposed chords
      const guitarPos = await lookupChordPositions(transposed, 'guitar', true);
      const ukePos = await lookupChordPositions(transposed, 'ukulele', true);
      assert(guitarPos !== null && guitarPos.length > 0, `Guitar voicing for ${transposed} must resolve`);
      assert(ukePos !== null && ukePos.length > 0, `Ukulele voicing for ${transposed} must resolve`);
    }

    // 2. Whisky (G major -> +3 semitones: G->B in Polish, C->D#, D->F)
    const whiskyRaw = fs.readFileSync(path.join(songDir, 'whisky.txt'), 'utf8');
    const whisky = parseSong(whiskyRaw, 'whisky', 'songs/whisky.txt');

    const htmlWhisky = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: whisky,
        initialTranspose: 3,
        initialPolishNotation: true,
      })
    );
    assert(htmlWhisky.includes('>+3</span>'), 'Whisky transpose must show +3');
    assert(htmlWhisky.includes('>Reset</button>'), 'Reset button must be present');

    // In Polish notation G + 3 = B (which corresponds to Bb)
    const gPlus3 = transposeChord('G', 3, true);
    assert.strictEqual(gPlus3, 'B', 'G + 3 in Polish mode must be B');
    assert(htmlWhisky.includes('>B</button>'), 'Chord B must appear in quick bar');

    // Guitar voicing for Polish B must resolve to Bb major (fret 1 barre)
    const bPos = await lookupChordPositions('B', 'guitar', true);
    assert(bPos !== null && bPos.length > 0, 'Polish B must resolve to guitar voicings');
    assert.strictEqual(bPos[0].frets[1], 1, 'Polish B first position must be 1st fret on A string');
  });

  // M03: Polish campfire songbook convention scenario (SDM Bieszczadzkie Anioły with Polish notation H / Hm)
  await runner.test('M03: Polish campfire songbook convention scenario (SDM Bieszczadzkie Anioły & Polish H / Hm)', async () => {
    const raw = fs.readFileSync(path.join(songDir, 'bieszczadzkie-anioly.txt'), 'utf8');
    const song = parseSong(raw, 'bieszczadzkie-anioly', 'songs/bieszczadzkie-anioly.txt');

    // 1. In Polish campfire tradition, transposing G major up 4 semitones gives key of H (B natural in INT)
    const transposedG4 = transposeChord('G', 4, true);
    assert.strictEqual(transposedG4, 'H', 'G + 4 in Polish mode must be "H"');

    // Render Bieszczadzkie Anioły transposed +4 in Polish mode
    const htmlH = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song,
        initialTranspose: 4,
        initialPolishNotation: true,
      })
    );
    assert(htmlH.includes('Notacja: PL (H)'), 'Must indicate Polish notation');
    assert(htmlH.includes('>H</button>'), 'Chord H must appear in quick bar and lyrics');

    // 2. Toggling to International mode displays B instead of H
    const htmlInt = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song,
        initialTranspose: 4,
        initialPolishNotation: false,
      })
    );
    assert(htmlInt.includes('Notacja: INT (B)'), 'Must indicate International notation');
    assert(htmlInt.includes('>B</button>'), 'Chord H must display as B in International mode');

    // 3. Polish campfire minor chord convention: Hm (B minor)
    // Verify Hm resolves to valid voicings on both Guitar and Ukulele
    assert.strictEqual(transposeChord('Am', 2, true), 'Hm', 'Am + 2 in Polish notation must be Hm');
    assert.strictEqual(transposeChord('Hm', 0, true), 'Hm', 'Hm in Polish notation displays as Hm');
    assert.strictEqual(transposeChord('Hm', 0, false), 'Bm', 'Hm in International notation displays as Bm');

    const guitarHm = await lookupChordPositions('Hm', 'guitar', true);
    const ukeHm = await lookupChordPositions('Hm', 'ukulele', true);
    assert(guitarHm !== null && guitarHm.length > 0, 'Hm must resolve on Guitar');
    assert.deepStrictEqual(guitarHm[0].frets, [2, 2, 4, 4, 3, 2], 'Guitar Hm must be [2, 2, 4, 4, 3, 2]');
    assert(ukeHm !== null && ukeHm.length > 0, 'Hm must resolve on Ukulele');
    assert.deepStrictEqual(ukeHm[0].frets, [4, 2, 2, 2], 'Ukulele Hm must be [4, 2, 2, 2]');

    // Transpose Hm across campfire keys (+5 to Em, -4 to Gm)
    assert.strictEqual(transposeChord('Hm', 5, true), 'Em');
    assert.strictEqual(transposeChord('Hm', -4, true), 'Gm');
  });

  // M04: Complete repertoire parsing and rendering (all 4 repository songs)
  await runner.test('M04: Production repertoire complete parsing & SongViewer rendering (all 4 songs)', async () => {
    const songFiles = ['bieszczadzkie-anioly.txt', 'wehikul-czasu.txt', 'whisky.txt', 'lornetka.txt'];

    for (const filename of songFiles) {
      const raw = fs.readFileSync(path.join(songDir, filename), 'utf8');
      const slug = path.basename(filename, '.txt');
      const song = parseSong(raw, slug, `songs/${filename}`);

      assert(song.title.length > 0, `Song ${filename} must have title`);
      assert(song.artist.length > 0, `Song ${filename} must have artist`);
      assert(song.uniqueChords.length > 0, `Song ${filename} must have chords`);

      // Render SongViewer at baseline
      const html = renderToStaticMarkup(
        React.createElement(SongViewer, {
          song,
        })
      );

      assert(html.includes(song.title), `Rendered HTML must contain ${song.title}`);
      assert(html.includes('inline-flex flex-col align-top mr-1'), 'Must contain atomic column tokens');

      // Check all unique chords resolve in DB for guitar and ukulele
      for (const chord of song.uniqueChords) {
        const gPos = await lookupChordPositions(chord, 'guitar', true);
        const uPos = await lookupChordPositions(chord, 'ukulele', true);
        assert(gPos !== null && gPos.length > 0, `Chord ${chord} in ${filename} must resolve on Guitar`);
        assert(uPos !== null && uPos.length > 0, `Chord ${chord} in ${filename} must resolve on Ukulele`);
      }
    }
  });
}
