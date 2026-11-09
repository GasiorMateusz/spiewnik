import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestRunner, assert } from './helpers/test_framework';
import { AutoScroll } from '../src/components/AutoScroll';
import { SongViewer } from '../src/components/SongViewer';
import { useWakeLock } from '../src/hooks/useWakeLock';
import { AutoScrollController, MockScrollEnvironment } from './helpers/autoscroll_harness';
import { HookHarness, MockWakeLockSentinel, MockDocument, setGlobalProperty } from './helpers/hook_harness';
import type { ParsedSong } from '../src/types';

const MOCK_SONG: ParsedSong = {
  slug: 'cross-feature-song',
  title: 'Piosenka Wieloskładnikowa Stage 3',
  artist: 'Artysta Cross-Feature',
  key: 'C',
  tags: ['cross'],
  rawLyrics: '',
  lines: [
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'C', lyrics: 'Tekst ' },
        { chord: 'G', lyrics: 'wieloskładnikowy ' },
        { chord: 'Am', lyrics: 'z ' },
        { chord: 'F', lyrics: 'akordami' },
      ],
    },
  ],
  uniqueChords: ['C', 'G', 'Am', 'F'],
};

export async function runStage3Tier3Tests(runner: TestRunner) {
  runner.setTier('Stage 3 — Tier 3: Cross-Feature Interactions');

  // C01: Dock control event isolation during active scrolling
  await runner.test('C01: Dock control event isolation during active scrolling (slider interaction)', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause(); // start scrolling
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // User touches inside the floating dock to change speed
      ctrl.touchInsideDock('touchstart');
      ctrl.changeSpeed(75);
      ctrl.touchInsideDock('pointerdown');

      // State MUST remain scrolling!
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Dock touch must not trigger interruption');
      assert.strictEqual(ctrl.currentSpeed, 75);

      // Now touch outside dock
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted', 'Outside touch triggers interruption');
    } finally {
      ctrl.destroy();
    }
  });

  // C02: Jump-to-top during interrupted 3s countdown
  await runner.test('C02: Jump-to-top during interrupted 3s countdown cancels timer and resets to idle', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollY = 350;
      ctrl.clickPlayPause(); // start
      ctrl.touchOutside('touchstart'); // interrupt
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Musician clicks Jump-to-top during the countdown
      ctrl.clickJumpToTop();
      assert.strictEqual(ctrl.currentState, 'idle', 'Must transition to idle');
      assert.strictEqual(ctrl.env.scrollY, 0, 'Scroll position reset to 0');
      assert(!ctrl.env.hasPendingRaf(), 'RAF stopped');

      // Advance 5000ms: must NOT auto-resume
      ctrl.advanceTime(5000);
      assert.strictEqual(ctrl.currentState, 'idle', 'Auto-resume was cancelled');
    } finally {
      ctrl.destroy();
    }
  });

  // C03: Explicit pause ("Zatrzymaj" button) during interrupted 3s countdown
  await runner.test('C03: Explicit pause ("Zatrzymaj" button) cancels auto-resume timer and enters idle permanently', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause(); // start
      ctrl.touchOutside('touchstart'); // interrupt
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Click "Zatrzymaj"
      ctrl.clickExplicitStop();
      assert.strictEqual(ctrl.currentState, 'idle', 'Transitioned to idle');

      // Advance 5000ms: must stay idle
      ctrl.advanceTime(5000);
      assert.strictEqual(ctrl.currentState, 'idle');
      assert(!ctrl.env.hasPendingRaf());
    } finally {
      ctrl.destroy();
    }
  });

  // C04: Position re-synchronization on manual scroll during interruption
  await runner.test('C04: Position re-synchronization on manual scroll during interruption', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 40 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrame(100); // 40 * 0.1 = 4px
      assert.strictEqual(ctrl.env.scrollY, 4);

      // Interrupt
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Musician manually scrolls 300px down to line at y=304
      ctrl.env.scrollY = 304;

      // Auto-resume after 3s
      ctrl.advanceTime(3000);
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Next frame: scrolls from 304 onwards smoothly
      ctrl.stepFrame(0);
      ctrl.stepFrame(100); // +4px
      assert.strictEqual(ctrl.env.scrollY, 308, 'Continued smoothly from 304 -> 308');
    } finally {
      ctrl.destroy();
    }
  });

  // C05: SongViewer theme toggle combined with AutoScroll dock
  await runner.test('C05: SongViewer theme toggle (dark <-> light) combined with AutoScroll dock', () => {
    // Dark render
    const darkHtml = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        theme: 'dark',
        initialScrollSpeed: 45,
      })
    );
    assert(darkHtml.includes('bg-neutral-900/95'), 'AutoScroll in dark mode');
    assert(darkHtml.includes('45 px/s'), 'AutoScroll initial speed 45 px/s');

    // Light render
    const lightHtml = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        theme: 'light',
        initialScrollSpeed: 45,
      })
    );
    assert(lightHtml.includes('bg-white/95'), 'AutoScroll in light mode');
    assert(lightHtml.includes('45 px/s'), 'AutoScroll speed preserved');
  });

  // C06: SongViewer initialScrollSpeed and onScrollSpeedChange forwarding
  await runner.test('C06: SongViewer forwards initialScrollSpeed and onScrollSpeedChange to AutoScroll', () => {
    let changedSpeed = 0;
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialScrollSpeed: 55,
        onScrollSpeedChange: (s) => {
          changedSpeed = s;
        },
      })
    );
    assert(html.includes('55 px/s'), 'Must render with initialScrollSpeed 55');
  });

  // C07: Screen Wake Lock concurrency with AutoScroll lifecycle
  await runner.test('C07: Screen Wake Lock concurrency with AutoScroll (preserves sentinel during scroll)', async () => {
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

    const env = new MockScrollEnvironment();
    env.install();

    try {
      const wakeLockHarness = new HookHarness(useWakeLock, true);
      wakeLockHarness.render();
      await Promise.resolve();
      await Promise.resolve();

      const ctrl = new AutoScrollController({ initialSpeed: 30 });
      ctrl.clickPlayPause(); // start scrolling
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Wake lock acquired in viewer
      assert(currentSentinel !== null, 'Wake lock acquired');
      assert.strictEqual(currentSentinel.released, false, 'Sentinel held');

      // Touch interruption
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');
      assert.strictEqual(currentSentinel.released, false, 'Sentinel still held during interruption');

      // Auto-resume
      ctrl.advanceTime(3000);
      assert.strictEqual(ctrl.currentState, 'scrolling');
      assert.strictEqual(currentSentinel.released, false, 'Sentinel still held during resume');

      ctrl.destroy();
      wakeLockHarness.unmount();
      assert.strictEqual(currentSentinel.released, true, 'Sentinel cleanly released on unmount');
    } finally {
      env.uninstall();
      restoreNav();
      restoreDoc();
    }
  });

  // C08: Velocity slider modification during interrupted state
  await runner.test('C08: Velocity slider modification during interrupted state applies upon auto-resume', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause();
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Musician decides current speed 30 is too slow, raises to 80 while paused
      ctrl.changeSpeed(80);
      assert.strictEqual(ctrl.currentSpeed, 80);

      // 3s completes and resumes
      ctrl.advanceTime(3000);
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Step 100ms: at 80 px/s, scrolls 8px!
      ctrl.stepFrame(0);
      ctrl.stepFrame(100);
      assert.strictEqual(ctrl.env.scrollY, 8, 'Advanced by 8px at new 80 px/s rate');
    } finally {
      ctrl.destroy();
    }
  });

  // C09: Transposition & notation toggle in SongViewer with AutoScroll mounted
  await runner.test('C09: Transposition and notation toggle in SongViewer coexists with AutoScroll', () => {
    const htmlTransposed = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_SONG,
        initialTranspose: 2,
        initialPolishNotation: true,
        initialScrollSpeed: 40,
      })
    );
    // Transposed chords D -> E
    assert(htmlTransposed.includes('>D</button>') || htmlTransposed.includes('>E</button>'));
    assert(htmlTransposed.includes('40 px/s'));
    assert(htmlTransposed.includes('Panel automatycznego przewijania'));
    assert(htmlTransposed.includes('Wróć na górę'));
  });
}
