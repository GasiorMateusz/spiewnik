import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestRunner, assert } from './helpers/test_framework';
import { AutoScroll } from '../src/components/AutoScroll';
import { SongViewer } from '../src/components/SongViewer';
import { AutoScrollController, MockScrollEnvironment } from './helpers/autoscroll_harness';
import { setGlobalProperty } from './helpers/hook_harness';
import type { ParsedSong } from '../src/types';

export async function runStage3Tier2Tests(runner: TestRunner) {
  runner.setTier('Stage 3 — Tier 2: Boundary & Corner Cases');

  // B01: Minimum speed (15 px/s) fractional accumulation precision
  await runner.test('B01: Minimum speed (15 px/s) sub-pixel precision over 10 virtual seconds (150px)', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 15 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline

      // Step 600 frames at 60 FPS (16.6667ms each = 10,000ms total)
      for (let i = 0; i < 600; i++) {
        ctrl.stepFrame(16.6667);
      }

      // Expected: 15 px/s * 10s = 150 pixels.
      // Tolerance: ±1px due to 16.6667ms rounding
      assert(
        Math.abs(ctrl.env.scrollY - 150) <= 1,
        `Expected scrollY close to 150px, got ${ctrl.env.scrollY}`
      );
    } finally {
      ctrl.destroy();
    }
  });

  // B02: Maximum speed (120 px/s) at 60 FPS and 120 FPS
  await runner.test('B02: Maximum speed (120 px/s) high-velocity accuracy at 60 FPS & 120 FPS', () => {
    // 60 FPS test: 2.0px per frame
    const ctrl60 = new AutoScrollController({ initialSpeed: 120 });
    try {
      ctrl60.clickPlayPause();
      ctrl60.stepFrame(0);
      for (let i = 0; i < 60; i++) {
        ctrl60.stepFrame(16.6667);
      }
      assert(
        Math.abs(ctrl60.env.scrollY - 120) <= 1,
        `60 FPS: expected ~120px, got ${ctrl60.env.scrollY}`
      );
    } finally {
      ctrl60.destroy();
    }

    // 120 FPS test (8.3333ms per frame): 1.0px per frame
    const ctrl120 = new AutoScrollController({ initialSpeed: 120 });
    try {
      ctrl120.clickPlayPause();
      ctrl120.stepFrame(0);
      for (let i = 0; i < 120; i++) {
        ctrl120.stepFrame(8.3333);
      }
      assert(
        Math.abs(ctrl120.env.scrollY - 120) <= 1,
        `120 FPS: expected ~120px, got ${ctrl120.env.scrollY}`
      );
    } finally {
      ctrl120.destroy();
    }
  });

  // B03: Velocity Control Boundary Clamping (< 5 and > 120)
  await runner.test('B03: Velocity Control Boundary Clamping strictly enforces [5, 120] range', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 14 });
    try {
      // Below min: 0, -50, 4
      ctrl.changeSpeed(0);
      assert.strictEqual(ctrl.currentSpeed, 5, '0 clamped to 5');
      ctrl.changeSpeed(-50);
      assert.strictEqual(ctrl.currentSpeed, 5, '-50 clamped to 5');
      ctrl.changeSpeed(4);
      assert.strictEqual(ctrl.currentSpeed, 5, '4 clamped to 5');

      // Exact min 5 preserved
      ctrl.changeSpeed(5);
      assert.strictEqual(ctrl.currentSpeed, 5, '5 preserved as min');

      // Above max: 121, 500, 9999
      ctrl.changeSpeed(121);
      assert.strictEqual(ctrl.currentSpeed, 120, '121 clamped to 120');
      ctrl.changeSpeed(500);
      assert.strictEqual(ctrl.currentSpeed, 120, '500 clamped to 120');

      // Initial prop clamping
      const ctrlLow = new AutoScrollController({ initialSpeed: 2 });
      assert.strictEqual(ctrlLow.currentSpeed, 5, 'Initial 2 clamped to 5');
      ctrlLow.destroy();

      const ctrlExact5 = new AutoScrollController({ initialSpeed: 5 });
      assert.strictEqual(ctrlExact5.currentSpeed, 5, 'Initial 5 preserved');
      ctrlExact5.destroy();

      const ctrlHigh = new AutoScrollController({ initialSpeed: 300 });
      assert.strictEqual(ctrlHigh.currentSpeed, 120, 'Initial 300 clamped to 120');
      ctrlHigh.destroy();
    } finally {
      ctrl.destroy();
    }
  });

  // B04: Bottom Detection Boundary Invariant (tolerance y + vh >= h - 2)
  await runner.test('B04: Bottom Detection Boundary Invariant across distance thresholds (3px, 2px, 1px, 0px)', () => {
    const maxScroll = 1000;

    // Case A: 3px distance remaining -> continues scrolling
    const ctrlA = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrlA.env.scrollHeight = 1800;
      ctrlA.env.innerHeight = 800;
      ctrlA.env.scrollY = 997; // 1000 - 997 = 3px remaining
      ctrlA.clickPlayPause();
      ctrlA.stepFrame(0);
      assert.strictEqual(ctrlA.currentState, 'scrolling', '3px remaining must continue scrolling');
    } finally {
      ctrlA.destroy();
    }

    // Case B: 2px distance reached during active scroll -> cleanly stops
    const ctrlB = new AutoScrollController({ initialSpeed: 60 });
    try {
      ctrlB.env.scrollHeight = 1800;
      ctrlB.env.innerHeight = 800;
      ctrlB.env.scrollY = 995; // 5px remaining (does not trigger at-bottom reset on click)
      ctrlB.clickPlayPause();
      ctrlB.stepFrame(0); // baseline
      ctrlB.stepFrame(50); // 60 * 0.05 = 3px scroll -> scrollY reaches 998 (2px remaining)
      assert.strictEqual(ctrlB.currentState, 'idle', '2px remaining reached during scroll triggers clean stop (<= 2px tolerance)');
      assert(!ctrlB.env.hasPendingRaf(), 'RAF stopped');
    } finally {
      ctrlB.destroy();
    }

    // Case C: 1px distance reached during active scroll -> cleanly stops
    const ctrlC = new AutoScrollController({ initialSpeed: 60 });
    try {
      ctrlC.env.scrollHeight = 1800;
      ctrlC.env.innerHeight = 800;
      ctrlC.env.scrollY = 995; // 5px remaining
      ctrlC.clickPlayPause();
      ctrlC.stepFrame(0);
      ctrlC.stepFrame(66.6667); // 60 * 0.0667 = 4px scroll -> scrollY reaches 999 (1px remaining)
      assert.strictEqual(ctrlC.currentState, 'idle', '1px remaining reached during scroll triggers clean stop');
    } finally {
      ctrlC.destroy();
    }

    // Case D: 0px remaining (exact bottom) -> starts reset-to-top behavior
    const ctrlD = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrlD.env.scrollHeight = 1800;
      ctrlD.env.innerHeight = 800;
      ctrlD.env.scrollY = 1000;
      ctrlD.clickPlayPause();
      // Start when at bottom resets to 0
      assert.strictEqual(ctrlD.env.scrollY, 0, 'At bottom: resets to top');
    } finally {
      ctrlD.destroy();
    }
  });

  // B05: Short Song / No-Scroll Scenario (h <= vh)
  await runner.test('B05: Short song scenario (h <= vh) stops immediately without loop lock', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 600;
      ctrl.env.innerHeight = 800; // content fits completely on screen (maxScrollTop = 0)
      ctrl.env.scrollY = 0;

      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline
      ctrl.stepFrame(16.6667); // active frame evaluates distance <= 2

      // Distance remaining is 0 <= 2, must stop immediately
      assert.strictEqual(ctrl.currentState, 'idle', 'Must transition to idle immediately for short song');
      assert(!ctrl.env.hasPendingRaf(), 'No active RAF loop');
    } finally {
      ctrl.destroy();
    }
  });

  // B06: Short song barely exceeding viewport by 2px (h - vh = 2px)
  await runner.test('B06: Short song barely exceeding viewport (h - vh = 2px) terminates cleanly', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 802;
      ctrl.env.innerHeight = 800; // maxScrollTop = 2px
      ctrl.env.scrollY = 0;

      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline
      ctrl.stepFrame(16.6667); // active frame evaluates distance <= 2

      assert.strictEqual(ctrl.currentState, 'idle', 'Distance remaining 2px <= 2 triggers clean stop');
    } finally {
      ctrl.destroy();
    }
  });

  // B07: Start At Bottom Smooth Reset Behavior & Safety Timeout
  await runner.test('B07: Start At Bottom Smooth Reset Behavior and safety timeout arbitration', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 40 });
    try {
      ctrl.env.scrollHeight = 2000;
      ctrl.env.innerHeight = 800; // maxScrollTop = 1200
      ctrl.env.scrollY = 1200; // at bottom

      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.env.scrollY, 0, 'Immediately called scrollToTop');
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Frame 1: resetting to top is active, scrollY is 0 (<= 5px threshold)
      ctrl.stepFrame(16.6667);
      // Next frames scroll down
      ctrl.stepFrame(100); // 40 * 0.1 = 4px
      assert.strictEqual(ctrl.env.scrollY, 4, 'Started scrolling down from top');
    } finally {
      ctrl.destroy();
    }
  });

  // B08: Background Tab / Clock Freeze Clamping (dt > 100ms)
  await runner.test('B08: Extreme tab freeze (10,000ms jump) clamped strictly to 100ms delta', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 50 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline

      // Simulate 10-second tab suspension
      ctrl.stepFrame(10000);
      // Capped to 100ms: 50 * 0.1 = 5px
      assert.strictEqual(ctrl.env.scrollY, 5, 'Scroll jump capped to exactly 5px');
    } finally {
      ctrl.destroy();
    }
  });

  // B09: System Clock Negative Jump / Backward Drift (dt < 0)
  await runner.test('B09: System Clock Negative Drift (dt < 0) safely handled with dt = 0', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline at t=1000

      // Clock moves backwards to t=900
      ctrl.env.currentTime = 900;
      ctrl.stepFrame(0);

      assert.strictEqual(ctrl.env.scrollY, 0, 'No backward scrolling occurred');
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Loop remains healthy');
    } finally {
      ctrl.destroy();
    }
  });

  // B10: Tab Visibility Return Timestamp Reset
  await runner.test('B10: Tab Visibility Return resets baseline timestamp on document visibilitychange', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 60 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline at t=1000

      // Tab hidden, 8000ms passes
      ctrl.env.visibilityState = 'hidden';
      ctrl.env.currentTime += 8000;

      // Tab becomes visible again
      ctrl.env.triggerVisibilityChange('visible');

      // Next tick must reset baseline and not scroll 60 * 8 = 480px!
      ctrl.stepFrame(0); // resets lastTime
      ctrl.stepFrame(16.6667); // 1 normal frame: ~1px

      assert(ctrl.env.scrollY <= 2, `Expected scrollY <= 2px, got ${ctrl.env.scrollY}`);
    } finally {
      ctrl.destroy();
    }
  });

  // B11: Rapid Touch Flick Debounce Invariant
  await runner.test('B11: Rapid sequence of 5 flick gestures debounces cleanly without timer leaks', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // 5 rapid touch moves in 200ms
      for (let i = 0; i < 5; i++) {
        ctrl.env.currentTime += 40;
        ctrl.touchOutside('touchmove');
      }

      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Advance 2900ms from last touch (total 3100ms from start)
      ctrl.advanceTime(2900);
      assert.strictEqual(ctrl.currentState, 'interrupted', 'Must still be interrupted');

      // Advance remaining 100ms (reaches 3000ms after 5th touch)
      ctrl.advanceTime(100);
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Resumes after 3000ms inactivity');
    } finally {
      ctrl.destroy();
    }
  });

  // B12: Immediate Pause After Start (< 1 frame)
  await runner.test('B12: Immediate Pause after Start (< 1 frame) cancels pending RAF without scroll', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause(); // start
      assert.strictEqual(ctrl.currentState, 'scrolling');

      ctrl.clickPlayPause(); // immediate pause before stepFrame
      assert.strictEqual(ctrl.currentState, 'idle');
      assert(!ctrl.env.hasPendingRaf(), 'Pending RAF cancelled');
      assert.strictEqual(ctrl.env.scrollY, 0, 'No scroll occurred');
    } finally {
      ctrl.destroy();
    }
  });

  // B13: Interruption at near-bottom and manual scroll to end
  await runner.test('B13: Interruption near bottom and manual scroll to end transitions to idle on resume', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 1800;
      ctrl.env.innerHeight = 800; // maxScrollTop = 1000
      ctrl.env.scrollY = 995; // 5px from bottom

      ctrl.clickPlayPause();
      ctrl.touchOutside('touchstart'); // interrupt
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Musician manually scrolls remaining 5px to bottom (scrollY = 1000)
      ctrl.env.scrollY = 1000;

      // 3s expires: executeAutoResume detects bottom and transitions to idle
      ctrl.advanceTime(3000);
      assert.strictEqual(ctrl.currentState, 'idle', 'Transitions to idle because bottom was reached');
      assert(!ctrl.env.hasPendingRaf(), 'No RAF loop running');
    } finally {
      ctrl.destroy();
    }
  });

  // B14: Container Element Disconnection / Null Scroll Target
  await runner.test('B14: Container Element Disconnection / Null Scroll Target safely degrades', () => {
    const ref = { current: null };
    const ctrl = new AutoScrollController({
      containerRef: ref,
      scrollTarget: null,
    });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(16.6667);
      // Falls back to window gracefully without crashing
      assert.strictEqual(ctrl.currentState, 'scrolling');
    } finally {
      ctrl.destroy();
    }
  });

  // B15: SSR Safety (Headless / Window Undefined)
  await runner.test('B15: SSR safety: rendering AutoScroll when window and document are undefined', () => {
    const restoreWin = setGlobalProperty('window', undefined);
    const restoreDoc = setGlobalProperty('document', undefined);
    try {
      const html = renderToStaticMarkup(React.createElement(AutoScroll, { initialSpeed: 45 }));
      assert(html.includes('Panel automatycznego przewijania'), 'Must render valid static HTML in SSR');
      assert(html.includes('45 px/s'), 'Must render initial speed in SSR');
    } finally {
      restoreWin();
      restoreDoc();
    }
  });

  // B16: Uncataloged / Empty Song Rendering in SongViewer with AutoScroll
  await runner.test('B16: Empty song rendering in SongViewer mounts AutoScroll cleanly', () => {
    const emptySong: ParsedSong = {
      slug: 'empty-song',
      title: 'Pusta Piosenka',
      artist: 'Nieznany',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [],
      uniqueChords: [],
    };

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song: emptySong }));
    assert(html.includes('Pusta Piosenka'), 'Renders title');
    assert(html.includes('Panel automatycznego przewijania'), 'Mounts AutoScroll dock');
    assert(html.includes('Wróć na górę'), 'Contains Jump-to-top button');
  });
}
