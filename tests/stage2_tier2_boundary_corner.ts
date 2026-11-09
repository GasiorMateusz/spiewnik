import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestRunner, assert } from './helpers/test_framework';
import { SongViewer } from '../src/components/SongViewer';
import { transposeChord, formatChordForDisplay, isChordToken, isChordLine } from '../src/lib/chordNotation';
import { useWakeLock } from '../src/hooks/useWakeLock';
import { HookHarness, MockWakeLockSentinel, MockDocument, setGlobalProperty } from './helpers/hook_harness';
import type { ParsedSong } from '../src/types';

export async function runStage2Tier2Tests(runner: TestRunner) {
  runner.setTier('Stage 2 — Tier 2: Boundary & Corner Cases');

  // B01: Font scaling lower boundary clamping (-4px)
  await runner.test('B01: Font scaling lower boundary clamping (-4px) & disabled state', () => {
    const song: ParsedSong = {
      slug: 'b01-song',
      title: 'B01 Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [{ chord: 'C', lyrics: 'tekst' }],
        },
      ],
      uniqueChords: ['C'],
    };

    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song,
        initialFontSizeOffset: -4,
      })
    );

    assert(html.includes('>-4</span>'), 'Offset indicator must display -4');
    assert(html.includes('disabled=""') && html.includes('title="Zmniejsz czcionkę"'), 'A- button must be disabled at -4');
    assert(!html.includes('disabled="" title="Zwiększ czcionkę"'), 'A+ button must NOT be disabled at -4');
    assert(html.includes('font-size:10px;height:16px'), 'Chord font size must clamp to minimum 10px / height 16px');
    assert(html.includes('font-size:12px;line-height:1.35'), 'Lyric font size must clamp to minimum 12px');
  });

  // B02: Font scaling upper boundary clamping (+12px)
  await runner.test('B02: Font scaling upper boundary clamping (+12px) & disabled state', () => {
    const song: ParsedSong = {
      slug: 'b02-song',
      title: 'B02 Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [{ chord: 'C', lyrics: 'tekst' }],
        },
      ],
      uniqueChords: ['C'],
    };

    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song,
        initialFontSizeOffset: 12,
      })
    );

    assert(html.includes('>+12</span>'), 'Offset indicator must display +12');
    assert(html.includes('disabled=""') && html.includes('title="Zwiększ czcionkę"'), 'A+ button must be disabled at +12');
    assert(!html.includes('disabled="" title="Zmniejsz czcionkę"'), 'A- button must NOT be disabled at +12');
    assert(html.includes('font-size:20px;height:25px'), 'Chord font size must clamp to maximum 20px / height 25px');
    assert(html.includes('font-size:28px;line-height:1.35'), 'Lyric font size must clamp to maximum 28px');
  });

  // B03: Extreme initial font scaling offsets safely clamp
  await runner.test('B03: Extreme initial font scaling offsets (-10px and +20px) safely clamp disabled states', () => {
    const song: ParsedSong = {
      slug: 'b03-song',
      title: 'B03 Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [{ type: 'chords-and-lyrics', segments: [{ chord: 'C', lyrics: 'tekst' }] }],
      uniqueChords: ['C'],
    };

    const htmlNeg = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song,
        initialFontSizeOffset: -10,
      })
    );
    assert(htmlNeg.includes('disabled=""') && htmlNeg.includes('title="Zmniejsz czcionkę"'), 'A- must be disabled for <= -4');

    const htmlPos = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song,
        initialFontSizeOffset: 20,
      })
    );
    assert(htmlPos.includes('disabled=""') && htmlPos.includes('title="Zwiększ czcionkę"'), 'A+ must be disabled for >= 12');
  });

  // B04: Transposition bounds +24 semitones (two octaves up)
  await runner.test('B04: Transposition bounds +24 semitones preserves octave pitch', () => {
    const chromaticPitches = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const pitch of chromaticPitches) {
      const transposed = transposeChord(pitch, 24, false);
      assert.strictEqual(transposed, pitch, `+24 semitone shift of ${pitch} must be ${pitch}`);
    }
  });

  // B05: Transposition bounds -24 semitones (two octaves down)
  await runner.test('B05: Transposition bounds -24 semitones preserves octave pitch', () => {
    const chromaticPitches = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const pitch of chromaticPitches) {
      const transposed = transposeChord(pitch, -24, false);
      assert.strictEqual(transposed, pitch, `-24 semitone shift of ${pitch} must be ${pitch}`);
    }
  });

  // B06: Transposition chromatic round-trip across all semitone offsets [-24..+24]
  await runner.test('B06: Transposition chromatic round-trip across all semitone offsets [-24..+24]', () => {
    const chromaticPitches = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const pitch of chromaticPitches) {
      for (let s = -24; s <= 24; s++) {
        const shifted = transposeChord(pitch, s, false);
        const restored = transposeChord(shifted, -s, false);
        assert.strictEqual(restored, pitch, `Round trip shift ${s} then ${-s} for ${pitch} must restore original`);
      }
    }
  });

  // B07: Isolated chords without lyrics render \u00A0
  await runner.test('B07: Isolated chords without lyrics render \\u00A0 non-breaking space', () => {
    const song: ParsedSong = {
      slug: 'b07-song',
      title: 'B07 Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [{ chord: 'Am', lyrics: '' }],
        },
      ],
      uniqueChords: ['Am'],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    assert(html.includes('>Am</button>'), 'Chord button must render');
    assert(
      html.includes('&#x00A0;') || html.includes('\u00A0'),
      'Empty lyrics must render non-breaking space \\u00A0 to maintain column structure'
    );
  });

  // B08: Pure chord intro line (multiple chords, zero lyrics)
  await runner.test('B08: Pure chord intro line renders all chord buttons and column spacers', () => {
    const song: ParsedSong = {
      slug: 'b08-song',
      title: 'B08 Intro Test',
      artist: 'Tester',
      key: 'G',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            { chord: 'G', lyrics: '' },
            { chord: 'D', lyrics: '' },
            { chord: 'Em', lyrics: '' },
            { chord: 'C', lyrics: '' },
          ],
        },
      ],
      uniqueChords: ['G', 'D', 'Em', 'C'],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    assert(html.includes('>G</button>'));
    assert(html.includes('>D</button>'));
    assert(html.includes('>Em</button>'));
    assert(html.includes('>C</button>'));

    const spacers = html.match(/class="text-neutral-200 whitespace-pre font-sans">&#x00A0;<\/span>/g) ||
                    html.match(/class="text-neutral-200 whitespace-pre font-sans">\u00A0<\/span>/g);
    assert.strictEqual(spacers?.length, 4, 'Must render exactly 4 spacer spans for 4 intro chords');
  });

  // B09: Chord-less lyrics render \u00A0 placeholder in chord slot
  await runner.test('B09: Chord-less lyrics render \\u00A0 placeholder in top chord row', () => {
    const song: ParsedSong = {
      slug: 'b09-song',
      title: 'B09 Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [{ chord: '', lyrics: 'Wers bez akordów' }],
        },
      ],
      uniqueChords: [],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    assert(html.includes('Wers bez akordów'), 'Lyrics must be present');
    assert(
      html.includes('pointer-events-none leading-none flex items-center">&#x00A0;</span>') ||
      html.includes('pointer-events-none leading-none flex items-center">\u00A0</span>'),
      'Must render \\u00A0 placeholder in chord slot to maintain vertical alignment'
    );
  });

  // B10: Empty lines (type: 'empty')
  await runner.test('B10: Empty lines render spacing element (h-4)', () => {
    const song: ParsedSong = {
      slug: 'b10-song',
      title: 'B10 Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        { type: 'empty' },
        { type: 'empty' },
      ],
      uniqueChords: [],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    const emptyDivs = html.match(/<div class="h-4"><\/div>/g);
    assert.strictEqual(emptyDivs?.length, 2, 'Must render exactly 2 h-4 spacers for empty lines');
  });

  // B11: Section headers (type: 'section-header')
  await runner.test('B11: Section headers render [header] with text-amber-500/80 font-bold', () => {
    const song: ParsedSong = {
      slug: 'b11-song',
      title: 'B11 Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        { type: 'section-header', header: 'Refren' },
        { type: 'section-header', header: 'Solo' },
      ],
      uniqueChords: [],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    assert(html.includes('[Refren]'), 'Must render [Refren]');
    assert(html.includes('[Solo]'), 'Must render [Solo]');
    assert(html.includes('text-amber-500/80 font-bold font-sans text-xs pt-2'));
  });

  // B12: Unsupported browser wake lock degradation (SSR / navigator undefined)
  await runner.test('B12: Wake lock gracefully degrades when navigator is undefined (SSR)', async () => {
    const restoreNav = setGlobalProperty('navigator', undefined);
    const restoreDoc = setGlobalProperty('document', undefined);

    try {
      const harness = new HookHarness(useWakeLock, true);
      const res = harness.render();

      assert.strictEqual(res.isSupported, false, 'isSupported must be false in SSR');
      assert.strictEqual(res.isActive, false);
      assert.strictEqual(res.error, null);

      await res.request();
      await res.release();
      harness.unmount();
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // B13: Wake lock handles rejection (NotAllowedError / battery saver)
  await runner.test('B13: Wake lock handles rejection (NotAllowedError / battery saver denial)', async () => {
    const notAllowedErr = new Error('Wake Lock permission denied');
    notAllowedErr.name = 'NotAllowedError';

    const mockDoc = new MockDocument();
    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: async () => {
          throw notAllowedErr;
        },
      },
    });

    try {
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(harness.result.isActive, false, 'isActive must remain false on rejection');
      assert(harness.result.error !== null, 'error must be captured');
      assert.strictEqual(harness.result.error?.name, 'NotAllowedError');

      harness.unmount();
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // B14: Component unmount while wakeLock request() is in-flight releases sentinel cleanly
  await runner.test('B14: Component unmount while wakeLock request() is in-flight releases acquired sentinel cleanly', async () => {
    const mockDoc = new MockDocument();
    let acquiredSentinel: MockWakeLockSentinel | null = null;
    let resolveRequest: (s: MockWakeLockSentinel) => void;

    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: () => {
          return new Promise<MockWakeLockSentinel>((resolve) => {
            resolveRequest = resolve;
          });
        },
      },
    });

    try {
      const harness = new HookHarness(useWakeLock, true);
      harness.render();

      // Hook unmounts while request is awaiting
      harness.unmount();

      // Now resolve the in-flight promise
      acquiredSentinel = new MockWakeLockSentinel();
      resolveRequest!(acquiredSentinel);
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(
        acquiredSentinel.released,
        true,
        'Sentinel acquired after unmount must be immediately released'
      );
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // B15: Rapid visibilitychange toggles do not duplicate sentinels or leak listeners
  await runner.test('B15: Rapid visibilitychange toggles do not duplicate sentinels or leak listeners', async () => {
    const mockDoc = new MockDocument();
    const activeSentinels: MockWakeLockSentinel[] = [];

    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: async () => {
          const s = new MockWakeLockSentinel();
          activeSentinels.push(s);
          return s;
        },
      },
    });

    try {
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 10));

      // Rapidly toggle visibility 10 times
      for (let i = 0; i < 10; i++) {
        activeSentinels[activeSentinels.length - 1]?.simulateExternalRelease();
        mockDoc.triggerVisibilityChange('hidden');
        mockDoc.triggerVisibilityChange('visible');
      }
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 1, 'Must have exactly 1 visibility listener');

      harness.unmount();
      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 0, 'Must have 0 listeners after unmount');
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // B16: Wake lock when document is hidden initially does not request sentinel
  await runner.test('B16: Wake lock when document is hidden initially does not request sentinel', async () => {
    const mockDoc = new MockDocument();
    mockDoc.visibilityState = 'hidden';
    let requestCalled = false;

    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: async () => {
          requestCalled = true;
          return new MockWakeLockSentinel();
        },
      },
    });

    try {
      const harness = new HookHarness(useWakeLock, true);
      harness.render();
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(requestCalled, false, 'request() must not be called when document is hidden');
      assert.strictEqual(harness.result.isActive, false);

      // Now become visible
      mockDoc.triggerVisibilityChange('visible');
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(requestCalled, true, 'request() must be called when document becomes visible');
      assert.strictEqual(harness.result.isActive, true);

      harness.unmount();
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // B17: Non-chord token and non-musical text degradation in transposeChord
  await runner.test('B17: Non-chord token and non-musical text degradation in transposeChord', () => {
    assert.strictEqual(transposeChord('', 2, true), '');
    assert.strictEqual(transposeChord('   ', 2, true), '   ');
    assert.strictEqual(transposeChord('NonMusical', 2, true), 'NonMusical');
    assert.strictEqual(transposeChord('12345', 2, true), '12345');
    assert.strictEqual(transposeChord('---', 2, true), '---');
  });

  // B18: Chord token and line detection boundary checks
  await runner.test('B18: Chord token and line detection boundary checks', () => {
    assert.strictEqual(isChordToken('C'), true);
    assert.strictEqual(isChordToken('Hm'), true);
    assert.strictEqual(isChordToken('C#m7'), true);
    assert.strictEqual(isChordToken('F#/A#'), true);
    assert.strictEqual(isChordToken('verylongnonchordword'), false);

    assert.strictEqual(isChordLine('C G Am F'), true);
    assert.strictEqual(isChordLine('[Zwrotka 1]'), false);
    assert.strictEqual(isChordLine('To jest zwykly tekst piosenki'), false);
    assert.strictEqual(isChordLine(''), false);
  });
}
