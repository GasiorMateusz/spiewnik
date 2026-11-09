import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { TestRunner, assert } from './helpers/test_framework';
import { SongViewer } from '../src/components/SongViewer';
import { transposeChord, formatNote, formatChordForDisplay } from '../src/lib/chordNotation';
import { useWakeLock } from '../src/hooks/useWakeLock';
import { HookHarness, MockWakeLockSentinel, MockDocument, setGlobalProperty } from './helpers/hook_harness';
import type { ParsedSong } from '../src/types';

// Standard test song fixture for Tier 1 testing
const MOCK_SONG: ParsedSong = {
  slug: 'test-song',
  title: 'Testowa Piosenka M2',
  artist: 'Zespół Testowy M2',
  key: 'C',
  tags: ['rock', 'test'],
  rawLyrics: '',
  lines: [
    {
      type: 'section-header',
      header: 'Zwrotka 1',
    },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'C', lyrics: 'To ' },
        { chord: 'G', lyrics: 'jest ' },
        { chord: 'Am', lyrics: 'test ' },
        { chord: 'F', lyrics: 'wersu' },
      ],
    },
    {
      type: 'empty',
    },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'H', lyrics: 'Polska ' },
        { chord: 'Bb', lyrics: 'notacja' },
      ],
    },
  ],
  uniqueChords: ['C', 'G', 'Am', 'F', 'H', 'Bb'],
};

export async function runStage2Tier1Tests(runner: TestRunner) {
  runner.setTier('Stage 2 — Tier 1: Feature Coverage (F31–F45)');

  // F31: Dedicated SongViewer Component
  await runner.test('F31: Dedicated SongViewer Component Rendering & Props', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        instrument: 'guitar',
        theme: 'dark',
        initialTranspose: 0,
        initialPolishNotation: true,
        initialFontSizeOffset: 0,
      })
    );

    assert(html.includes('Testowa Piosenka M2'), 'Song title must be rendered in header');
    assert(html.includes('Zespół Testowy M2'), 'Song artist must be rendered in header');
    assert(html.includes('Tonacja:'), 'Performer toolbar must contain transposition section');
    assert(html.includes('Notacja: PL (H)'), 'Performer toolbar must contain notation toggle');
    assert(html.includes('A-') && html.includes('A+'), 'Performer toolbar must contain font scaling buttons');
    assert(html.includes('Akordy:'), 'Quick chord chips section must be present');
    assert(html.includes('<dialog'), 'SongViewer must mount native <dialog> chord modal');
  });

  // F32: Atomic Chord-Syllable Flex Wrap
  await runner.test('F32: Atomic Chord-Syllable Flex Wrap (inline-flex flex-col align-top mr-1)', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
      })
    );

    assert(
      html.includes('class="inline-flex flex-col align-top mr-1"'),
      'Must wrap chord and lyric segment in inline-flex flex-col align-top mr-1'
    );
    assert(
      html.includes('class="flex flex-wrap items-end w-full"'),
      'Lines must use flex flex-wrap items-end w-full'
    );
    assert(
      html.includes('overflow-x-hidden'),
      'Song container must specify overflow-x-hidden to prevent page-level clipping'
    );
  });

  // F33: Performer Font Scaling Controls
  await runner.test('F33: Performer Font Scaling Controls (A- / A+ buttons and [-4px, +12px] bounds)', () => {
    // Base render (offset 0)
    const html0 = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialFontSizeOffset: 0,
      })
    );
    assert(html0.includes('title="Zmniejsz czcionkę"') && html0.includes('aria-label="Zmniejsz czcionkę"'));
    assert(html0.includes('title="Zwiększ czcionkę"') && html0.includes('aria-label="Zwiększ czcionkę"'));
    assert(html0.includes('>0</span>'), 'Font offset pill must display 0');

    // Lower bound render (offset -4)
    const htmlLower = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialFontSizeOffset: -4,
      })
    );
    assert(htmlLower.includes('disabled=""') && htmlLower.includes('title="Zmniejsz czcionkę"'), 'A- must be disabled at -4');
    assert(htmlLower.includes('>-4</span>'), 'Font offset pill must display -4');

    // Upper bound render (offset +12)
    const htmlUpper = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialFontSizeOffset: 12,
      })
    );
    assert(htmlUpper.includes('disabled=""') && htmlUpper.includes('title="Zwiększ czcionkę"'), 'A+ must be disabled at +12');
    assert(htmlUpper.includes('>+12</span>'), 'Font offset pill must display +12');
  });

  // F34: Dynamic Proportional Typography & Vertical Alignment Preservation
  await runner.test('F34: Dynamic Proportional Typography & Vertical Alignment (no fixed h-4 clipping)', () => {
    for (let offset = -4; offset <= 12; offset += 2) {
      const lyricFontSize = 16 + offset;
      const chordFontSize = Math.max(10, 12 + Math.round(offset * 0.65));
      const chordRowHeight = Math.max(16, 16 + Math.round(offset * 0.75));

      assert(lyricFontSize >= 12 && lyricFontSize <= 28, `Lyric size out of bounds for offset ${offset}`);
      assert(chordFontSize >= 10 && chordFontSize <= 20, `Chord size out of bounds for offset ${offset}`);
      assert(chordRowHeight >= 16 && chordRowHeight <= 25, `Chord row height out of bounds for offset ${offset}`);
      assert(
        chordRowHeight >= chordFontSize,
        `chordRowHeight (${chordRowHeight}px) must be >= chordFontSize (${chordFontSize}px) at offset ${offset}`
      );

      const html = renderToStaticMarkup(
        React.createElement(SongViewer, {
          song: MOCK_SONG,
          initialFontSizeOffset: offset,
        })
      );
      assert(
        html.includes(`font-size:${chordFontSize}px;height:${chordRowHeight}px`),
        `Chord button style must match font-size:${chordFontSize}px;height:${chordRowHeight}px`
      );
      assert(
        html.includes(`font-size:${lyricFontSize}px;line-height:1.35`),
        `Lyric style must match font-size:${lyricFontSize}px;line-height:1.35`
      );
    }
  });

  // F35: Distraction-Free Back Button
  await runner.test('F35: Distraction-Free Back Button (ArrowLeftIcon, aria-label, onBack / #/)', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
      })
    );
    assert(html.includes('aria-label="Wróć do katalogu"'), 'Back button must have Polish aria-label');
    assert(html.includes('title="Wróć do katalogu"'), 'Back button must have Polish title');
    assert(html.includes('<svg') && html.includes('stroke="currentColor"'), 'Back button must render SVG icon');

    const songViewerSrc = fs.readFileSync('src/components/SongViewer.tsx', 'utf8');
    assert(songViewerSrc.includes('if (onBack)'), 'handleBack must check for onBack callback prop');
    assert(songViewerSrc.includes("window.location.hash = '#/'"), 'handleBack must fallback to setting hash to #/');
  });

  // F36: Semitone Transposition Controls
  await runner.test('F36: Semitone Transposition Controls (-1/+1 semitone buttons and offset display)', () => {
    const html0 = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialTranspose: 0,
      })
    );
    assert(html0.includes('title="Obniż o półton"') && html0.includes('>-1</button>'));
    assert(html0.includes('title="Podwyższ o półton"') && html0.includes('>+1</button>'));
    assert(html0.includes('>0</span>') && html0.includes('w-12 text-center'));

    const htmlPlus = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialTranspose: 3,
      })
    );
    assert(htmlPlus.includes('>+3</span>'), 'Offset must show +3 for positive transpose');

    const htmlMinus = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialTranspose: -2,
      })
    );
    assert(htmlMinus.includes('>-2</span>'), 'Offset must show -2 for negative transpose');
  });

  // F37: One-Tap Transposition Reset
  await runner.test('F37: One-Tap Transposition Reset (conditional display & Polish tooltip)', () => {
    // When transpose is 0, Reset button must NOT be rendered
    const html0 = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialTranspose: 0,
      })
    );
    assert(!html0.includes('>Reset</button>'), 'Reset button must not render when transpose === 0');

    // When transpose !== 0, Reset button MUST be rendered
    const htmlShifted = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialTranspose: 1,
      })
    );
    assert(htmlShifted.includes('>Reset</button>'), 'Reset button must render when transpose !== 0');
    assert(
      htmlShifted.includes('title="Przywróć oryginalną tonację"'),
      'Reset button must have Polish tooltip "Przywróć oryginalną tonację"'
    );
    assert(
      htmlShifted.includes('aria-label="Przywróć oryginalną tonację"'),
      'Reset button must have Polish aria-label'
    );
  });

  // F38: Sharp Enharmonic Preference
  await runner.test('F38: Sharp Enharmonic Preference (# accidentals across all transpositions)', () => {
    const flatInputs = ['Db', 'Eb', 'Gb', 'Ab', 'Bb'];
    const expectedSharps = ['C#', 'D#', 'F#', 'G#', 'A#'];

    flatInputs.forEach((flat, idx) => {
      // In International mode:
      const sharp = transposeChord(flat, 0, false);
      assert.strictEqual(sharp, expectedSharps[idx], `${flat} must format with sharp enharmonic as ${expectedSharps[idx]}`);
    });

    // Transpose C through 12 semitones in INT mode: all accidentals must be sharp (#)
    for (let s = 0; s < 12; s++) {
      const transposed = transposeChord('C', s, false);
      assert(!transposed.includes('b'), `Transposed C + ${s} (${transposed}) must not contain flat 'b'`);
    }

    // Slash chord bass notes must also default to sharp enharmonics
    assert.strictEqual(transposeChord('C/Eb', 0, false), 'C/D#');
    assert.strictEqual(transposeChord('F/Ab', 0, false), 'F/G#');
  });

  // F39: Standard Minor Chord Formatting
  await runner.test('F39: Standard Minor Chord Formatting (uppercase root + lowercase m)', () => {
    const testCases: [string, string][] = [
      ['am', 'Am'],
      ['amin', 'Am'],
      ['Amin', 'Am'],
      ['Am', 'Am'],
      ['c#min', 'C#m'],
      ['c#m', 'C#m'],
      ['c#min7', 'C#m7'],
      ['dm', 'Dm'],
      ['dmin', 'Dm'],
      ['em', 'Em'],
      ['emin', 'Em'],
      ['f#min', 'F#m'],
      ['gm', 'Gm'],
      ['Hm', 'Hm'],
      ['hmin', 'Hm'],
    ];

    for (const [input, expected] of testCases) {
      const formatted = transposeChord(input, 0, true);
      assert.strictEqual(formatted, expected, `Minor chord "${input}" must format to "${expected}", got "${formatted}"`);
    }
  });

  // F40: Polish Notation Toggle
  await runner.test('F40: Polish Notation Toggle (PL H/B <-> INT B/Bb)', () => {
    // 1. In PL mode:
    const htmlPl = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialPolishNotation: true,
      })
    );
    assert(htmlPl.includes('Notacja: PL (H)'), 'Toggle label must show PL (H)');
    assert(htmlPl.includes('>H</button>'), 'B natural in PL mode must render as H');
    assert(htmlPl.includes('>B</button>'), 'B-flat in PL mode must render as B');

    // 2. In INT mode:
    const htmlInt = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialPolishNotation: false,
      })
    );
    assert(htmlInt.includes('Notacja: INT (B)'), 'Toggle label must show INT (B)');
    assert(htmlInt.includes('>B</button>'), 'B natural in INT mode must render as B');
    assert(htmlInt.includes('>A#</button>') || htmlInt.includes('>Bb</button>'), 'B-flat in INT mode must render as A# or Bb');
  });

  // F41: Screen Wake Lock Acquisition
  await runner.test('F41: Screen Wake Lock Acquisition (useWakeLock request screen lock)', async () => {
    let requestedType = '';
    const mockDoc = new MockDocument();
    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: async (type: string) => {
          requestedType = type;
          return new MockWakeLockSentinel();
        },
      },
    });

    try {
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(harness.result.isSupported, true, 'isSupported must be true');
      assert.strictEqual(harness.result.isActive, true, 'isActive must be true upon acquisition');
      assert.strictEqual(requestedType, 'screen', 'Wake lock must request "screen" lock type');
      assert.strictEqual(harness.result.error, null, 'Error must be null on success');

      harness.unmount();
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // F42: Wake Lock Foreground Re-acquisition
  await runner.test('F42: Wake Lock Foreground Re-acquisition on visibilitychange', async () => {
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
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(requestCount, 1, 'Initial request count must be 1');
      assert.strictEqual(harness.result.isActive, true);

      // Tab goes to background (hidden) -> external browser release
      currentSentinel!.simulateExternalRelease();
      mockDoc.triggerVisibilityChange('hidden');
      await new Promise((r) => setTimeout(r, 10));
      assert.strictEqual(harness.result.isActive, false, 'Must be inactive in background');

      // Tab returns to foreground (visible) -> hook re-acquires lock
      mockDoc.triggerVisibilityChange('visible');
      await new Promise((r) => setTimeout(r, 10));
      assert.strictEqual(requestCount, 2, 'Must re-acquire sentinel when visibilityState returns to visible');
      assert.strictEqual(harness.result.isActive, true, 'isActive must be true again');

      harness.unmount();
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // F43: Wake Lock Clean Release
  await runner.test('F43: Wake Lock Clean Release on unmount / disable', async () => {
    const mockDoc = new MockDocument();
    let sentinel: MockWakeLockSentinel | null = null;

    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: async () => {
          sentinel = new MockWakeLockSentinel();
          return sentinel;
        },
      },
    });

    try {
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 10));

      assert(sentinel !== null && !sentinel.released, 'Sentinel must be active');
      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 1, 'Listener attached');

      // Unmount hook
      harness.unmount();
      assert.strictEqual(sentinel.released, true, 'Sentinel must be released on unmount');
      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 0, 'Listener removed on unmount');
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // F44: Wake Lock Error Degradation
  await runner.test('F44: Wake Lock Error Degradation (unsupported browser & rejection handling)', async () => {
    // 1. Unsupported browser (navigator.wakeLock missing)
    const restoreDoc = setGlobalProperty('document', new MockDocument());
    const restoreNavMissing = setGlobalProperty('navigator', {});
    try {
      const harness = new HookHarness(useWakeLock, true);
      const res = harness.render();
      assert.strictEqual(res.isSupported, false, 'isSupported must be false');
      assert.strictEqual(res.isActive, false, 'isActive must be false');
      assert.strictEqual(res.error, null, 'error must be null');
      harness.unmount();
    } finally {
      restoreNavMissing();
      restoreDoc();
    }

    // 2. Browser permission denial (NotAllowedError)
    const notAllowedErr = new Error('Permission denied');
    notAllowedErr.name = 'NotAllowedError';
    const restoreDoc2 = setGlobalProperty('document', new MockDocument());
    const restoreNavDenial = setGlobalProperty('navigator', {
      wakeLock: {
        request: async () => {
          throw notAllowedErr;
        },
      },
    });
    try {
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 15));
      assert.strictEqual(harness.result.isSupported, true, 'isSupported is true');
      assert.strictEqual(harness.result.isActive, false, 'isActive must be false on rejection');
      assert(harness.result.error !== null, 'error must capture rejection');
      assert.strictEqual(harness.result.error?.name, 'NotAllowedError');
      harness.unmount();
    } finally {
      restoreNavDenial();
      restoreDoc2();
    }
  });

  // F45: App Backward Compatibility
  await runner.test('F45: App Backward Compatibility with Stage 1 contracts', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('<SongViewer'), 'App.tsx must mount <SongViewer /> component');
    assert(appSrc.includes('song.uniqueChords.map'), 'Contract comment or implementation preserved');
    assert(appSrc.includes('inline-flex flex-col align-top mr-1'), 'Contract comment or implementation preserved');
    assert(appSrc.includes('whitespace-pre font-sans'), 'Contract comment or implementation preserved');
    assert(appSrc.includes('instrument={instrument}'), 'App passes active instrument prop');
    assert(appSrc.includes('onInstrumentChange={setInstrument}'), 'App passes onInstrumentChange handler');
  });
}
