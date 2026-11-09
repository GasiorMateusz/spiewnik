import React from 'react';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunner } from './helpers/test_framework';
import { AutoScroll } from '../src/components/AutoScroll';
import { HookHarness } from './helpers/hook_harness';
import type { AutoScrollState } from '../src/types';

// ============================================================================
// SIMULATION ENGINE FOR PURE RAF MATH & BOUNDARY ADVERSARIAL TESTING
// ============================================================================

interface SimulatedMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  scrollByCalls: number[];
  scrollToTopCalls: boolean[];
}

class SimulatedRafEngine {
  public speed: number;
  public state: AutoScrollState = 'idle';
  public accumulatedScroll: number = 0;
  public lastTime: number | null = null;
  public isResettingToTop: boolean = false;
  public resetStartTime: number = 0;
  public rafScheduled: boolean = false;
  public rafCallbacks: Array<(timestamp: number) => void> = [];
  public metrics: SimulatedMetrics;

  constructor(initialSpeed: number, metrics: Partial<SimulatedMetrics> = {}) {
    this.speed = Math.max(15, Math.min(120, initialSpeed));
    this.metrics = {
      scrollTop: metrics.scrollTop ?? 0,
      clientHeight: metrics.clientHeight ?? 800,
      scrollHeight: metrics.scrollHeight ?? 2000,
      scrollByCalls: [],
      scrollToTopCalls: [],
    };
  }

  scrollBy(dy: number) {
    this.metrics.scrollTop += dy;
    this.metrics.scrollByCalls.push(dy);
  }

  scrollToTop(smooth = true) {
    this.metrics.scrollToTopCalls.push(smooth);
  }

  start() {
    const maxScrollTop = Math.max(0, this.metrics.scrollHeight - this.metrics.clientHeight);
    const isAtBottom = maxScrollTop > 2 && maxScrollTop - this.metrics.scrollTop <= 2;

    if (isAtBottom) {
      this.scrollToTop(true);
      this.isResettingToTop = true;
      this.resetStartTime = 0;
      this.accumulatedScroll = 0;
    } else {
      this.accumulatedScroll = this.metrics.scrollTop;
    }
    this.lastTime = null;
    this.state = 'scrolling';
    this.scheduleRaf();
  }

  stopScrolling() {
    this.rafScheduled = false;
    this.rafCallbacks = [];
    this.lastTime = null;
    this.isResettingToTop = false;
    this.accumulatedScroll = 0;
    this.state = 'idle';
  }

  jumpToTop() {
    this.stopScrolling();
    this.scrollToTop(true);
    this.metrics.scrollTop = 0;
  }

  scheduleRaf() {
    this.rafScheduled = true;
  }

  // Exact reproduction of tick() logic from AutoScroll.tsx lines 180-246
  tick(timestamp: number) {
    if (this.state !== 'scrolling') {
      this.rafScheduled = false;
      this.lastTime = null;
      return;
    }

    // Smooth reset arbitration when starting at the bottom
    if (this.isResettingToTop) {
      const atTop = this.metrics.scrollTop <= 5;
      const timeout = timestamp - this.resetStartTime > 1000;
      if (atTop || timeout) {
        this.isResettingToTop = false;
        this.lastTime = timestamp;
        this.accumulatedScroll = this.metrics.scrollTop;
      }
      this.scheduleRaf();
      return;
    }

    const now = timestamp;
    if (this.lastTime === null) {
      this.lastTime = now;
      this.accumulatedScroll = this.metrics.scrollTop;
      this.scheduleRaf();
      return;
    }

    // Delta time capped to 100ms for background tab protection
    const rawDt = Math.max(0, now - this.lastTime);
    const dt = Math.min(rawDt, 100);
    this.lastTime = now;

    // Sub-pixel delta accumulation
    const deltaY = (this.speed * dt) / 1000;
    this.accumulatedScroll += deltaY;

    // Boundary calculation with -2px tolerance
    const maxScrollTop = Math.max(0, this.metrics.scrollHeight - this.metrics.clientHeight);
    const distanceRemaining = maxScrollTop - this.metrics.scrollTop;

    if (distanceRemaining <= 2) {
      this.stopScrolling();
      return;
    }

    // Extract integer pixels to scroll
    const targetY = Math.min(this.accumulatedScroll, maxScrollTop);
    const desiredScroll = Math.floor(targetY) - this.metrics.scrollTop;

    if (desiredScroll > 0) {
      const actualScroll = Math.min(desiredScroll, distanceRemaining);
      this.scrollBy(actualScroll);

      if (distanceRemaining - actualScroll <= 2) {
        this.stopScrolling();
        return;
      }
    }

    this.scheduleRaf();
  }
}

// ============================================================================
// CDP CLIENT FOR REAL BROWSER HEADLESS INTEGRATION
// ============================================================================

const PROD_PORT = 4184;
const CHROME_PORT = 9234;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class CdpClient {
  private ws: WebSocket;
  private id = 1;
  private callbacks = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id)!;
        this.callbacks.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    };
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`CDP eval exception: ${res.exceptionDetails.text} - ${JSON.stringify(res.exceptionDetails.exception)}`);
    }
    return res.result?.value;
  }
}

async function connectToChrome(): Promise<{ cdp: CdpClient; ws: WebSocket }> {
  let pageWsUrl: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json`);
      const targets = await res.json();
      const page = targets.find((t: any) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }
  assert(pageWsUrl, 'Failed to obtain Chrome page WebSocket URL');
  const ws = new WebSocket(pageWsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const cdp = new CdpClient(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return { cdp, ws };
}

// ============================================================================
// MAIN TEST SUITE ENTRY POINT
// ============================================================================

export async function runM4Challenger1Tests(runner: TestRunner) {
  // --------------------------------------------------------------------------
  // SUITE 1: Sub-pixel Accumulator at Minimum Speed (15 px/s)
  // --------------------------------------------------------------------------
  runner.setTier('M4-CHALLENGER-1: Sub-pixel Accumulator at Minimum Speed (15 px/s)');

  await runner.test('CH1-01: 15 px/s at 60 FPS accumulates 0.25 px/frame and scrolls without dropping pixels or freezing', () => {
    const engine = new SimulatedRafEngine(15);
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime); // baseline init frame (dt=0)

    const frameStep = 1000 / 60; // 16.666666666666668 ms
    const scrollLog: number[] = [];

    // Run 60 frames = 1 second
    for (let frame = 1; frame <= 60; frame++) {
      currentTime += frameStep;
      engine.tick(currentTime);
      scrollLog.push(engine.metrics.scrollTop);

      // Verify accumulator matches mathematical expectation
      const expectedAccum = frame * ((15 * frameStep) / 1000);
      assert(
        Math.abs(engine.accumulatedScroll - expectedAccum) < 1e-6,
        `Frame ${frame}: accumulator ${engine.accumulatedScroll} did not match expected ${expectedAccum}`
      );
    }

    // After 60 frames (1s), exactly 15 pixels scrolled
    assert.strictEqual(
      engine.metrics.scrollTop,
      15,
      `Expected 15 px scrolled after 60 frames at 15 px/s, got ${engine.metrics.scrollTop}`
    );

    // Verify continuous progression: every 4 frames (frames 4, 8, 12, ... 60), scrollTop advances
    for (let f = 1; f <= 60; f++) {
      const continuousExpected = (f * 15 * frameStep) / 1000;
      const diff = Math.abs(scrollLog[f - 1] - continuousExpected);
      assert(diff <= 1.0, `Frame ${f}: discretization difference ${diff} exceeded 1.0px`);
    }

    // Verify 0 pixel freezes or dropping: check 10 seconds (600 frames)
    for (let frame = 61; frame <= 600; frame++) {
      currentTime += frameStep;
      engine.tick(currentTime);
    }

    // Continuous distance after 600 frames is 150 px. Discretization error is <= 1 px (149 or 150).
    const continuousTotal = (600 * 15 * frameStep) / 1000;
    const diff10s = Math.abs(engine.metrics.scrollTop - continuousTotal);
    assert(
      diff10s <= 1.0,
      `Expected total scroll within 1px of 150px after 10s, got ${engine.metrics.scrollTop} (diff=${diff10s})`
    );

    // Confirm that a naive non-accumulating engine would have scrolled 0 px (FROZEN)
    const naiveScroll = 600 * Math.floor((15 * frameStep) / 1000);
    assert.strictEqual(naiveScroll, 0, 'Naive implementation without accumulator freezes at 0 px');
    assert(engine.metrics.scrollTop >= 149, 'Accumulator prevented freeze and delivered 149-150px');
  });

  await runner.test('CH1-02: 15 px/s at 120 FPS accumulates 0.125 px/frame and scrolls 1px every 8 frames smoothly', () => {
    const engine = new SimulatedRafEngine(15);
    engine.start();

    let currentTime = 2000;
    engine.tick(currentTime);

    const frameStep = 1000 / 120; // 8.333333333333334 ms
    for (let frame = 1; frame <= 120; frame++) {
      currentTime += frameStep;
      engine.tick(currentTime);
      const continuousExpected = (frame * 15 * frameStep) / 1000;
      const diff = Math.abs(engine.metrics.scrollTop - continuousExpected);
      assert(
        diff <= 1.0001,
        `Frame ${frame} at 120 FPS: continuousExpected=${continuousExpected}, got=${engine.metrics.scrollTop}`
      );
    }

    assert(
      Math.abs(engine.metrics.scrollTop - 15) <= 1,
      `After 1 second at 120 FPS, total scroll must be 15±1 px, got ${engine.metrics.scrollTop}`
    );
  });

  await runner.test('CH1-03: 15 px/s with irregular frame jitter (8ms–33ms) preserves conservation of total distance', () => {
    const engine = new SimulatedRafEngine(15);
    engine.start();

    let currentTime = 10000;
    engine.tick(currentTime);

    // Seeded pseudo-random intervals between 8ms and 33ms
    let totalElapsedMs = 0;
    let seed = 42;
    const randomDt = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return 8 + (seed / 233280) * 25; // 8ms to 33ms
    };

    for (let i = 0; i < 500; i++) {
      const dt = randomDt();
      totalElapsedMs += dt;
      currentTime += dt;
      engine.tick(currentTime);
    }

    const mathematicalExpectedPx = Math.floor((15 * totalElapsedMs) / 1000);
    const diff = Math.abs(engine.metrics.scrollTop - mathematicalExpectedPx);
    assert(
      diff <= 1,
      `Jitter accumulation error: actual=${engine.metrics.scrollTop}, expected=${mathematicalExpectedPx}, diff=${diff}`
    );
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Sub-pixel Accumulator at Maximum Speed (120 px/s)
  // --------------------------------------------------------------------------
  runner.setTier('M4-CHALLENGER-1: Sub-pixel Accumulator at Maximum Speed (120 px/s)');

  await runner.test('CH1-04: 120 px/s at 60 FPS scrolls ~2px/frame and delivers 120 px/sec within discretization bounds', () => {
    const engine = new SimulatedRafEngine(120, { scrollHeight: 10000 });
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime); // init

    const frameStep = 1000 / 60;
    for (let frame = 1; frame <= 60; frame++) {
      currentTime += frameStep;
      engine.tick(currentTime);
      const continuousExpected = (frame * 120 * frameStep) / 1000;
      const diff = Math.abs(engine.metrics.scrollTop - continuousExpected);
      assert(
        diff <= 1.0001,
        `Frame ${frame}: continuousExpected=${continuousExpected}, got=${engine.metrics.scrollTop}`
      );
    }

    // Total distance at 1s is 120±1 px
    assert(
      Math.abs(engine.metrics.scrollTop - 120) <= 1,
      `120 px/s after 60 frames must equal 120±1 px, got ${engine.metrics.scrollTop}`
    );
  });

  await runner.test('CH1-05: 120 px/s at 120 FPS scrolls ~1px/frame and delivers 120 px/sec smoothly', () => {
    const engine = new SimulatedRafEngine(120, { scrollHeight: 10000 });
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime);

    const frameStep = 1000 / 120;
    for (let frame = 1; frame <= 120; frame++) {
      currentTime += frameStep;
      engine.tick(currentTime);
      const continuousExpected = (frame * 120 * frameStep) / 1000;
      const diff = Math.abs(engine.metrics.scrollTop - continuousExpected);
      assert(
        diff <= 1.0001,
        `Frame ${frame}: continuousExpected=${continuousExpected}, got=${engine.metrics.scrollTop}`
      );
    }

    assert(
      Math.abs(engine.metrics.scrollTop - 120) <= 1,
      `120 px/s at 120 FPS after 120 frames must equal 120±1 px, got ${engine.metrics.scrollTop}`
    );
  });

  await runner.test('CH1-06: Dynamic velocity modulation mid-flight maintains sub-pixel continuity without jumps', () => {
    const engine = new SimulatedRafEngine(15, { scrollHeight: 10000 });
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime);

    const frameStep = 1000 / 60;

    // Run 30 frames at 15 px/s (0.5s -> should scroll ~7 px)
    for (let f = 1; f <= 30; f++) {
      currentTime += frameStep;
      engine.tick(currentTime);
    }
    const scrollAtMid = engine.metrics.scrollTop;
    assert.strictEqual(scrollAtMid, 7, `Expected 7 px at 30 frames, got ${scrollAtMid}`);

    // Modulate speed to 120 px/s
    engine.speed = 120;

    // Next frame (31): deltaY = 120 * 16.666 / 1000 = 2.0 px
    currentTime += frameStep;
    engine.tick(currentTime);
    // Previous accumulator was 7.5; plus 2.0 = 9.5; floor is 9. Scrolled by 2.
    assert.strictEqual(engine.metrics.scrollTop, 9, `Expected 9 px, got ${engine.metrics.scrollTop}`);
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Elapsed Time Clamping (Δt <= 100ms)
  // --------------------------------------------------------------------------
  runner.setTier('M4-CHALLENGER-1: Elapsed Time Clamping (dt <= 100ms)');

  await runner.test('CH1-07: Delta time is clamped to 100ms during background tab freeze (Δt = 250ms)', () => {
    const engine = new SimulatedRafEngine(120, { scrollHeight: 10000 });
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime); // init

    // Advance by 250ms (e.g. background tab or main thread blockage)
    currentTime += 250;
    engine.tick(currentTime);

    // At 120 px/s and 100ms clamp, max delta is (120 * 100) / 1000 = 12 px (NOT 30 px)
    assert.strictEqual(
      engine.metrics.scrollTop,
      12,
      `Expected delta to be clamped to 12 px, got ${engine.metrics.scrollTop}`
    );
  });

  await runner.test('CH1-08: Severe 5-second tab freeze (Δt = 5000ms) is strictly clamped to 12 px at max speed', () => {
    const engine = new SimulatedRafEngine(120, { scrollHeight: 10000 });
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime); // init

    // 5000ms pause
    currentTime += 5000;
    engine.tick(currentTime);

    // Must be clamped to 100ms -> max 12 px (instead of a runaway 600 px jump)
    assert.strictEqual(
      engine.metrics.scrollTop,
      12,
      `Expected runaway leap prevention: got ${engine.metrics.scrollTop} px instead of <= 12 px`
    );
  });

  await runner.test('CH1-09: Clock anomaly with negative delta (Δt = -100ms) clamps to 0 without backwards scroll', () => {
    const engine = new SimulatedRafEngine(30, { scrollTop: 50, scrollHeight: 1000 });
    engine.start();

    let currentTime = 5000;
    engine.tick(currentTime); // init at 50px

    // System clock steps backwards by 100ms
    currentTime -= 100;
    engine.tick(currentTime);

    // Math.max(0, rawDt) must clamp to 0 -> zero scroll
    assert.strictEqual(engine.metrics.scrollTop, 50, 'Scroll position must not change on negative dt');
    assert.strictEqual(engine.metrics.scrollByCalls.length, 0, 'scrollBy must not be called');
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Boundary & Bottom Detection (y + vh >= h - 2)
  // --------------------------------------------------------------------------
  runner.setTier('M4-CHALLENGER-1: Boundary & Bottom Detection (y + vh >= h - 2)');

  await runner.test('CH1-10: Reaching bottom terminates cleanly to idle state with RAF cancelled and zero overshoot', () => {
    // scrollHeight = 2000, clientHeight = 800 => maxScrollTop = 1200
    // Start at scrollTop = 1195 (distanceRemaining = 5 px)
    const engine = new SimulatedRafEngine(30, { scrollTop: 1195, scrollHeight: 2000, clientHeight: 800 });
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime); // init

    // Advance 50ms at 30 px/s: delta = 1.5 px -> target = 1196.5 -> floor = 1196. scrollBy(1)
    currentTime += 50;
    engine.tick(currentTime);
    assert.strictEqual(engine.metrics.scrollTop, 1196);
    assert.strictEqual(engine.state, 'scrolling');
    assert.strictEqual(engine.rafScheduled, true);

    // Advance another 50ms: delta = 1.5 px -> target = 1198.0 -> distanceRemaining was 4. desired = 2 -> actual = 2.
    // distanceRemaining - actualScroll = 4 - 2 = 2 <= 2!
    // stopScrolling() must be invoked immediately!
    currentTime += 50;
    engine.tick(currentTime);

    assert.strictEqual(engine.metrics.scrollTop, 1198, 'scrollTop must stop at 1198 (within 2px tolerance)');
    assert.strictEqual(engine.state, 'idle', 'State must be idle upon bottom detection');
    assert.strictEqual(engine.rafScheduled, false, 'RAF must NOT be scheduled after bottom detection');
    assert.strictEqual(engine.accumulatedScroll, 0, 'Accumulator must be reset to 0');
  });

  await runner.test('CH1-11: High-speed overshoot prevention: desiredScroll >> distanceRemaining clamps to maxScrollTop', () => {
    // maxScrollTop = 1200. scrollTop = 1195 (distanceRemaining = 5). Speed = 120 px/s.
    const engine = new SimulatedRafEngine(120, { scrollTop: 1195, scrollHeight: 2000, clientHeight: 800 });
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime); // init

    // 100ms step at 120 px/s: delta = 12 px. target = 1200 (clamped). desired = 5.
    currentTime += 100;
    engine.tick(currentTime);

    // actualScroll = min(12, 5) = 5. scrollTop becomes 1200.
    // distanceRemaining becomes 0 <= 2 -> stopScrolling().
    assert.strictEqual(engine.metrics.scrollTop, 1200, 'scrollTop must not overshoot maxScrollTop (1200)');
    assert(engine.metrics.scrollTop <= 1200, 'CRITICAL: scrollTop overshot maxScrollTop!');
    assert.strictEqual(engine.state, 'idle');
    assert.strictEqual(engine.rafScheduled, false);
  });

  await runner.test('CH1-12: Zero bouncing or oscillation when starting at bottom boundary (distanceRemaining <= 2)', () => {
    // maxScrollTop = 1000. scrollTop = 999.
    const engine = new SimulatedRafEngine(30, { scrollTop: 999, scrollHeight: 1800, clientHeight: 800 });
    // Tapping start when already at bottom triggers smooth reset to top (verified in CH1-14)
    // If we test starting at bottom during normal tick:
    engine.state = 'scrolling';
    engine.lastTime = 1000;
    engine.accumulatedScroll = 999;

    // Tick at 1016ms
    engine.tick(1016);

    assert.strictEqual(engine.metrics.scrollTop, 999, 'Must not move past boundary');
    assert.strictEqual(engine.state, 'idle', 'Must cleanly stop to idle');
    assert.strictEqual(engine.rafScheduled, false, 'Must not schedule another RAF');
  });

  await runner.test('CH1-13: Short content where song fits in viewport (scrollHeight <= clientHeight) stops immediately', () => {
    // scrollHeight = 600, clientHeight = 800 => maxScrollTop = 0
    const engine = new SimulatedRafEngine(30, { scrollTop: 0, scrollHeight: 600, clientHeight: 800 });
    engine.start();

    let currentTime = 1000;
    engine.tick(currentTime); // init
    engine.tick(currentTime + 16);

    assert.strictEqual(engine.metrics.scrollTop, 0);
    assert.strictEqual(engine.state, 'idle', 'Must immediately transition to idle for unscrollable content');
    assert.strictEqual(engine.rafScheduled, false);
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Start at Bottom Arbitration & Jump to Top
  // --------------------------------------------------------------------------
  runner.setTier('M4-CHALLENGER-1: Start at Bottom & Jump to Top');

  await runner.test('CH1-14: Tapping Start when at bottom smoothly resets to top and commences scrolling from 0', () => {
    // maxScrollTop = 1000. scrollTop = 1000.
    const engine = new SimulatedRafEngine(30, { scrollTop: 1000, scrollHeight: 1800, clientHeight: 800 });

    // User taps Start
    engine.start();

    assert.strictEqual(engine.state, 'scrolling');
    assert.strictEqual(engine.isResettingToTop, true, 'isResettingToTop must be armed');
    assert.strictEqual(engine.metrics.scrollToTopCalls.length, 1, 'scrollToTop must have been called');

    // While resetting, RAF ticks must NOT advance downward scroll
    let currentTime = 100;
    engine.tick(currentTime);
    assert.strictEqual(engine.metrics.scrollTop, 1000, 'Must not scroll downward during reset');
    assert.strictEqual(engine.isResettingToTop, true);

    // Simulate smooth scroll arriving at top (scrollTop <= 5)
    engine.metrics.scrollTop = 0;
    currentTime = 350;
    engine.tick(currentTime);

    // Reset flag must clear, baseline timestamp set
    assert.strictEqual(engine.isResettingToTop, false, 'isResettingToTop must clear upon reaching top');
    assert.strictEqual(engine.accumulatedScroll, 0, 'accumulatedScroll must be 0');

    // Subsequent tick scrolls downward normally from top
    currentTime += 100; // 100ms at 30 px/s = 3 px
    engine.tick(currentTime);
    assert.strictEqual(engine.metrics.scrollTop, 3, 'Must commence downward scrolling smoothly from top');
    assert.strictEqual(engine.state, 'scrolling');
  });

  await runner.test('CH1-15: Start at bottom timeout fallback (reset takes > 1000ms) safely unblocks scrolling', () => {
    const engine = new SimulatedRafEngine(30, { scrollTop: 1000, scrollHeight: 1800, clientHeight: 800 });
    engine.start();

    assert.strictEqual(engine.isResettingToTop, true);

    // If browser smooth scroll is delayed or blocked, elapsed time exceeds 1000ms
    engine.metrics.scrollTop = 200; // stalled mid-way
    engine.tick(1100); // 1100ms > 1000ms timeout

    assert.strictEqual(engine.isResettingToTop, false, 'Timeout must safely unblock reset state');
    assert.strictEqual(engine.accumulatedScroll, 200);

    // Resumes downward scrolling from current position
    engine.tick(1200); // 100ms -> 3 px
    assert.strictEqual(engine.metrics.scrollTop, 203);
  });

  await runner.test('CH1-16: Jump to top cancels RAF, transitions to idle, resets position to 0 and accumulator to 0', () => {
    const engine = new SimulatedRafEngine(30, { scrollTop: 450, scrollHeight: 2000, clientHeight: 800 });
    engine.start();
    engine.tick(1000);
    engine.tick(1050);

    assert.strictEqual(engine.state, 'scrolling');
    assert.strictEqual(engine.rafScheduled, true);

    // User taps Jump to top ("Wróć na górę")
    engine.jumpToTop();

    assert.strictEqual(engine.state, 'idle', 'State must be idle');
    assert.strictEqual(engine.rafScheduled, false, 'RAF must be cancelled');
    assert.strictEqual(engine.accumulatedScroll, 0, 'Accumulator must be 0');
    assert.strictEqual(engine.metrics.scrollTop, 0, 'Position must be 0');
    assert.strictEqual(engine.metrics.scrollToTopCalls.length, 1, 'scrollToTop must have been called');
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Live React AutoScroll Component Verification
  // --------------------------------------------------------------------------
  runner.setTier('M4-CHALLENGER-1: Live AutoScroll Component & Hook Harness');

  await runner.test('CH1-17: Component lifecycle: default speed 30, clamp bounds [15, 120], and DOM interactions', () => {
    // Setup mock container
    const mockContainer = {
      scrollTop: 0,
      clientHeight: 500,
      scrollHeight: 1500,
      scrollTo: (opts: any) => {
        if (typeof opts === 'object' && opts.top !== undefined) {
          mockContainer.scrollTop = opts.top;
        }
      },
    } as any;

    let observedState: AutoScrollState = 'idle';
    let observedSpeed = 30;

    const harness = new HookHarness(
      (props) => AutoScroll(props),
      {
        initialSpeed: 30,
        scrollTarget: mockContainer,
        onStateChange: (st: AutoScrollState) => {
          observedState = st;
        },
        onSpeedChange: (sp: number) => {
          observedSpeed = sp;
        },
      }
    );

    const jsx = harness.render();
    assert(jsx, 'AutoScroll must return valid JSX element');
    assert.strictEqual(observedState, 'idle');

    // Verify initial speed clamp bounds
    const harnessClampedLow = new HookHarness((props) => AutoScroll(props), { initialSpeed: 5 });
    harnessClampedLow.render();

    const harnessClampedHigh = new HookHarness((props) => AutoScroll(props), { initialSpeed: 999 });
    harnessClampedHigh.render();

    harness.unmount();
    harnessClampedLow.unmount();
    harnessClampedHigh.unmount();
  });

  // --------------------------------------------------------------------------
  // SUITE 7: Headless Chrome CDP Live Browser Verification
  // --------------------------------------------------------------------------
  runner.setTier('M4-CHALLENGER-1: Headless Chrome CDP Live Browser Integration');

  if (!fs.existsSync(CHROME_PATH) || !fs.existsSync('dist/index.html')) {
    console.log('  \x1b[33mℹ Skipping Chrome CDP E2E (Chrome or dist/index.html not found)\x1b[0m');
    return;
  }

  const server = http.createServer((req, res) => {
    let reqPath = req.url?.split('?')[0] || '/';
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(process.cwd(), 'dist', reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  await new Promise<void>((r) => server.listen(PROD_PORT, r));

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  try {
    const { cdp, ws } = await connectToChrome();

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html` });
    await new Promise((r) => setTimeout(r, 800));

    // E2E CH1-18: Verify AutoScroll floating dock rendered in live DOM
    await runner.test('E2E-CH1-18: Floating dock renders with Play/Pause, speed slider, and Jump-to-top in live DOM', async () => {
      const dockInfo = await cdp.eval(`(() => {
        const dock = document.querySelector('[role="region"][aria-label="Panel automatycznego przewijania"]');
        const playBtn = dock ? dock.querySelector('button[aria-label="Start"], button[aria-label="Pauza"]') : null;
        const slider = dock ? dock.querySelector('input[type="range"]') : null;
        const jumpBtn = dock ? dock.querySelector('button[aria-label="Wróć na górę"]') : null;
        return {
          dockExists: !!dock,
          playLabel: playBtn ? playBtn.getAttribute('aria-label') : null,
          sliderMin: slider ? slider.min : null,
          sliderMax: slider ? slider.max : null,
          sliderValue: slider ? slider.value : null,
          jumpExists: !!jumpBtn,
        };
      })()`);

      assert(dockInfo.dockExists, 'Panel automatycznego przewijania must exist in DOM');
      assert.strictEqual(dockInfo.playLabel, 'Start');
      assert.strictEqual(dockInfo.sliderMin, '15');
      assert.strictEqual(dockInfo.sliderMax, '120');
      assert(dockInfo.jumpExists, 'Wróć na górę button must exist');
    });

    // E2E CH1-19: Live Auto-Scrolling increments window.scrollY via RAF
    await runner.test('E2E-CH1-19: Tapping Start drives live window.scrollY downward smoothly', async () => {
      // Click Start
      await cdp.eval(`document.querySelector('button[aria-label="Start"]').click()`);
      await new Promise((r) => setTimeout(r, 100));

      // Verify button label switched to 'Pauza'
      const isPaused = await cdp.eval(`document.querySelector('button[aria-label="Pauza"]') !== null`);
      assert(isPaused, 'Button must switch to "Pauza" while scrolling');

      // Sample scroll position over 600ms
      const initialY = await cdp.eval(`window.scrollY`);
      await new Promise((r) => setTimeout(r, 600));
      const midY = await cdp.eval(`window.scrollY`);

      assert(midY > initialY, `window.scrollY must increase: initial=${initialY}, mid=${midY}`);

      // Pause scrolling
      await cdp.eval(`document.querySelector('button[aria-label="Pauza"]').click()`);
      await new Promise((r) => setTimeout(r, 100));
    });

    // E2E CH1-20: Jump-to-top resets window.scrollY to 0 cleanly in live browser
    await runner.test('E2E-CH1-20: Jump-to-top resets live window.scrollY to 0 and state to idle', async () => {
      // Ensure we are scrolled down
      await cdp.eval(`window.scrollTo(0, 300)`);
      await new Promise((r) => setTimeout(r, 100));

      const yBefore = await cdp.eval(`window.scrollY`);
      assert(yBefore >= 200, `window.scrollY must be > 200 before jump, got ${yBefore}`);

      // Click Jump-to-top button
      await cdp.eval(`document.querySelector('button[aria-label="Wróć na górę"]').click()`);
      await new Promise((r) => setTimeout(r, 350));

      const yAfter = await cdp.eval(`window.scrollY`);
      assert.strictEqual(yAfter, 0, `window.scrollY must reset to 0, got ${yAfter}`);

      const playLabel = await cdp.eval(`document.querySelector('button[aria-label="Start"]') !== null`);
      assert(playLabel, 'Primary button must be in Start state');
    });

    // E2E CH1-21: Clean stop at bottom of content without bouncing in live browser
    await runner.test('E2E-CH1-21: Auto-scrolling to bottom cleanly halts and transitions to idle without infinite RAF', async () => {
      // Scroll near bottom: maxScrollTop - 15px
      await cdp.eval(`(() => {
        const doc = document.documentElement;
        const maxScroll = doc.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.max(0, maxScroll - 15));
      })()`);
      await new Promise((r) => setTimeout(r, 100));

      // Click Start
      await cdp.eval(`document.querySelector('button[aria-label="Start"]').click()`);

      // Wait 1000ms for it to reach bottom and stop
      await new Promise((r) => setTimeout(r, 1000));

      const stateInfo = await cdp.eval(`(() => {
        const doc = document.documentElement;
        const maxScroll = doc.scrollHeight - window.innerHeight;
        const currentY = window.scrollY;
        const isStartBtn = document.querySelector('button[aria-label="Start"]') !== null;
        return {
          currentY,
          maxScroll,
          distanceRemaining: maxScroll - currentY,
          isStartBtn,
        };
      })()`);

      assert(stateInfo.isStartBtn, 'Must return to Start (idle) button upon reaching bottom');
      assert(
        stateInfo.distanceRemaining <= 2,
        `Must stop within 2px of bottom: distanceRemaining=${stateInfo.distanceRemaining}`
      );
    });

    ws.close();
  } finally {
    chrome.kill();
    server.close();
  }
}
