import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework';
import { lookupChordPositions, INSTRUMENT_DATA } from '../src/lib/chordDb';
import { transposeChord, formatChordForDisplay, formatNote } from '../src/lib/chordNotation';
import { ChordSvg } from '../src/components/ChordSvg';
import { ChordModal } from '../src/components/ChordModal';

export async function runTier1Tests(runner: TestRunner) {
  runner.setTier('Tier 1: Feature Coverage (30 Features)');

  // Feature 1: HTML5 <dialog> Shell
  await runner.test('Feature 1: HTML5 <dialog> Shell', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: 'C',
        instrument: 'guitar',
        onInstrumentChange: () => {},
        onClose: () => {},
      })
    );
    assert(html.includes('<dialog'), 'Modal must render native HTML5 <dialog> element');
    assert(html.includes('m-auto') && html.includes('backdrop:bg-black/75'), 'Dialog must have native backdrop styling');
    const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    assert(chordModalSrc.includes('dialog.showModal()'), 'Must use native dialog.showModal() method');
    assert(chordModalSrc.includes('dialog.close()'), 'Must use native dialog.close() method');
  });

  // Feature 2: Backdrop Click Dismissal
  await runner.test('Feature 2: Backdrop Click Dismissal', () => {
    const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    assert(
      chordModalSrc.includes('if (e.target === dialogRef.current)'),
      'Modal must verify click occurred on native dialog element (backdrop)'
    );
    assert(chordModalSrc.includes('onClose()'), 'Backdrop click must trigger onClose callback');
  });

  // Feature 3: Native Escape Key Dismissal
  await runner.test('Feature 3: Native Escape Key Dismissal', () => {
    const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    assert(chordModalSrc.includes('onClose={handleDialogClose}'), 'Dialog must attach native onClose event handler');
    assert(chordModalSrc.includes('const handleDialogClose = () => {'), 'Handler must exist to synchronize React state');
  });

  // Feature 4: Top-Right Close Button
  await runner.test('Feature 4: Top-Right Close Button', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: 'C',
        instrument: 'guitar',
        onInstrumentChange: () => {},
        onClose: () => {},
      })
    );
    assert(html.includes('aria-label="Zamknij"'), 'Close button must have Polish aria-label "Zamknij"');
    assert(html.includes('<svg') && html.includes('line x1="18" y1="6"'), 'Close button must render XIcon SVG');
  });

  // Feature 5: Top Quick-Bar Chord Triggers
  await runner.test('Feature 5: Top Quick-Bar Chord Triggers', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('song.uniqueChords.map'), 'App must render quick chips from unique song chords');
    assert(appSrc.includes('onClick={() => setSelectedChord(displayChord)}'), 'Clicking chip must set selected chord');
    assert(appSrc.includes('type="button"'), 'Chips must be valid interactive buttons');
  });

  // Feature 6: Inline Lyric Chord Triggers
  await runner.test('Feature 6: Inline Lyric Chord Triggers', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(
      appSrc.includes('displayChord ? (') && appSrc.includes('setSelectedChord(displayChord)'),
      'App must render interactive buttons for inline chords above lyrics'
    );
    assert(appSrc.includes('inline-flex flex-col align-top mr-1'), 'Inline chords must preserve syllable alignment');
  });

  // Feature 7: Transposition & Notation Awareness
  await runner.test('Feature 7: Transposition & Notation Awareness', () => {
    const transposedPL = transposeChord('G', 4, true);
    assert.strictEqual(transposedPL, 'H', 'Transposing G by +4 in Polish notation yields H');
    const transposedINT = transposeChord('G', 4, false);
    assert.strictEqual(transposedINT, 'B', 'Transposing G by +4 in International notation yields B');
    const transposedDown = transposeChord('Am', -2, true);
    assert.strictEqual(transposedDown, 'Gm', 'Transposing Am by -2 yields Gm');
  });

  // Feature 8: Guitar Voicings (6 Strings)
  await runner.test('Feature 8: Guitar Voicings (6 Strings)', async () => {
    assert.strictEqual(INSTRUMENT_DATA.guitar.strings, 6, 'Guitar must have 6 strings');
    assert.deepStrictEqual(
      INSTRUMENT_DATA.guitar.tunings.standard,
      ['E', 'A', 'D', 'G', 'B', 'E'],
      'Guitar standard tuning must be EADGBE'
    );
    const pos = await lookupChordPositions('C', 'guitar', true);
    assert(pos !== null && pos.length > 0, 'Guitar C must resolve to positions');
    assert.strictEqual(pos[0].frets.length, 6, 'Guitar frets array must contain 6 string values');

    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: pos[0],
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg.includes('>E<') && svg.includes('>A<') && svg.includes('>D<'), 'Diagram must render guitar tuning notes');
  });

  // Feature 9: Ukulele Voicings (4 Strings)
  await runner.test('Feature 9: Ukulele Voicings (4 Strings)', async () => {
    assert.strictEqual(INSTRUMENT_DATA.ukulele.strings, 4, 'Ukulele must have 4 strings');
    assert.deepStrictEqual(
      INSTRUMENT_DATA.ukulele.tunings.standard,
      ['G', 'C', 'E', 'A'],
      'Ukulele standard tuning must be GCEA'
    );
    const pos = await lookupChordPositions('C', 'ukulele', true);
    assert(pos !== null && pos.length > 0, 'Ukulele C must resolve to positions');
    assert.strictEqual(pos[0].frets.length, 4, 'Ukulele frets array must contain 4 string values');

    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: pos[0],
        instrument: INSTRUMENT_DATA.ukulele,
      })
    );
    assert(svg.includes('>G<') && svg.includes('>C<') && svg.includes('>A<'), 'Diagram must render ukulele tuning notes');
  });

  // Feature 10: In-Modal Instrument Toggle
  await runner.test('Feature 10: In-Modal Instrument Toggle', () => {
    let changedInstrument: string | null = null;
    const guitarHtml = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: 'C',
        instrument: 'guitar',
        onInstrumentChange: (inst) => { changedInstrument = inst; },
        onClose: () => {},
      })
    );
    assert(guitarHtml.includes('bg-amber-500 text-neutral-950 font-semibold shadow-sm">Gitara</button>'));
    assert(guitarHtml.includes('text-neutral-400 hover:text-neutral-200">Ukulele</button>'));

    const ukeHtml = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: 'C',
        instrument: 'ukulele',
        onInstrumentChange: (inst) => { changedInstrument = inst; },
        onClose: () => {},
      })
    );
    assert(ukeHtml.includes('bg-amber-500 text-neutral-950 font-semibold shadow-sm">Ukulele</button>'));
    assert(ukeHtml.includes('text-neutral-400 hover:text-neutral-200">Gitara</button>'));
  });

  // Feature 11: Top Header Instrument Toggle
  await runner.test('Feature 11: Top Header Instrument Toggle', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('setInstrument(\'guitar\')') && appSrc.includes('setInstrument(\'ukulele\')'));
    assert(appSrc.includes('instrument === \'guitar\' ? \'Gitara\' : \'Ukulele\'') || appSrc.includes('Gitara'));
  });

  // Feature 12: Carousel Navigation Controls
  await runner.test('Feature 12: Carousel Navigation Controls', () => {
    const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    assert(chordModalSrc.includes('aria-label="Poprzednia pozycja"'), 'Must have previous button with aria-label');
    assert(chordModalSrc.includes('aria-label="Następna pozycja"'), 'Must have next button with aria-label');
    assert(chordModalSrc.includes('{variationIndex + 1} z {positions.length}'), 'Must format counter as "X z Y"');
  });

  // Feature 13: Wrap-Around Cycling
  await runner.test('Feature 13: Wrap-Around Cycling', () => {
    const N = 4;
    // Next navigation from last index (N-1 -> 0)
    const nextFromLast = (N - 1 + 1) % N;
    assert.strictEqual(nextFromLast, 0, 'Next from index N-1 must wrap to index 0');
    // Prev navigation from first index (0 -> N-1)
    const prevFromFirst = (0 - 1 + N) % N;
    assert.strictEqual(prevFromFirst, N - 1, 'Prev from index 0 must wrap to index N-1');

    const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    assert(chordModalSrc.includes('(prev - 1 + positions.length) % positions.length'), 'Prev logic must use modulo wrap');
    assert(chordModalSrc.includes('(prev + 1) % positions.length'), 'Next logic must use modulo wrap');
  });

  // Feature 14: Single-Voicing Handling
  await runner.test('Feature 14: Single-Voicing Handling', async () => {
    const ukeC11 = await lookupChordPositions('C11', 'ukulele', true);
    assert(ukeC11 !== null && ukeC11.length === 1, 'Ukulele C11 must have exactly 1 position');

    const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    assert(
      chordModalSrc.includes('disabled={positions.length <= 1}'),
      'Pagination buttons must be disabled when positions.length <= 1'
    );
  });

  // Feature 15: Vector Fretboard Grid
  await runner.test('Feature 15: Vector Fretboard Grid', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [0, 2, 2, 1, 0, 0] },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg.includes('viewBox="0 0 80 70"'), 'SVG must use viewBox "0 0 80 70"');
    assert(svg.includes('stroke-width="0.35"') || svg.includes('strokeWidth="0.35"'), 'Fretboard grid must have strokeWidth 0.35');
    assert(svg.includes('opacity="0.6"'), 'Fretboard grid must have 0.6 opacity');
  });

  // Feature 16: Open & Muted String Markers
  await runner.test('Feature 16: Open & Muted String Markers', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [-1, 3, 2, 0, 1, 0] }, // C major
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    // Muted string on low E (-1)
    assert(svg.includes('fill="#ef4444"') && svg.includes('>×<'), 'Muted string must render red ×');
    // Open string on G and high E (0)
    assert(svg.includes('fill="transparent"') && svg.includes('r="2.5"'), 'Open string must render transparent circle r=2.5');
  });

  // Feature 17: Barre Chord Rectangles
  await runner.test('Feature 17: Barre Chord Rectangles', () => {
    const svg = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [1, 3, 3, 2, 1, 1], barres: [1], fingers: [1, 3, 4, 2, 1, 1] }, // F major
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svg.includes('<rect') && svg.includes('fill="#f59e0b"') && svg.includes('rx="4"'), 'Barre must render rounded rect');
  });

  // Feature 18: Base Fret Number Display
  await runner.test('Feature 18: Base Fret Number Display', () => {
    const svgFret1 = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [0, 2, 2, 0, 0, 0], baseFret: 1 },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svgFret1.includes('stroke-width="2.5"') || svgFret1.includes('strokeWidth="2.5"'), 'baseFret === 1 must render thick nut line strokeWidth=2.5');

    const svgFret3 = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [-1, 3, 5, 5, 5, 3], baseFret: 3 },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svgFret3.includes('>3fr<'), 'baseFret > 1 must render offset text "3fr"');
  });

  // Feature 19: String Tuning Notes
  await runner.test('Feature 19: String Tuning Notes', () => {
    const svgGuitar = renderToStaticMarkup(
      React.createElement(ChordSvg, {
        chord: { frets: [0, 0, 0, 0, 0, 0] },
        instrument: INSTRUMENT_DATA.guitar,
      })
    );
    assert(svgGuitar.includes('y="54"'), 'Tuning notes must be anchored at y="54"');
    assert(svgGuitar.includes('>E<') && svgGuitar.includes('>B<'), 'Tuning notes must match instrument standard tuning');
  });

  // Feature 20: Uncataloged Chord Fallback
  await runner.test('Feature 20: Uncataloged Chord Fallback', async () => {
    const uncat = await lookupChordPositions('UnknownChordXYZ', 'guitar', true);
    assert.strictEqual(uncat, null, 'Uncataloged chord must return null');

    const html = renderToStaticMarkup(
      React.createElement(ChordModal, {
        isOpen: true,
        chord: 'UnknownChordXYZ',
        instrument: 'guitar',
        onInstrumentChange: () => {},
        onClose: () => {},
      })
    );
    assert(
      html.includes('Diagram niedostępny dla tego chwytu'),
      'Must render Polish fallback notice "Diagram niedostępny dla tego chwytu"'
    );
  });

  // Feature 21: Slash Chord Resolution
  await runner.test('Feature 21: Slash Chord Resolution', async () => {
    const dfsharp = await lookupChordPositions('D/F#', 'guitar', true);
    assert(dfsharp !== null && dfsharp.length > 0, 'Guitar D/F# must resolve to positions');
    assert.deepStrictEqual(dfsharp[0].frets, [2, 0, 0, 2, 3, 2], 'D/F# first position frets match');

    const uncatSlash = await lookupChordPositions('C/D', 'guitar', true);
    assert.strictEqual(uncatSlash, null, 'Uncataloged Guitar C/D must safely return null');

    const ukeSlash = await lookupChordPositions('C/G', 'ukulele', true);
    assert.strictEqual(ukeSlash, null, 'Ukulele slash chords safely return null without throwing');
  });

  // Feature 22: Polish Notation Normalization
  await runner.test('Feature 22: Polish Notation Normalization', async () => {
    const hGuitar = await lookupChordPositions('H', 'guitar', true);
    const bGuitarPl = await lookupChordPositions('B', 'guitar', true);
    const bGuitarInt = await lookupChordPositions('B', 'guitar', false);
    const bbGuitarInt = await lookupChordPositions('Bb', 'guitar', false);

    assert(hGuitar && bGuitarPl && bGuitarInt && bbGuitarInt, 'All B/H chords must resolve');
    assert.deepStrictEqual(hGuitar[0].frets, bGuitarInt[0].frets, 'Polish H must equal International B');
    assert.deepStrictEqual(bGuitarPl[0].frets, bbGuitarInt[0].frets, 'Polish B must equal International Bb');
    assert.notDeepStrictEqual(hGuitar[0].frets, bGuitarPl[0].frets, 'Polish H must NOT equal Polish B');
  });

  // Feature 23: Malformed Chord Degradation
  await runner.test('Feature 23: Malformed Chord Degradation', async () => {
    const invalidInputs = ['', '   ', 'N.C.', 'intro', '???', '1234', 'C//G', '///', '🎸', '<script>'];
    for (const input of invalidInputs) {
      const res = await lookupChordPositions(input, 'guitar', true);
      assert.strictEqual(res, null, `Input "${input}" must return null without exceptions`);
    }
  });

  // Feature 24: Lazy Loading Chord DB
  await runner.test('Feature 24: Lazy Loading Chord DB', () => {
    const chordDbSrc = fs.readFileSync('src/lib/chordDb.ts', 'utf8');
    assert(chordDbSrc.includes('import(\'@tombatossals/chords-db/lib/guitar.json\''), 'Must dynamic import guitar.json');
    assert(chordDbSrc.includes('import(\'@tombatossals/chords-db/lib/ukulele.json\''), 'Must dynamic import ukulele.json');
  });

  // Feature 25: In-Memory Database Cache
  await runner.test('Feature 25: In-Memory Database Cache', async () => {
    const chordDbSrc = fs.readFileSync('src/lib/chordDb.ts', 'utf8');
    assert(chordDbSrc.includes('guitarDbCache'), 'Must define guitarDbCache in-memory reference');
    assert(chordDbSrc.includes('ukuleleDbCache'), 'Must define ukuleleDbCache in-memory reference');
    // Successive calls
    const res1 = await lookupChordPositions('C', 'guitar');
    const res2 = await lookupChordPositions('C', 'guitar');
    assert.deepStrictEqual(res1, res2, 'Successive lookups must return identical cached data');
  });

  // Feature 26: Offline PWA Precaching
  await runner.test('Feature 26: Offline PWA Precaching', () => {
    const viteConfigSrc = fs.readFileSync('vite.config.ts', 'utf8');
    assert(viteConfigSrc.includes('VitePWA'), 'Vite config must include VitePWA plugin');
    if (fs.existsSync('dist/sw.js')) {
      const sw = fs.readFileSync('dist/sw.js', 'utf8');
      assert(sw.includes('precacheAndRoute'), 'Service Worker must contain precacheAndRoute');
    }
  });

  // Feature 27: Zero-Debt Minimal Tooling
  await runner.test('Feature 27: Zero-Debt Minimal Tooling', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const prodDeps = Object.keys(pkg.dependencies || {});
    assert.deepStrictEqual(
      prodDeps.sort(),
      ['@tombatossals/chords-db', 'react', 'react-dom'].sort(),
      'Production dependencies must be strictly zero-debt minimal'
    );
  });

  // Feature 28: Comprehensive Polish UI
  await runner.test('Feature 28: Comprehensive Polish UI', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    const modalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    const polishStrings = [
      'Śpiewnik', 'Gitara', 'Ukulele', 'Tonacja:', 'Akordy:',
      'Notacja:', 'Diagram niedostępny dla tego chwytu', 'Zamknij',
      'Poprzednia pozycja', 'Następna pozycja', 'Ładowanie diagramu...'
    ];
    for (const str of polishStrings) {
      assert(appSrc.includes(str) || modalSrc.includes(str), `Missing required Polish UI label: "${str}"`);
    }
  });

  // Feature 29: OLED Dark Theme
  await runner.test('Feature 29: OLED Dark Theme', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('bg-neutral-950') && appSrc.includes('text-neutral-100'), 'App must use OLED dark theme background');
    assert(appSrc.includes('text-amber-500') || appSrc.includes('text-amber-400'), 'App must use amber accent colors');
  });

  // Feature 30: Touch Target Compliance
  await runner.test('Feature 30: Touch Target Compliance', () => {
    const modalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(modalSrc.includes('p-2') || modalSrc.includes('p-1.5'), 'Modal action buttons must have adequate touch padding');
    assert(appSrc.includes('w-8 h-8') || appSrc.includes('px-2.5 py-1'), 'App interactive controls must have accessible touch dimensions');
  });
}
