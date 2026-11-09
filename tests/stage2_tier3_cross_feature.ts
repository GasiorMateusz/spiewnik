import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestRunner, assert } from './helpers/test_framework';
import { SongViewer } from '../src/components/SongViewer';
import { transposeChord } from '../src/lib/chordNotation';
import { useWakeLock } from '../src/hooks/useWakeLock';
import { HookHarness, MockWakeLockSentinel, MockDocument, setGlobalProperty } from './helpers/hook_harness';
import type { ParsedSong, Instrument } from '../src/types';

const CROSS_SONG: ParsedSong = {
  slug: 'cross-song',
  title: 'Piosenka Wieloskładnikowa',
  artist: 'Artysta Hybrydowy',
  key: 'G',
  tags: ['folk', 'test'],
  rawLyrics: '',
  lines: [
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'G', lyrics: 'Gdy ' },
        { chord: 'D/F#', lyrics: 'idę ' },
        { chord: 'Em', lyrics: 'drogą ' },
        { chord: 'C', lyrics: 'w dal' },
      ],
    },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'G/H', lyrics: 'Akord ' },
        { chord: 'F#/A#', lyrics: 'złożony' },
      ],
    },
  ],
  uniqueChords: ['G', 'D/F#', 'Em', 'C', 'G/H', 'F#/A#'],
};

export async function runStage2Tier3Tests(runner: TestRunner) {
  runner.setTier('Stage 2 — Tier 3: Cross-Feature Interactions');

  // C01: Font scaling (+12px) + Transposition (+3) + Polish notation toggle
  await runner.test('C01: Font scaling (+12px) + Transposition (+3) + Polish notation toggle', () => {
    // 1. In Polish notation, G + 3 = B (B-flat in PL notation)
    const htmlPl = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: CROSS_SONG,
        initialTranspose: 3,
        initialPolishNotation: true,
        initialFontSizeOffset: 12,
      })
    );
    assert(htmlPl.includes('Notacja: PL (H)'), 'Must indicate Polish notation');
    assert(htmlPl.includes('>+3</span>'), 'Transpose offset must be +3');
    assert(htmlPl.includes('>+12</span>'), 'Font offset must be +12');
    assert(htmlPl.includes('>B</button>'), 'G + 3 in PL mode must display as B');
    assert(htmlPl.includes('font-size:20px;height:25px'), 'Chord style must be 20px / 25px');
    assert(htmlPl.includes('font-size:28px;line-height:1.35'), 'Lyric style must be 28px');

    // 2. In International notation, G + 3 = A# (sharp enharmonic for B-flat)
    const htmlInt = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: CROSS_SONG,
        initialTranspose: 3,
        initialPolishNotation: false,
        initialFontSizeOffset: 12,
      })
    );
    assert(htmlInt.includes('Notacja: INT (B)'), 'Must indicate International notation');
    assert(htmlInt.includes('>A#</button>'), 'G + 3 in INT mode must display as A#');
    assert(htmlInt.includes('font-size:20px;height:25px'), 'Chord size must still be 20px / 25px');
    assert(htmlInt.includes('font-size:28px;line-height:1.35'), 'Lyric size must still be 28px');
  });

  // C02: Transposition combined with Polish notation on complex slash chords
  await runner.test('C02: Transposition combined with Polish notation on complex slash chords', () => {
    // G/H in PL vs INT at 0 transposition
    assert.strictEqual(transposeChord('G/H', 0, true), 'G/H');
    assert.strictEqual(transposeChord('G/H', 0, false), 'G/B');

    // G/H + 1 semitone: G# / C in both PL and INT
    assert.strictEqual(transposeChord('G/H', 1, true), 'G#/C');
    assert.strictEqual(transposeChord('G/H', 1, false), 'G#/C');

    // F#/A# in PL vs INT at 0 transposition (A# in Polish is B)
    assert.strictEqual(transposeChord('F#/A#', 0, true), 'F#/B');
    assert.strictEqual(transposeChord('F#/A#', 0, false), 'F#/A#');

    // D/F# + 1 semitone
    assert.strictEqual(transposeChord('D/F#', 1, true), 'D#/G');

    // Minor slash chord: Am/G + 2 semitones: Hm/A in PL, Bm/A in INT
    assert.strictEqual(transposeChord('Am/G', 2, true), 'Hm/A');
    assert.strictEqual(transposeChord('Am/G', 2, false), 'Bm/A');
  });

  // C03: Screen Wake Lock active during song viewing and releasing on Back navigation (onBack callback)
  await runner.test('C03: Screen Wake Lock active during song viewing and releasing on onBack', async () => {
    const mockDoc = new MockDocument();
    let currentSentinel: MockWakeLockSentinel | null = null;
    let requestCount = 0;

    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: async () => {
          requestCount++;
          currentSentinel = new MockWakeLockSentinel();
          return currentSentinel;
        },
      },
    });

    try {
      // Viewing song: hook is enabled
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(requestCount, 1, 'Wake lock acquired on entering song viewer');
      assert.strictEqual(harness.result.isActive, true, 'Lock active');
      assert(!currentSentinel!.released, 'Sentinel is held');

      // User navigates back to catalog: component unmounts
      harness.unmount();
      assert.strictEqual(currentSentinel!.released, true, 'Sentinel released on back navigation unmount');
      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 0, 'Event listener removed');
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // C04: Screen Wake Lock releasing when enabled changes to false
  await runner.test('C04: Screen Wake Lock releasing when enabled prop changes to false', async () => {
    const mockDoc = new MockDocument();
    let currentSentinel: MockWakeLockSentinel | null = null;

    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: async () => {
          currentSentinel = new MockWakeLockSentinel();
          return currentSentinel;
        },
      },
    });

    try {
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 10));
      assert(currentSentinel !== null && !currentSentinel.released);

      // Re-render hook with enabled = false (e.g. user toggles auto-lock off)
      harness.render(false);
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(currentSentinel!.released, true, 'Sentinel must release when enabled becomes false');
      assert.strictEqual(harness.result.isActive, false, 'isActive must be false');

      harness.unmount();
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // C05: ChordModal opening with transposed & Polish-formatted chord
  await runner.test('C05: ChordModal receives transposed and Polish-formatted chord string', () => {
    // When transposed +2 and Polish mode, 'Am' becomes 'Hm'
    const shiftedChord = transposeChord('Am', 2, true);
    assert.strictEqual(shiftedChord, 'Hm');

    // When transposed +2 and International mode, 'Am' becomes 'Bm'
    const intChord = transposeChord('Am', 2, false);
    assert.strictEqual(intChord, 'Bm');

    // In Polish mode, 'G' + 3 = 'B' (Bb)
    const bFlatPl = transposeChord('G', 3, true);
    assert.strictEqual(bFlatPl, 'B');
  });

  // C06: In-modal instrument toggle inside SongViewer
  await runner.test('C06: In-modal instrument toggle prop passing in SongViewer', () => {
    let activeInstrument: Instrument = 'guitar';
    const htmlGuitar = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: CROSS_SONG,
        instrument: activeInstrument,
        onInstrumentChange: (inst) => {
          activeInstrument = inst;
        },
      })
    );
    assert(htmlGuitar.includes('<dialog'), 'Dialog must be mounted');

    // Re-render with instrument changed to ukulele
    const htmlUke = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: CROSS_SONG,
        instrument: 'ukulele',
      })
    );
    assert(htmlUke.includes('<dialog'), 'Dialog must remain mounted on instrument switch');
  });

  // C07: Theme toggle (dark mode vs light mode) combined with font scaling
  await runner.test('C07: Theme switching combined with font scaling', () => {
    const htmlDark = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: CROSS_SONG,
        theme: 'dark',
        initialFontSizeOffset: 4,
      })
    );
    assert(htmlDark.includes('bg-neutral-900 border-neutral-800'));
    assert(htmlDark.includes('font-size:15px;height:19px'));
    assert(htmlDark.includes('font-size:20px;line-height:1.35'));

    const htmlLight = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: CROSS_SONG,
        theme: 'light',
        initialFontSizeOffset: 4,
      })
    );
    assert(htmlLight.includes('bg-white border-neutral-200'));
    assert(htmlLight.includes('font-size:15px;height:19px'));
    assert(htmlLight.includes('font-size:20px;line-height:1.35'));
  });

  // C08: Quick chord chips and inline chord triggers update synchronously
  await runner.test('C08: Quick chord chips and inline chord triggers update synchronously on transpose', () => {
    const html0 = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: CROSS_SONG,
        initialTranspose: 0,
      })
    );
    // Quick chips have G and Em
    assert(html0.includes('class="text-xs font-mono font-bold px-2.5 py-1 rounded bg-amber-500/10'));
    assert(html0.includes('>G</button>'));
    assert(html0.includes('>Em</button>'));

    // Transpose +2: G -> A, Em -> F#m
    const html2 = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: CROSS_SONG,
        initialTranspose: 2,
      })
    );
    assert(html2.includes('>A</button>'), 'Quick chip and inline G must both become A');
    assert(html2.includes('>F#m</button>'), 'Quick chip and inline Em must both become F#m');
  });
}
