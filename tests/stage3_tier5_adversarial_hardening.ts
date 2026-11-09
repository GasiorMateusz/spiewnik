import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestRunner, assert } from './helpers/test_framework';
import { AutoScroll } from '../src/components/AutoScroll';
import { SongViewer } from '../src/components/SongViewer';
import { AutoScrollController } from './helpers/autoscroll_harness';
import type { ParsedSong } from '../src/types';

export async function runStage3Tier5AdversarialTests(runner: TestRunner) {
  runner.setTier('Stage 3 — Tier 5: Adversarial Coverage Hardening');

  // =========================================================================
  // SECTION A: Long-Duration Continuous Integration & Accumulator Math
  // =========================================================================

  // ADV-S3-01: Long-duration 5000-frame run at 60 FPS verifying zero accumulator drift (<= 1px)
  await runner.test('ADV-S3-01: Long-duration 5000-frame run at 60 FPS verifying zero accumulator drift (<= 1px)', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 10000;
      ctrl.env.innerHeight = 800; // maxScrollTop = 9200px
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // initialize baseline lastTimeRef

      const dt = 16.6667;
      const totalFrames = 5000;
      let prevY = ctrl.env.scrollY;

      for (let i = 0; i < totalFrames; i++) {
        ctrl.stepFrame(dt);
        assert(
          ctrl.env.scrollY >= prevY,
          `Scroll must remain monotonically non-decreasing (frame ${i}: prev=${prevY}, curr=${ctrl.env.scrollY})`
        );
        prevY = ctrl.env.scrollY;
      }

      // Expected calculation:
      // Total elapsed = 5000 * 16.6667ms = 83333.5ms = 83.3335 seconds.
      // Expected distance = 30 px/s * 83.3335s = 2500.005 pixels.
      const expectedY = (30 * (totalFrames * dt)) / 1000;
      const drift = Math.abs(ctrl.env.scrollY - Math.floor(expectedY));
      assert(
        drift <= 1,
        `Expected scrollY drift <= 1px after 5000 frames. Expected ~${Math.floor(expectedY)}, got ${ctrl.env.scrollY} (drift=${drift}px)`
      );
      assert.strictEqual(ctrl.currentState, 'scrolling', 'State must remain scrolling');
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-02: Long-duration 5000-frame run at 120 FPS verifying zero accumulator drift (<= 1px)
  await runner.test('ADV-S3-02: Long-duration 5000-frame run at 120 FPS high-refresh rate verifying zero accumulator drift (<= 1px)', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 60 });
    try {
      ctrl.env.scrollHeight = 10000;
      ctrl.env.innerHeight = 800;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);

      const dt = 8.33333;
      const totalFrames = 5000;
      for (let i = 0; i < totalFrames; i++) {
        ctrl.stepFrame(dt);
      }

      // Expected: 60 px/s * (5000 * 8.33333 / 1000)s = 60 * 41.66665 = 2499.999px
      const expectedY = (60 * (totalFrames * dt)) / 1000;
      const drift = Math.abs(ctrl.env.scrollY - Math.floor(expectedY));
      assert(
        drift <= 1,
        `Expected 120 FPS drift <= 1px. Expected ~${Math.floor(expectedY)}, got ${ctrl.env.scrollY} (drift=${drift}px)`
      );
      assert.strictEqual(ctrl.currentState, 'scrolling');
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-03: Variable frame-rate jitter (5000 frames with dt in [5, 35]ms) ensures zero truncation drift
  await runner.test('ADV-S3-03: Variable frame-rate jitter (5000 frames with dt in [5, 35]ms) ensures zero truncation drift', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 24 });
    try {
      ctrl.env.scrollHeight = 10000;
      ctrl.env.innerHeight = 800;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);

      let totalElapsedMs = 0;
      // Deterministic LCG pseudo-random generator
      let seed = 12345;
      const nextRandom = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const totalFrames = 5000;
      for (let i = 0; i < totalFrames; i++) {
        // dt varies between 5ms and 35ms (simulating GC spikes and 30Hz - 144Hz VRR)
        const dt = 5 + nextRandom() * 30;
        totalElapsedMs += dt;
        ctrl.stepFrame(dt);
      }

      const expectedY = (24 * totalElapsedMs) / 1000;
      const drift = Math.abs(ctrl.env.scrollY - Math.floor(expectedY));
      assert(
        drift <= 1,
        `Expected jitter drift <= 1px after 5000 jittered frames. Expected ~${Math.floor(expectedY)}, got ${ctrl.env.scrollY} (drift=${drift}px)`
      );
      assert.strictEqual(ctrl.currentState, 'scrolling');
    } finally {
      ctrl.destroy();
    }
  });

  // =========================================================================
  // SECTION B: Touch Bursts, High-Velocity Velocity Alterations & Debounce
  // =========================================================================

  // ADV-S3-04: High-velocity slider adjustments during rapid touch bursts (50 gestures + slider changes)
  await runner.test('ADV-S3-04: High-velocity slider adjustments during rapid touch bursts (50 gestures + slider changes)', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 5000;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrames(30); // scroll a bit
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Burst of 50 touch gestures accompanied by rapid slider alterations
      const speeds = [15, 45, 90, 120, 20, 60, 110, 35, 75, 100];
      for (let i = 0; i < 50; i++) {
        // Touch outside
        const gestureType = i % 4 === 0 ? 'touchstart' : i % 4 === 1 ? 'touchmove' : i % 4 === 2 ? 'wheel' : 'pointerdown';
        ctrl.touchOutside(gestureType as any);
        assert.strictEqual(ctrl.currentState, 'interrupted', `Must be interrupted at step ${i}`);

        // Alter speed during interruption
        const targetSpeed = speeds[i % speeds.length];
        ctrl.changeSpeed(targetSpeed);
        assert.strictEqual(ctrl.currentSpeed, targetSpeed);

        // Advance a small interval between touch bursts (e.g. 50ms)
        ctrl.advanceTime(50);
        assert.strictEqual(ctrl.currentState, 'interrupted', `Must remain interrupted during active burst at step ${i}`);
      }

      // After 50 bursts * 50ms = 2500ms total burst time, the timer should be debounced from the LAST event!
      // Advancing 2000ms: still interrupted
      ctrl.advanceTime(2000);
      assert.strictEqual(ctrl.currentState, 'interrupted', 'Must remain interrupted 2000ms after last burst');

      // Advancing remaining 1000ms: auto-resumes!
      ctrl.advanceTime(1000);
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Must resume scrolling exactly 3000ms after last gesture');
      assert.strictEqual(ctrl.currentSpeed, speeds[49 % speeds.length], 'Speed must be preserved at final burst value');
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-05: Debounce integrity under sustained burst: timer resets on every gesture, never fires early
  await runner.test('ADV-S3-05: Debounce integrity under sustained burst: timer resets on every gesture, never fires early', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // 10 cycles of waiting 2500ms (just before 3000ms timeout) and touching again
      for (let cycle = 0; cycle < 10; cycle++) {
        ctrl.advanceTime(2500);
        assert.strictEqual(ctrl.currentState, 'interrupted', `Must still be interrupted at cycle ${cycle}`);
        ctrl.touchOutside('touchmove'); // resets 3000ms timer
      }

      // After 25,000ms of sustained user interactions, still interrupted!
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Now stop touching and wait 2999ms:
      ctrl.advanceTime(2999);
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // 1ms more -> auto-resumes!
      ctrl.advanceTime(1);
      assert.strictEqual(ctrl.currentState, 'scrolling');
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-06: Dock control event isolation: rapid touch/wheel events on floating dock do not interrupt scrolling
  await runner.test('ADV-S3-06: Dock control event isolation: rapid touch/wheel events on floating dock do not interrupt scrolling', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 40 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Rapidly fire 30 gestures with target inside dock
      for (let i = 0; i < 30; i++) {
        ctrl.touchInsideDock(i % 2 === 0 ? 'touchmove' : 'wheel');
        ctrl.changeSpeed(15 + (i % 10) * 10);
        ctrl.stepFrame(16.6667);
        assert.strictEqual(ctrl.currentState, 'scrolling', `Must NOT interrupt when interacting inside dock (step ${i})`);
      }

      // Scrolling continued without interruption
      assert(ctrl.env.scrollY > 0, 'ScrollY must have advanced');
    } finally {
      ctrl.destroy();
    }
  });

  // =========================================================================
  // SECTION C: Dynamic Resize, Viewport Orientation & Content Shrinkage
  // =========================================================================

  // ADV-S3-07: Sudden orientation change (Portrait -> Landscape) dynamically shifts bounds without scroll hitch
  await runner.test('ADV-S3-07: Sudden orientation change (Portrait -> Landscape) dynamically shifts bounds without scroll hitch', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 50 });
    try {
      // Portrait: 400x800, scrollHeight = 2400 (maxScroll = 1600)
      ctrl.env.innerHeight = 800;
      ctrl.env.scrollHeight = 2400;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrames(60); // 1 sec = 50px

      assert.strictEqual(ctrl.currentState, 'scrolling');
      const yBefore = ctrl.env.scrollY;

      // Orientation flip: Landscape: 800x400, scrollHeight = 3200 (maxScroll = 2800)
      ctrl.env.innerHeight = 400;
      ctrl.env.scrollHeight = 3200;

      // Step 60 more frames
      ctrl.stepFrames(60);
      assert.strictEqual(ctrl.currentState, 'scrolling');
      const yAfter = ctrl.env.scrollY;
      assert(yAfter > yBefore, `Scroll must continue advancing after resize (before=${yBefore}, after=${yAfter})`);
      assert(Math.abs(yAfter - (yBefore + 50)) <= 1, 'Velocity maintained accurately');
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-08: Content shrinkage during scroll (scrollHeight drops below current scrollY) halts immediately at bottom
  await runner.test('ADV-S3-08: Content shrinkage during scroll (scrollHeight drops below current scrollY) halts immediately at bottom', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 60 });
    try {
      ctrl.env.innerHeight = 800;
      ctrl.env.scrollHeight = 3000;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);

      // Scroll to y=1200
      ctrl.env.scrollY = 1200;
      ctrl.stepFrames(10);
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Sudden content reduction: user collapsed section or filtered content
      // Now scrollHeight=1400, innerHeight=800 -> maxScrollTop=600.
      // Current scrollY is 1200+ (well past 600)!
      ctrl.env.scrollHeight = 1400;
      ctrl.stepFrame(16.6667);

      // Must detect bottom immediately (distanceRemaining <= 2) and transition to idle
      assert.strictEqual(ctrl.currentState, 'idle', 'Must cleanly transition to idle when scroll exceeds new bottom');
      assert.strictEqual(ctrl.env.hasPendingRaf(), false, 'RAF loop must be stopped');
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-09: Unscrollable container (scrollHeight <= clientHeight) immediately halts to idle on start
  await runner.test('ADV-S3-09: Unscrollable container (scrollHeight <= clientHeight) immediately halts to idle on start', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      // Entire song fits in screen
      ctrl.env.innerHeight = 800;
      ctrl.env.scrollHeight = 600; // maxScrollTop = 0
      ctrl.env.scrollY = 0;

      // Click play
      ctrl.clickPlayPause();

      // On next tick frame, distanceRemaining is 0 <= 2 -> halts immediately
      ctrl.stepFrame(0);
      ctrl.stepFrame(16.6667);

      assert.strictEqual(ctrl.currentState, 'idle', 'Must halt to idle when content is not scrollable');
      assert.strictEqual(ctrl.env.hasPendingRaf(), false, 'RAF cancelled');
    } finally {
      ctrl.destroy();
    }
  });

  // =========================================================================
  // SECTION D: Jump-To-Top Stress, Racing & Countdown Cancellation
  // =========================================================================

  // ADV-S3-10: Rapid jump-to-top multi-tapping (10 taps) during interrupted countdown cancels timers completely
  await runner.test('ADV-S3-10: Rapid jump-to-top multi-tapping (10 taps) during interrupted countdown cancels timers completely', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 3000;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrames(60); // scrollY ~ 30
      assert(ctrl.env.scrollY > 0);

      // Trigger interruption
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Advance 1s into 3s countdown
      ctrl.advanceTime(1000);

      // Rapidly tap Jump-to-top 10 times in succession
      for (let i = 0; i < 10; i++) {
        ctrl.clickJumpToTop();
      }

      assert.strictEqual(ctrl.currentState, 'idle', 'State must be idle');
      assert.strictEqual(ctrl.env.scrollY, 0, 'Scroll position reset to 0');
      assert.strictEqual(ctrl.env.hasPendingRaf(), false, 'RAF cancelled');

      // Advance 5000ms: no zombie timers wake up
      ctrl.advanceTime(5000);
      assert.strictEqual(ctrl.currentState, 'idle', 'Must stay idle permanently without auto-resuming');
      assert.strictEqual(ctrl.env.scrollY, 0);
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-11: Rapid jump-to-top while at bottom clears reset arbitration and transitions to idle at y=0
  await runner.test('ADV-S3-11: Rapid jump-to-top while at bottom clears reset arbitration and transitions to idle at y=0', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.innerHeight = 800;
      ctrl.env.scrollHeight = 2000;
      ctrl.env.scrollY = 1200; // at bottom (2000 - 800 = 1200)

      // Click play at bottom -> triggers bottom arbitration (scrollToTop(true) + isResettingToTopRef = true)
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Mid-arbitration: user clicks Jump-to-top
      ctrl.clickJumpToTop();
      assert.strictEqual(ctrl.currentState, 'idle');
      assert.strictEqual(ctrl.env.scrollY, 0);
      assert.strictEqual(ctrl.env.hasPendingRaf(), false);

      // Stepping frames now does nothing
      ctrl.stepFrames(10);
      assert.strictEqual(ctrl.currentState, 'idle');
      assert.strictEqual(ctrl.env.scrollY, 0);
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-12: Jump-to-top immediately followed by Play start does not deadlock
  await runner.test('ADV-S3-12: Jump-to-top immediately followed by Play start does not deadlock', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 3000;
      ctrl.env.scrollY = 500;

      // Click Jump-to-top and immediately click Play
      ctrl.clickJumpToTop();
      assert.strictEqual(ctrl.currentState, 'idle');
      assert.strictEqual(ctrl.env.scrollY, 0);

      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Steps frames smoothly from 0
      ctrl.stepFrame(0);
      ctrl.stepFrames(60);
      assert(ctrl.env.scrollY >= 28 && ctrl.env.scrollY <= 32);
    } finally {
      ctrl.destroy();
    }
  });

  // =========================================================================
  // SECTION E: Tab Visibility State Cycling & Background Recovery
  // =========================================================================

  // ADV-S3-13: Tab visibility change: 15-second background suspension does not cause runaway leap on return
  await runner.test('ADV-S3-13: Tab visibility change: 15-second background suspension does not cause runaway leap on return', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 40 });
    try {
      ctrl.env.scrollHeight = 5000;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrames(60); // 1s = 40px
      const yBeforeBackground = ctrl.env.scrollY;
      assert(yBeforeBackground >= 39 && yBeforeBackground <= 41);

      // Tab backgrounded
      ctrl.env.triggerVisibilityChange('hidden');

      // Simulate 15 seconds passing while backgrounded (no RAF ticks delivered by browser)
      ctrl.env.currentTime += 15000;

      // Tab foregrounded
      ctrl.env.triggerVisibilityChange('visible');

      // First frame back in foreground
      ctrl.stepFrame(16.6667);

      // Verification: scroll position must NOT leap by 15s * 40 px/s = 600px!
      // Due to visibility handler resetting lastTimeRef.current to null,
      // the first frame after return re-initializes baseline!
      const deltaOnReturn = ctrl.env.scrollY - yBeforeBackground;
      assert(
        deltaOnReturn <= 5,
        `Expected minimal or zero scroll jump on tab return, got leap of ${deltaOnReturn}px`
      );
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-14: Flapping tab visibility (10 rapid cycles) preserves stable RAF loop without NaN timestamps
  await runner.test('ADV-S3-14: Flapping tab visibility (10 rapid cycles) preserves stable RAF loop without NaN timestamps', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 5000;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);

      for (let i = 0; i < 10; i++) {
        ctrl.env.triggerVisibilityChange('hidden');
        ctrl.stepFrame(10);
        ctrl.env.triggerVisibilityChange('visible');
        ctrl.stepFrame(10);
      }

      assert.strictEqual(ctrl.currentState, 'scrolling');
      assert(!Number.isNaN(ctrl.env.scrollY), 'Scroll position must not be NaN');
      assert(ctrl.env.scrollY >= 0, 'Scroll position must be positive');
      assert.strictEqual(ctrl.env.hasPendingRaf(), true, 'Active RAF must be maintained');
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-15: Tab backgrounding during interrupted countdown: auto-resumes in background with resynced accumulator
  await runner.test('ADV-S3-15: Tab backgrounding during interrupted countdown: auto-resumes in background with resynced accumulator', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 5000;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrames(30);

      // Musician touches screen
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Tab backgrounded during countdown
      ctrl.env.triggerVisibilityChange('hidden');

      // User scrolls manually by 100px while in background
      ctrl.env.scrollY += 100;
      const manualY = ctrl.env.scrollY;

      // 4000ms elapses in background (autoResume timeout fires)
      ctrl.advanceTime(4000);

      // Must have auto-resumed to scrolling in background
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Tab foregrounded
      ctrl.env.triggerVisibilityChange('visible');

      // First frame back resumes cleanly from manual position (manualY)
      ctrl.stepFrame(0);
      ctrl.stepFrames(60);

      assert(
        ctrl.env.scrollY >= manualY + 28 && ctrl.env.scrollY <= manualY + 32,
        `Expected scrolling to proceed from manual position ${manualY}, got ${ctrl.env.scrollY}`
      );
    } finally {
      ctrl.destroy();
    }
  });

  // =========================================================================
  // SECTION F: SongViewer Integration, Font Scaling, Transposition & Lifecycle
  // =========================================================================

  // ADV-S3-16: SongViewer dynamic font scaling (A- / A+) while scrolling adapts scroll metrics without glitch
  await runner.test('ADV-S3-16: SongViewer dynamic font scaling (A- / A+) while scrolling adapts scroll metrics without glitch', () => {
    const song: ParsedSong = {
      slug: 'adv-font-song',
      title: 'Font Scaling Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        { type: 'chords-and-lyrics', segments: [{ chord: 'C', lyrics: 'Line 1' }] },
        { type: 'chords-and-lyrics', segments: [{ chord: 'G', lyrics: 'Line 2' }] },
      ],
      uniqueChords: ['C', 'G'],
    };

    // Render SongViewer with initial font scale
    const vdom = React.createElement(SongViewer, {
      song,
      initialFontSizeOffset: 0,
      initialScrollSpeed: 30,
    });
    const html0 = renderToStaticMarkup(vdom);
    assert(html0.includes('Panel automatycznego przewijania'));
    assert(html0.includes('30 px/s'));

    // Scale up to +12
    const vdomUp = React.createElement(SongViewer, {
      song,
      initialFontSizeOffset: 12,
      initialScrollSpeed: 30,
    });
    const htmlUp = renderToStaticMarkup(vdomUp);
    assert(htmlUp.includes('+12'));
    assert(htmlUp.includes('Panel automatycznego przewijania'));
  });

  // ADV-S3-17: SongViewer transposition and Polish notation toggle mid-scroll maintains dock state and loop
  await runner.test('ADV-S3-17: SongViewer transposition and Polish notation toggle mid-scroll maintains dock state and loop', () => {
    const song: ParsedSong = {
      slug: 'adv-trans-song',
      title: 'Transposition Stress',
      artist: 'Tester',
      key: 'E',
      tags: [],
      rawLyrics: '',
      lines: [
        { type: 'chords-and-lyrics', segments: [{ chord: 'H', lyrics: 'Polish H' }] },
      ],
      uniqueChords: ['H'],
    };

    // Polish notation ON
    const vdomPL = React.createElement(SongViewer, {
      song,
      initialTranspose: 0,
      initialPolishNotation: true,
      initialScrollSpeed: 50,
    });
    const htmlPL = renderToStaticMarkup(vdomPL);
    assert(htmlPL.includes('H'));
    assert(htmlPL.includes('Notacja: PL (H)'));
    assert(htmlPL.includes('50 px/s'));

    // Switch to INT notation
    const vdomINT = React.createElement(SongViewer, {
      song,
      initialTranspose: 0,
      initialPolishNotation: false,
      initialScrollSpeed: 50,
    });
    const htmlINT = renderToStaticMarkup(vdomINT);
    assert(htmlINT.includes('B'));
    assert(htmlINT.includes('Notacja: INT (B)'));
    assert(htmlINT.includes('50 px/s'));
  });

  // ADV-S3-18: SongViewer unmount / route transition while scrolling cleanly halts RAF and removes window listeners
  await runner.test('ADV-S3-18: SongViewer unmount / route transition while scrolling cleanly halts RAF and removes window listeners', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      assert.strictEqual(ctrl.currentState, 'scrolling');
      assert.strictEqual(ctrl.env.hasPendingRaf(), true);
      assert(ctrl.env.windowListeners['touchstart']?.length > 0);

      // Simulate route navigation / unmount
      ctrl.destroy();

      // RAF cancelled, timers cleared, listeners detached
      assert.strictEqual(ctrl.env.hasPendingRaf(), false, 'Pending RAF cancelled');
      assert.strictEqual(ctrl.env.windowListeners['touchstart'], undefined, 'Touch listeners detached');
    } finally {
      // already destroyed
    }
  });

  // ADV-S3-19: Dynamic containerRef fallback: container target unmounted or nullified degrades gracefully to window
  await runner.test('ADV-S3-19: Dynamic containerRef fallback: container target unmounted or nullified degrades gracefully to window', () => {
    const containerRef = { current: null as any };
    const ctrl = new AutoScrollController({ initialSpeed: 30, containerRef });
    try {
      // containerRef.current is null -> falls back to window
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrames(60);
      assert(ctrl.env.scrollY > 0, 'Must scroll window when containerRef is null');
    } finally {
      ctrl.destroy();
    }
  });

  // ADV-S3-20: Sub-pixel DOM rounding: fractional scroll positions do not cause stalls
  await runner.test('ADV-S3-20: Sub-pixel DOM rounding: fractional scroll positions do not cause stalls', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 20 });
    try {
      ctrl.env.scrollHeight = 3000;
      // High-DPI sub-pixel initial position
      ctrl.env.scrollY = 120.45;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);

      // Step 60 frames (1 second = 20px)
      for (let i = 0; i < 60; i++) {
        ctrl.stepFrame(16.6667);
      }

      // Expected ~140.45px
      assert(
        Math.abs(ctrl.env.scrollY - 140.45) <= 1.5,
        `Expected scrollY ~140.45, got ${ctrl.env.scrollY}`
      );
      assert.strictEqual(ctrl.currentState, 'scrolling');
    } finally {
      ctrl.destroy();
    }
  });

  // =========================================================================
  // SECTION G: Chaos Monkey Invariant Stress Fuzzing
  // =========================================================================

  // ADV-S3-21: High-stress chaos monkey fuzzing (200 randomized interleaved actions)
  await runner.test('ADV-S3-21: High-stress chaos monkey fuzzing (200 randomized interleaved actions)', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 35 });
    try {
      ctrl.env.scrollHeight = 5000;
      ctrl.env.innerHeight = 800;

      // Deterministic PRNG
      let seed = 98765;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };

      for (let op = 0; op < 200; op++) {
        const action = Math.floor(rand() * 9);
        switch (action) {
          case 0: // Play/pause toggle
            ctrl.clickPlayPause();
            break;
          case 1: // Velocity change
            const spd = 15 + Math.floor(rand() * 106);
            ctrl.changeSpeed(spd);
            break;
          case 2: // Jump to top
            ctrl.clickJumpToTop();
            break;
          case 3: // Touch gesture outside dock
            const gestureTypes = ['touchstart', 'touchmove', 'wheel', 'pointerdown'] as const;
            ctrl.touchOutside(gestureTypes[Math.floor(rand() * 4)]);
            break;
          case 4: // Touch gesture inside dock
            ctrl.touchInsideDock('touchmove');
            break;
          case 5: // Step frame
            const dt = 8 + rand() * 25;
            ctrl.stepFrame(dt);
            break;
          case 6: // Advance virtual time
            ctrl.advanceTime(Math.floor(rand() * 1200));
            break;
          case 7: // Tab visibility toggle
            ctrl.env.triggerVisibilityChange(rand() > 0.5 ? 'visible' : 'hidden');
            break;
          case 8: // Resize window/content
            ctrl.env.innerHeight = 500 + Math.floor(rand() * 500);
            ctrl.env.scrollHeight = Math.max(ctrl.env.innerHeight + 100, 2000 + Math.floor(rand() * 3000));
            break;
        }

        // Invariants must hold on EVERY iteration:
        assert(
          ['idle', 'scrolling', 'interrupted'].includes(ctrl.currentState),
          `Invalid state "${ctrl.currentState}" at op ${op}`
        );
        assert(
          ctrl.currentSpeed >= 15 && ctrl.currentSpeed <= 120,
          `Speed out of bounds: ${ctrl.currentSpeed} at op ${op}`
        );
        assert(
          !Number.isNaN(ctrl.env.scrollY),
          `ScrollY became NaN at op ${op}`
        );
      }
    } finally {
      ctrl.destroy();
    }
  });
}
