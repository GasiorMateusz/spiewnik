import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestRunner, assert } from './helpers/test_framework';
import { AutoScroll } from '../src/components/AutoScroll';
import { SongViewer } from '../src/components/SongViewer';
import { AutoScrollController, MockScrollEnvironment } from './helpers/autoscroll_harness';
import type { ParsedSong } from '../src/types';

const MOCK_SONG: ParsedSong = {
  slug: 'test-song-stage3',
  title: 'Piosenka Testowa Stage 3',
  artist: 'Wykonawca Stage 3',
  key: 'D',
  tags: ['test'],
  rawLyrics: '',
  lines: [
    {
      type: 'section-header',
      header: 'Zwrotka 1',
    },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'D', lyrics: 'Test ' },
        { chord: 'A', lyrics: 'przewijania ' },
        { chord: 'G', lyrics: 'piosenki' },
      ],
    },
  ],
  uniqueChords: ['D', 'A', 'G'],
};

export async function runStage3Tier1Tests(runner: TestRunner) {
  runner.setTier('Stage 3 — Tier 1: Feature Coverage (F46–F72)');

  // F46: Bottom Floating Dock Shell
  await runner.test('F46: Bottom Floating Dock Shell structure, styling, and ARIA semantics', () => {
    const html = renderToStaticMarkup(React.createElement(AutoScroll, { theme: 'dark' }));
    assert(html.includes('role="region"'), 'Must have role="region"');
    assert(html.includes('aria-label="Panel automatycznego przewijania"'), 'Must have Polish ARIA label');
    assert(html.includes('fixed bottom-3 left-1/2 -translate-x-1/2'), 'Must be pinned to bottom viewport centered');
    assert(html.includes('max-w-xl'), 'Must have max-w-xl constraint');
    assert(html.includes('rounded-2xl'), 'Must have rounded-2xl');
    assert(html.includes('backdrop-blur-md'), 'Must have backdrop blur');
    assert(html.includes('z-30'), 'Must have high z-index (z-30)');
  });

  // F47: Play / Pause Toggle Button
  await runner.test('F47: Play / Pause Toggle Button toggles state and updates icon/text/ARIA', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      // 1. Initial idle state
      assert.strictEqual(ctrl.currentState, 'idle');
      let html = renderToStaticMarkup(ctrl.vdom);
      assert(html.includes('aria-label="Start"'), 'Initial label must be Start');
      assert(html.includes('Start</span>'), 'Button text must be Start');

      // 2. Click Start -> enters scrolling
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'scrolling');
      html = renderToStaticMarkup(ctrl.vdom);
      assert(html.includes('aria-label="Pauza"'), 'Label must switch to Pauza');
      assert(html.includes('Pauza</span>'), 'Button text must switch to Pauza');

      // 3. Click Pause -> returns to idle
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'idle');
      html = renderToStaticMarkup(ctrl.vdom);
      assert(html.includes('aria-label="Start"'), 'Label must switch back to Start');
    } finally {
      ctrl.destroy();
    }
  });

  // F48: Dynamic Velocity Slider
  await runner.test('F48: Dynamic Velocity Slider adjusts velocity between 15 and 120 px/s with live numerical display', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 45 });
    try {
      assert.strictEqual(ctrl.currentSpeed, 45);
      let html = renderToStaticMarkup(ctrl.vdom);
      assert(html.includes('type="range"'), 'Must render range slider');
      assert(html.includes('min="15"'), 'Min speed must be 15');
      assert(html.includes('max="120"'), 'Max speed must be 120');
      assert(html.includes('aria-label="Prędkość przewijania"'), 'ARIA label for speed slider');
      assert(html.includes('45 px/s'), 'Must display 45 px/s');

      // Change speed to 90
      ctrl.changeSpeed(90);
      assert.strictEqual(ctrl.currentSpeed, 90);
      html = renderToStaticMarkup(ctrl.vdom);
      assert(html.includes('90 px/s'), 'Display must update to 90 px/s');
    } finally {
      ctrl.destroy();
    }
  });

  // F49: Jump-to-Top Button
  await runner.test('F49: Jump-to-Top Button resets scroll position and sets state to idle', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollY = 600;
      ctrl.clickPlayPause(); // start scrolling
      assert.strictEqual(ctrl.currentState, 'scrolling');

      ctrl.clickJumpToTop();
      assert.strictEqual(ctrl.currentState, 'idle');
      assert.strictEqual(ctrl.env.scrollY, 0, 'Scroll position must be reset to 0');
      assert(!ctrl.env.hasPendingRaf(), 'RAF loop must be stopped');
    } finally {
      ctrl.destroy();
    }
  });

  // F50: State & Countdown Indicator
  await runner.test('F50: State & Countdown Indicator displays real-time countdown badge during interruption', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause(); // start scrolling
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Interrupt via screen touch
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      const html = renderToStaticMarkup(ctrl.vdom);
      assert(html.includes('Wznowienie za 3s...'), 'Must show 3s countdown badge');
      assert(html.includes('Zatrzymaj'), 'Must show explicit Zatrzymaj button');
    } finally {
      ctrl.destroy();
    }
  });

  // F51: High-Contrast Stage Styling
  await runner.test('F51: High-Contrast Stage Styling for dark OLED and light theme', () => {
    const darkHtml = renderToStaticMarkup(React.createElement(AutoScroll, { theme: 'dark' }));
    assert(darkHtml.includes('bg-neutral-900/95'), 'Dark theme background');
    assert(darkHtml.includes('text-neutral-100'), 'Dark theme text');
    assert(darkHtml.includes('border-neutral-700/80'), 'Dark theme border');

    const lightHtml = renderToStaticMarkup(React.createElement(AutoScroll, { theme: 'light' }));
    assert(lightHtml.includes('bg-white/95'), 'Light theme background');
    assert(lightHtml.includes('text-neutral-900'), 'Light theme text');
    assert(lightHtml.includes('border-neutral-300'), 'Light theme border');
  });

  // F52: Mobile Thumb Tap Targets
  await runner.test('F52: Mobile Thumb Tap Targets meet >= 40x40px requirement', () => {
    const html = renderToStaticMarkup(React.createElement(AutoScroll, {}));
    // Play/Pause button
    assert(html.includes('min-w-[40px]'), 'Play/Pause has min-w-40px');
    assert(html.includes('h-10'), 'Play/Pause has h-10 (40px)');
    // Jump-to-top button
    assert(html.includes('min-w-[40px] min-h-[40px]'), 'Jump button has >= 40x40px min bounds');
  });

  // F53: Safe Area Insets & Floating Offset
  await runner.test('F53: Safe Area Insets & Floating Offset respects mobile gesture bar', () => {
    const html = renderToStaticMarkup(React.createElement(AutoScroll, {}));
    assert(
      html.includes('padding-bottom:max(0.625rem, env(safe-area-inset-bottom))') ||
      html.includes('padding-bottom: max(0.625rem, env(safe-area-inset-bottom))'),
      'Must contain safe-area-inset-bottom style fallback'
    );
    assert(html.includes('bottom-3'), 'Must have floating offset from viewport bottom');
  });

  // F54: SongViewer Bottom Content Padding
  await runner.test('F54: SongViewer Bottom Content Padding (pb-28 sm:pb-32) prevents dock occlusion', () => {
    const html = renderToStaticMarkup(React.createElement(SongViewer, { song: MOCK_SONG }));
    assert(html.includes('pb-28 sm:pb-32'), 'Song lyrics container must specify pb-28 sm:pb-32');
  });

  // F55: RAF Scroll Driver Loop
  await runner.test('F55: RAF Scroll Driver Loop smoothly requests animation frames', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      assert(!ctrl.env.hasPendingRaf(), 'RAF not running while idle');
      ctrl.clickPlayPause();
      assert(ctrl.env.hasPendingRaf(), 'RAF running while scrolling');

      // Step one frame
      ctrl.stepFrame(16.6667);
      assert(ctrl.env.hasPendingRaf(), 'RAF continues to next frame');

      ctrl.clickPlayPause(); // pause
      assert(!ctrl.env.hasPendingRaf(), 'RAF stopped when paused');
    } finally {
      ctrl.destroy();
    }
  });

  // F56: Sub-Pixel Delta Calculation
  await runner.test('F56: Sub-Pixel Delta Calculation: deltaY = speed * (dt / 1000)', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 60 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // initial tick sets lastTimeRef

      // Exactly 100ms at 60 px/s should accumulate 6.0 pixels
      ctrl.stepFrame(100);
      assert.strictEqual(ctrl.env.scrollY, 6, 'ScrollY should advance by exactly 6px (60 px/s * 0.1s)');
    } finally {
      ctrl.destroy();
    }
  });

  // F57: Sub-Pixel Floating Accumulator
  await runner.test('F57: Sub-Pixel Floating Accumulator prevents integer truncation freeze at 15 px/s', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 15 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline

      // At 60 FPS (16.6667ms), deltaY per frame = 15 * 0.0166667 = 0.25px.
      // Frames 1-3: accum = 0.25, 0.50, 0.75 -> scrollY remains 0
      ctrl.stepFrame(16.6667);
      assert.strictEqual(ctrl.env.scrollY, 0, 'Frame 1: 0.25px, scrollY=0');
      ctrl.stepFrame(16.6667);
      assert.strictEqual(ctrl.env.scrollY, 0, 'Frame 2: 0.50px, scrollY=0');
      ctrl.stepFrame(16.6667);
      assert.strictEqual(ctrl.env.scrollY, 0, 'Frame 3: 0.75px, scrollY=0');

      // Frame 4: accum = 1.00 -> floor(1.00) = 1, scrollY becomes 1!
      ctrl.stepFrame(16.6667);
      assert.strictEqual(ctrl.env.scrollY, 1, 'Frame 4: 1.00px, scrollY=1');

      // 60 frames total (1 second) at 15 px/s must yield exactly 15 pixels!
      // (We already stepped 4 frames, step remaining 56 frames)
      for (let i = 4; i < 60; i++) {
        ctrl.stepFrame(16.6667);
      }
      assert.strictEqual(ctrl.env.scrollY, 15, 'After 60 frames, scrollY must equal 15px');
    } finally {
      ctrl.destroy();
    }
  });

  // F58: Background Tab Time Capping
  await runner.test('F58: Background Tab Time Capping caps dt <= 100ms preventing runaway scroll leap', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline

      // Simulate browser tab freeze / backgrounding of 5000ms
      ctrl.stepFrame(5000);
      // Without capping: 30 * 5 = 150px jump.
      // With capping to 100ms: 30 * 0.1 = 3px!
      assert.strictEqual(ctrl.env.scrollY, 3, 'Scroll jump capped to 3px (dt <= 100ms)');
    } finally {
      ctrl.destroy();
    }
  });

  // F59: Clean Bottom Detection & Stop
  await runner.test('F59: Clean Bottom Detection & Stop halts RAF loop and transitions to idle within 2px tolerance', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 60 });
    try {
      ctrl.env.innerHeight = 800;
      ctrl.env.scrollHeight = 1000;
      // maxScrollTop = 1000 - 800 = 200px
      ctrl.env.scrollY = 196; // 4px away from bottom

      ctrl.clickPlayPause();
      ctrl.stepFrame(0);

      // Scroll 3px -> remaining distance is 1px (<= 2px tolerance)
      ctrl.stepFrame(50); // 60 * 0.05 = 3px, new scrollY = 199 (1px from max 200)

      assert.strictEqual(ctrl.currentState, 'idle', 'Must stop and transition to idle at song bottom');
      assert(!ctrl.env.hasPendingRaf(), 'RAF loop must be terminated');
    } finally {
      ctrl.destroy();
    }
  });

  // F60: Target Container Flexibility
  await runner.test('F60: Target Container Flexibility with explicit containerRef', () => {
    let containerScrollTop = 0;
    const mockContainer = {
      get scrollTop() {
        return containerScrollTop;
      },
      set scrollTop(v: number) {
        containerScrollTop = v;
      },
      clientHeight: 500,
      scrollHeight: 1500,
      scrollTo: (opts: any) => {
        containerScrollTop = typeof opts === 'number' ? opts : opts.top;
      },
    } as any;

    const ref = { current: mockContainer };
    const ctrl = new AutoScrollController({
      containerRef: ref,
      initialSpeed: 40,
    });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrame(100); // 40 * 0.1 = 4px

      assert.strictEqual(containerScrollTop, 4, 'Target container scrollTop was modified');
      assert.strictEqual(ctrl.env.scrollY, 0, 'Window scrollY remained 0');
    } finally {
      ctrl.destroy();
    }
  });

  // F61: Three-State Finite State Machine
  await runner.test('F61: Three-State Finite State Machine (idle <-> scrolling <-> interrupted)', () => {
    const ctrl = new AutoScrollController();
    try {
      assert.strictEqual(ctrl.currentState, 'idle');

      // 1. idle -> scrolling
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // 2. scrolling -> interrupted
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // 3. interrupted -> scrolling (auto-resume after 3s)
      ctrl.advanceTime(3000);
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // 4. scrolling -> idle (explicit pause)
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'idle');
    } finally {
      ctrl.destroy();
    }
  });

  // F62: Touch / Flick Gesture Detection
  await runner.test('F62: Touch / Flick Gesture Detection for touchstart, touchmove, wheel, and pointerdown', () => {
    const gestures: Array<'touchstart' | 'touchmove' | 'wheel' | 'pointerdown'> = [
      'touchstart',
      'touchmove',
      'wheel',
      'pointerdown',
    ];

    for (const g of gestures) {
      const ctrl = new AutoScrollController();
      try {
        ctrl.clickPlayPause();
        assert.strictEqual(ctrl.currentState, 'scrolling');

        ctrl.touchOutside(g);
        assert.strictEqual(ctrl.currentState, 'interrupted', `Gesture ${g} must trigger interruption`);
      } finally {
        ctrl.destroy();
      }
    }
  });

  // F63: Dock Control Event Isolation
  await runner.test('F63: Dock Control Event Isolation prevents gestures inside dock from halting scroll', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Touch inside the floating dock
      ctrl.touchInsideDock('touchstart');
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Dock internal touch must NOT interrupt scrolling');

      ctrl.touchInsideDock('pointerdown');
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Dock internal pointerdown must NOT interrupt scrolling');

      // Now touch outside the dock on song text
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted', 'Touch outside dock MUST interrupt scrolling');
    } finally {
      ctrl.destroy();
    }
  });

  // F64: Immediate Scroll Halting on Gesture
  await runner.test('F64: Immediate Scroll Halting on Gesture cancels RAF on the same frame', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause();
      assert(ctrl.env.hasPendingRaf(), 'RAF running');

      ctrl.touchOutside('touchstart');
      assert(!ctrl.env.hasPendingRaf(), 'RAF must be immediately halted on touch gesture');
      assert.strictEqual(ctrl.currentState, 'interrupted');
    } finally {
      ctrl.destroy();
    }
  });

  // F65: 3-Second Auto-Resume Timer
  await runner.test('F65: 3-Second Auto-Resume Timer resumes scrolling after 3000ms of inactivity', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause();
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Advance 1000ms -> remaining 2s
      ctrl.advanceTime(1000);
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Advance 1999ms (total 2999ms) -> still interrupted
      ctrl.advanceTime(1999);
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Advance 1ms (total 3000ms) -> resumes scrolling!
      ctrl.advanceTime(1);
      assert.strictEqual(ctrl.currentState, 'scrolling');
      assert(ctrl.env.hasPendingRaf(), 'RAF loop restarted');
    } finally {
      ctrl.destroy();
    }
  });

  // F66: Gesture Debounce / Timer Reset
  await runner.test('F66: Gesture Debounce / Timer Reset resets 3s timer on repeated touch interactions', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause();
      ctrl.touchOutside('touchstart'); // t=0: timer armed for t=3000
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // User drags screen at t=2000ms
      ctrl.advanceTime(2000);
      ctrl.touchOutside('touchmove'); // debounced: reset timer for +3000ms (t=5000)

      // Advance to t=3500ms (past original 3000ms mark)
      ctrl.advanceTime(1500);
      assert.strictEqual(ctrl.currentState, 'interrupted', 'Must still be interrupted due to debounce reset');

      // Advance remaining 1500ms (t=5000ms)
      ctrl.advanceTime(1500);
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Must resume after debounced 3000ms has elapsed');
    } finally {
      ctrl.destroy();
    }
  });

  // F67: Position Re-sync on Resume
  await runner.test('F67: Position Re-sync on Resume updates accumulator to manual scroll position', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrame(100); // scrolled to y=3
      assert.strictEqual(ctrl.env.scrollY, 3);

      // User interrupts
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Musician manually flicks page down to line at y=450
      ctrl.env.scrollY = 450;

      // Auto-resume fires
      ctrl.advanceTime(3000);
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Step one frame (100ms) at 30 px/s
      ctrl.stepFrame(0); // baseline
      ctrl.stepFrame(100); // +3px

      assert.strictEqual(ctrl.env.scrollY, 453, 'Scroll continued from manual position 450 -> 453 without snapback');
    } finally {
      ctrl.destroy();
    }
  });

  // F68: Explicit Pause Semantics
  await runner.test('F68: Explicit Pause Semantics cancels auto-resume timer and enters idle permanently', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause(); // start
      ctrl.touchOutside('touchstart'); // interrupt
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Explicitly tap Zatrzymaj
      ctrl.clickExplicitStop();
      assert.strictEqual(ctrl.currentState, 'idle');

      // Advance 5000ms -> must NOT resume
      ctrl.advanceTime(5000);
      assert.strictEqual(ctrl.currentState, 'idle', 'Must stay idle permanently after explicit stop');
      assert(!ctrl.env.hasPendingRaf(), 'RAF loop remains stopped');
    } finally {
      ctrl.destroy();
    }
  });

  // F69: Explicit Play / Resume Semantics
  await runner.test('F69: Explicit Play / Resume Semantics immediately resumes scrolling without waiting 3s', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause();
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // Tapping Play button immediately resumes
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Immediate transition to scrolling on Play click');
      assert(ctrl.env.hasPendingRaf(), 'RAF loop immediately started');
    } finally {
      ctrl.destroy();
    }
  });

  // F70: At-Bottom Start Behavior
  await runner.test('F70: At-Bottom Start Behavior resets scroll to top before scrolling', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.innerHeight = 800;
      ctrl.env.scrollHeight = 1800;
      // maxScrollTop = 1800 - 800 = 1000px
      ctrl.env.scrollY = 1000; // at bottom

      // Tapping Start when at bottom
      ctrl.clickPlayPause();
      assert.strictEqual(ctrl.env.scrollY, 0, 'Scroll position reset to 0');
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // Let resetting arbitration finish
      ctrl.stepFrame(16.6667);
      ctrl.stepFrame(100); // 3px
      assert.strictEqual(ctrl.env.scrollY, 3, 'Scrolls down from top smoothly');
    } finally {
      ctrl.destroy();
    }
  });

  // F71: Dynamic Velocity Modification
  await runner.test('F71: Dynamic Velocity Modification alters scroll speed on the fly without stopping loop', () => {
    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrame(100); // at 30 px/s -> 3px
      assert.strictEqual(ctrl.env.scrollY, 3);

      // Change speed on the fly to 90 px/s
      ctrl.changeSpeed(90);
      assert.strictEqual(ctrl.currentState, 'scrolling', 'Loop remains in scrolling state');
      assert(ctrl.env.hasPendingRaf(), 'RAF remains active');

      // Next 100ms frame at 90 px/s -> should scroll 9px
      ctrl.stepFrame(100);
      assert.strictEqual(ctrl.env.scrollY, 12, 'Advanced by 9px (3 + 9 = 12)');
    } finally {
      ctrl.destroy();
    }
  });

  // F72: Lifecycle & Cleanup
  await runner.test('F72: Lifecycle & Cleanup clears RAF, timers, and unregisters window listeners', () => {
    const ctrl = new AutoScrollController();
    try {
      ctrl.clickPlayPause();
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');
      assert(ctrl.env.windowListeners['touchstart']?.length > 0, 'Listeners registered');

      // Destroy / Unmount component
      ctrl.destroy();

      assert(!ctrl.env.hasPendingRaf(), 'RAF stopped on unmount');
      // Advance virtual time by 5000ms: verify no lingering timers fired
      ctrl.env.advanceTime(5000);
      assert.strictEqual(ctrl.currentState, 'interrupted', 'No unmounted state transitions');
    } finally {
      // already destroyed
    }
  });
}
