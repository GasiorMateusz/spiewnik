import React from 'react';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunner, assert } from './helpers/test_framework';
import { AutoScroll } from '../src/components/AutoScroll';
import { HookHarness, setGlobalProperty } from './helpers/hook_harness';
import type { AutoScrollProps, AutoScrollState } from '../src/types';

// ============================================================================
// SECTION 1: DETERMINISTIC VIRTUAL BROWSER ENVIRONMENT FOR FSM STRESS TESTING
// ============================================================================

interface VirtualTimer {
  id: number;
  dueTime: number;
  cb: () => void;
  interval?: number;
}

class VirtualBrowserEnvironment {
  public currentTime = 1000.0;
  public scrollY = 0;
  public innerHeight = 800;
  public scrollHeight = 4000;
  public clientHeight = 800;
  public visibilityState: 'visible' | 'hidden' = 'visible';

  public windowListeners = new Map<string, Set<(e: any) => void>>();
  public documentListeners = new Map<string, Set<(e: any) => void>>();

  public activeRafs = new Map<number, (time: number) => void>();
  private nextRafId = 1;

  public activeTimers = new Map<number, VirtualTimer>();
  private nextTimerId = 1;

  private cleanups: Array<() => void> = [];

  install() {
    const self = this;
    this.cleanups.push(
      setGlobalProperty('window', {
        get scrollY() {
          return self.scrollY;
        },
        set scrollY(v: number) {
          self.scrollY = v;
        },
        get innerHeight() {
          return self.innerHeight;
        },
        scrollBy: (_x: number, dy: number) => {
          self.scrollY += dy;
        },
        scrollTo: (opts: { top: number; behavior?: string }) => {
          self.scrollY = opts.top;
        },
        addEventListener: (type: string, handler: (e: any) => void) => {
          if (!self.windowListeners.has(type)) {
            self.windowListeners.set(type, new Set());
          }
          self.windowListeners.get(type)!.add(handler);
        },
        removeEventListener: (type: string, handler: (e: any) => void) => {
          self.windowListeners.get(type)?.delete(handler);
        },
        requestAnimationFrame: (cb: (time: number) => void) => {
          const id = self.nextRafId++;
          self.activeRafs.set(id, cb);
          return id;
        },
        cancelAnimationFrame: (id: number) => {
          self.activeRafs.delete(id);
        },
      })
    );

    this.cleanups.push(
      setGlobalProperty('document', {
        documentElement: {
          get scrollTop() {
            return self.scrollY;
          },
          set scrollTop(v: number) {
            self.scrollY = v;
          },
          get clientHeight() {
            return self.clientHeight;
          },
          get scrollHeight() {
            return self.scrollHeight;
          },
          get offsetHeight() {
            return self.scrollHeight;
          },
        },
        body: {
          get scrollTop() {
            return self.scrollY;
          },
          get scrollHeight() {
            return self.scrollHeight;
          },
        },
        get visibilityState() {
          return self.visibilityState;
        },
        addEventListener: (type: string, handler: (e: any) => void) => {
          if (!self.documentListeners.has(type)) {
            self.documentListeners.set(type, new Set());
          }
          self.documentListeners.get(type)!.add(handler);
        },
        removeEventListener: (type: string, handler: (e: any) => void) => {
          self.documentListeners.get(type)?.delete(handler);
        },
      })
    );

    this.cleanups.push(
      setGlobalProperty('performance', {
        now: () => this.currentTime,
      })
    );

    this.cleanups.push(
      setGlobalProperty('requestAnimationFrame', (cb: (time: number) => void) => {
        const id = this.nextRafId++;
        this.activeRafs.set(id, cb);
        return id;
      })
    );

    this.cleanups.push(
      setGlobalProperty('cancelAnimationFrame', (id: number) => {
        this.activeRafs.delete(id);
      })
    );

    this.cleanups.push(
      setGlobalProperty('setTimeout', (cb: () => void, ms: number) => {
        const id = this.nextTimerId++;
        this.activeTimers.set(id, {
          id,
          dueTime: this.currentTime + ms,
          cb,
        });
        return id as any;
      })
    );

    this.cleanups.push(
      setGlobalProperty('clearTimeout', (id: number) => {
        this.activeTimers.delete(id);
      })
    );

    this.cleanups.push(
      setGlobalProperty('setInterval', (cb: () => void, ms: number) => {
        const id = this.nextTimerId++;
        this.activeTimers.set(id, {
          id,
          dueTime: this.currentTime + ms,
          interval: ms,
          cb,
        });
        return id as any;
      })
    );

    this.cleanups.push(
      setGlobalProperty('clearInterval', (id: number) => {
        this.activeTimers.delete(id);
      })
    );
  }

  uninstall() {
    while (this.cleanups.length > 0) {
      const cleanup = this.cleanups.pop();
      if (cleanup) cleanup();
    }
  }

  advanceTime(ms: number) {
    const targetTime = this.currentTime + ms;
    while (true) {
      // Find the earliest due timer at or before targetTime
      let earliest: VirtualTimer | null = null;
      for (const timer of this.activeTimers.values()) {
        if (timer.dueTime <= targetTime) {
          if (!earliest || timer.dueTime < earliest.dueTime) {
            earliest = timer;
          }
        }
      }

      if (!earliest) {
        break;
      }

      this.currentTime = earliest.dueTime;
      if (earliest.interval !== undefined) {
        // Reschedule recurring interval
        earliest.dueTime = this.currentTime + earliest.interval;
      } else {
        // One-shot timeout
        this.activeTimers.delete(earliest.id);
      }

      earliest.cb();
    }
    this.currentTime = targetTime;
  }

  stepRaf(dt: number = 16.6667) {
    this.currentTime += dt;
    const callbacks = Array.from(this.activeRafs.values());
    this.activeRafs.clear();
    for (const cb of callbacks) {
      cb(this.currentTime);
    }
  }

  dispatchWindowEvent(type: string, target?: any) {
    const listeners = this.windowListeners.get(type);
    if (!listeners || listeners.size === 0) return;
    const event = {
      type,
      target: target || (globalThis as any).window,
      defaultPrevented: false,
    };
    for (const handler of Array.from(listeners)) {
      handler(event);
    }
  }

  dispatchDocumentEvent(type: string) {
    const listeners = this.documentListeners.get(type);
    if (!listeners) return;
    const event = { type };
    for (const handler of Array.from(listeners)) {
      handler(event);
    }
  }

  getActiveTimeoutCount(): number {
    let count = 0;
    for (const t of this.activeTimers.values()) {
      if (t.interval === undefined) count++;
    }
    return count;
  }

  getActiveIntervalCount(): number {
    let count = 0;
    for (const t of this.activeTimers.values()) {
      if (t.interval !== undefined) count++;
    }
    return count;
  }

  getWindowListenerCount(type: string): number {
    return this.windowListeners.get(type)?.size ?? 0;
  }
}

// Mock DOM elements for dock isolation testing
class MockElement {
  public isInsideDock: boolean;
  public name: string;
  constructor(name: string, isInsideDock: boolean) {
    this.name = name;
    this.isInsideDock = isInsideDock;
  }
  contains(node: any): boolean {
    if (!node) return false;
    if (node === this) return true;
    return Boolean(node.isInsideDock);
  }
}

function findInJsx(node: any, predicate: (node: any) => boolean): any {
  if (!node) return null;
  if (predicate(node)) return node;
  if (node.props && node.props.children) {
    const children = Array.isArray(node.props.children)
      ? node.props.children
      : [node.props.children];
    for (const child of children) {
      const found = findInJsx(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

// Test harness wrapping AutoScroll component
class AutoScrollTestRig {
  public env: VirtualBrowserEnvironment;
  public harness: HookHarness<AutoScrollProps, React.JSX.Element>;
  public states: AutoScrollState[] = [];
  public speeds: number[] = [];
  public mockDock: MockElement;
  public sliderElement: MockElement;
  public playBtnElement: MockElement;
  public jumpBtnElement: MockElement;
  public outsideElement: MockElement;

  constructor(env: VirtualBrowserEnvironment, initialProps: Partial<AutoScrollProps> = {}) {
    this.env = env;
    this.mockDock = new MockElement('dock', true);
    this.sliderElement = new MockElement('slider', true);
    this.playBtnElement = new MockElement('playBtn', true);
    this.jumpBtnElement = new MockElement('jumpBtn', true);
    this.outsideElement = new MockElement('lyricsContainer', false);

    const mergedProps: AutoScrollProps = {
      initialSpeed: 30,
      ...initialProps,
      onStateChange: (s) => {
        this.states.push(s);
        initialProps.onStateChange?.(s);
      },
      onSpeedChange: (spd) => {
        this.speeds.push(spd);
        initialProps.onSpeedChange?.(spd);
      },
    };

    this.harness = new HookHarness((p) => AutoScroll(p), mergedProps);
    this.render();
  }

  render() {
    const jsx = this.harness.render();
    // Connect mock dock ref
    const refProp = jsx.props?.ref || (jsx as any).ref;
    if (refProp && typeof refProp === 'object') {
      refProp.current = this.mockDock;
    }
    return jsx;
  }

  get currentState(): AutoScrollState {
    return this.states.length > 0 ? this.states[this.states.length - 1] : 'idle';
  }

  clickPlayPause() {
    const jsx = this.render();
    const btn = findInJsx(
      jsx,
      (n) =>
        n?.type === 'button' &&
        (n?.props?.['aria-label'] === 'Start' || n?.props?.['aria-label'] === 'Pauza') &&
        typeof n?.props?.className === 'string' &&
        n.props.className.includes('bg-amber-500')
    );
    assert(btn, 'Main Play/Pause button not found in JSX');
    btn.props.onClick();
    this.render();
  }

  clickExplicitStop() {
    const jsx = this.render();
    const btn = findInJsx(jsx, (n) => n?.props?.title === 'Zatrzymaj automatyczne przewijanie');
    assert(btn, 'Zatrzymaj button not found in interrupted badge');
    btn.props.onClick();
    this.render();
  }

  clickJumpToTop() {
    const jsx = this.render();
    const btn = findInJsx(jsx, (n) => n?.props?.['aria-label'] === 'Wróć na górę');
    assert(btn, 'Jump-to-top button not found in JSX');
    btn.props.onClick();
    this.render();
  }

  changeSpeed(newSpeed: number) {
    const jsx = this.render();
    const input = findInJsx(jsx, (n) => n?.type === 'input' && n?.props?.type === 'range');
    assert(input, 'Speed range input not found in JSX');
    input.props.onChange({ target: { value: String(newSpeed) } });
    this.render();
  }

  getCountdownText(): string | null {
    const jsx = this.render();
    const badge = findInJsx(
      jsx,
      (n) => typeof n?.props?.children === 'string' && n.props.children.includes('Wznowienie za')
    );
    if (badge) return badge.props.children;
    // Check nested spans
    const spans = findInJsx(
      jsx,
      (n) => Array.isArray(n?.props?.children) && n.props.children.some((c: any) => typeof c === 'string' && c.includes('Wznowienie za'))
    );
    if (spans) {
      return spans.props.children.join('');
    }
    return null;
  }

  triggerScreenGesture(type: 'touchstart' | 'touchmove' | 'wheel' | 'pointerdown') {
    this.env.dispatchWindowEvent(type, this.outsideElement);
    this.render();
  }

  triggerDockGesture(type: 'touchstart' | 'touchmove' | 'wheel' | 'pointerdown', element: MockElement = this.mockDock) {
    this.env.dispatchWindowEvent(type, element);
    this.render();
  }

  unmount() {
    this.harness.unmount();
  }
}

// ============================================================================
// CHROME CDP CLIENT FOR LIVE BROWSER TESTS
// ============================================================================

const PROD_PORT = 4184;
const CHROME_PORT = 9234;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
// MAIN EMPIRICAL CHALLENGER TEST SUITE
// ============================================================================

export async function runM4Challenger2EmpiricalTests(runner: TestRunner) {
  // --------------------------------------------------------------------------
  // SUITE 1: STRICT 3-STATE STATE MACHINE TRANSITIONS
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger M4 — Strict 3-State FSM Transitions');

  await runner.test('SM-01: Initial state is strictly "idle" with 0 active timers and 0 active RAF loops', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      assert.strictEqual(rig.currentState, 'idle', 'Initial state must be idle');
      assert.strictEqual(env.activeRafs.size, 0, 'No RAF loop should run in idle state');
      assert.strictEqual(env.getActiveTimeoutCount(), 0, 'No timeout should be active in idle state');
      assert.strictEqual(env.getActiveIntervalCount(), 0, 'No countdown interval should be active in idle state');
      assert.strictEqual(env.getWindowListenerCount('touchstart'), 0, 'No window gesture listeners attached in idle state');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('SM-02: Transition "idle" -> "scrolling" upon Start button click with RAF armed', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();

      assert.strictEqual(rig.currentState, 'scrolling', 'State must transition to scrolling on Start');
      assert.strictEqual(env.activeRafs.size, 1, 'RAF loop must be actively scheduled');
      assert.strictEqual(env.getActiveTimeoutCount(), 0, 'No auto-resume timer should be scheduled while scrolling');
      assert.strictEqual(env.getWindowListenerCount('touchstart'), 1, 'Touch listener attached to window');
      assert.strictEqual(env.getWindowListenerCount('wheel'), 1, 'Wheel listener attached to window');
      assert.strictEqual(env.getWindowListenerCount('pointerdown'), 1, 'Pointerdown listener attached to window');

      // Step 3 RAF frames and verify downward scroll progress
      const initialScrollY = env.scrollY;
      env.stepRaf(16.6667);
      env.stepRaf(16.6667);
      env.stepRaf(16.6667);
      assert(env.scrollY >= initialScrollY, 'Scroll position must advance downward during scrolling RAF loop');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('SM-03: Transition "scrolling" -> "interrupted" on touchstart gesture outside dock', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      assert.strictEqual(rig.currentState, 'scrolling');

      // Dispatch touchstart on song content outside the dock
      rig.triggerScreenGesture('touchstart');

      assert.strictEqual(rig.currentState, 'interrupted', 'State must immediately become interrupted on touchstart');
      assert.strictEqual(env.activeRafs.size, 0, 'Active RAF loop must immediately stop on interruption');
      assert.strictEqual(env.getActiveTimeoutCount(), 1, '3-second auto-resume timer must be armed');
      assert.strictEqual(env.getActiveIntervalCount(), 1, '1-second countdown interval must be armed');

      const countdownText = rig.getCountdownText();
      assert(countdownText && countdownText.includes('3'), `Countdown badge must show initial 3s countdown, got: ${countdownText}`);
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('SM-04: Transition "scrolling" -> "interrupted" across wheel, pointerdown, and touchmove gestures', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const gestures: Array<'wheel' | 'pointerdown' | 'touchmove'> = ['wheel', 'pointerdown', 'touchmove'];
      for (const gesture of gestures) {
        const rig = new AutoScrollTestRig(env);
        rig.clickPlayPause();
        assert.strictEqual(rig.currentState, 'scrolling');

        rig.triggerScreenGesture(gesture);
        assert.strictEqual(rig.currentState, 'interrupted', `State must transition to interrupted on ${gesture}`);
        assert.strictEqual(env.activeRafs.size, 0, `RAF loop must stop on ${gesture}`);
        assert.strictEqual(env.getActiveTimeoutCount(), 1, `Auto-resume timer armed on ${gesture}`);
        rig.unmount();
      }
    } finally {
      env.uninstall();
    }
  });

  await runner.test('SM-05: Transition "interrupted" -> "scrolling" automatically after 3000ms inactivity', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');
      assert.strictEqual(rig.currentState, 'interrupted');

      // T = 1000ms: countdown decrements to 2s
      env.advanceTime(1000);
      rig.render();
      assert.strictEqual(rig.currentState, 'interrupted');
      let countdown = rig.getCountdownText();
      assert(countdown && countdown.includes('2'), `Countdown at 1000ms must be 2s, got: ${countdown}`);

      // T = 2000ms: countdown decrements to 1s
      env.advanceTime(1000);
      rig.render();
      assert.strictEqual(rig.currentState, 'interrupted');
      countdown = rig.getCountdownText();
      assert(countdown && countdown.includes('1'), `Countdown at 2000ms must be 1s, got: ${countdown}`);

      // T = 3000ms: timer expires, auto-resumes to 'scrolling'
      env.advanceTime(1000);
      rig.render();
      assert.strictEqual(rig.currentState, 'scrolling', 'State must automatically transition to scrolling at 3000ms');
      assert.strictEqual(env.activeRafs.size, 1, 'RAF loop must be re-initiated on auto-resume');
      assert.strictEqual(env.getActiveTimeoutCount(), 0, 'Auto-resume timer must be cleared');
      assert.strictEqual(rig.getCountdownText(), null, 'Countdown banner must disappear once scrolling resumes');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('SM-06: Transition "scrolling" -> "idle" on explicit Pause (permanently stops auto-resume)', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause(); // Start
      assert.strictEqual(rig.currentState, 'scrolling');

      // Explicit pause click
      rig.clickPlayPause(); // Pause
      assert.strictEqual(rig.currentState, 'idle', 'Explicit pause must set state to idle');
      assert.strictEqual(env.activeRafs.size, 0, 'RAF loop must stop permanently');
      assert.strictEqual(env.getActiveTimeoutCount(), 0, 'No auto-resume timer should exist');

      // Advance time by 5000ms: must remain idle permanently
      env.advanceTime(5000);
      assert.strictEqual(rig.currentState, 'idle', 'State must remain idle permanently after explicit pause');
      assert.strictEqual(env.activeRafs.size, 0);
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('SM-07: Transition "interrupted" -> "idle" on explicit Pause ("Zatrzymaj" button)', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');
      assert.strictEqual(rig.currentState, 'interrupted');
      assert.strictEqual(env.getActiveTimeoutCount(), 1);

      // User taps "Zatrzymaj" button in interrupted banner
      rig.clickExplicitStop();
      assert.strictEqual(rig.currentState, 'idle', 'Tapping Zatrzymaj must transition to idle');
      assert.strictEqual(env.getActiveTimeoutCount(), 0, 'Auto-resume timer must be canceled');
      assert.strictEqual(env.getActiveIntervalCount(), 0, 'Countdown interval must be canceled');

      // Advance time by 10000ms: must NOT auto-resume
      env.advanceTime(10000);
      assert.strictEqual(rig.currentState, 'idle', 'State must remain idle after explicit Zatrzymaj tap');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('SM-08: Transition Jump-to-top -> "idle" from both "scrolling" and "interrupted" states', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      // 1. From scrolling state
      const rig1 = new AutoScrollTestRig(env);
      env.scrollY = 500;
      rig1.clickPlayPause();
      assert.strictEqual(rig1.currentState, 'scrolling');

      rig1.clickJumpToTop();
      assert.strictEqual(rig1.currentState, 'idle', 'Jump to top from scrolling must transition to idle');
      assert.strictEqual(env.scrollY, 0, 'Scroll position must be reset to 0');
      assert.strictEqual(env.activeRafs.size, 0, 'RAF loop must be canceled');
      rig1.unmount();

      // 2. From interrupted state
      const rig2 = new AutoScrollTestRig(env);
      env.scrollY = 350;
      rig2.clickPlayPause();
      rig2.triggerScreenGesture('touchstart');
      assert.strictEqual(rig2.currentState, 'interrupted');

      rig2.clickJumpToTop();
      assert.strictEqual(rig2.currentState, 'idle', 'Jump to top from interrupted must transition to idle');
      assert.strictEqual(env.scrollY, 0, 'Scroll position must be reset to 0');
      assert.strictEqual(env.getActiveTimeoutCount(), 0, 'Auto-resume timer must be canceled');

      // Advance time to verify no phantom resume occurs
      env.advanceTime(4000);
      assert.strictEqual(rig2.currentState, 'idle', 'State must remain idle');
      rig2.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('SM-09: Transition "interrupted" -> "scrolling" immediately on Play button tap', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');
      assert.strictEqual(rig.currentState, 'interrupted');

      // At t=500ms, user hits Play button (resumes immediately without waiting full 3000ms)
      env.advanceTime(500);
      rig.clickPlayPause();
      assert.strictEqual(rig.currentState, 'scrolling', 'Tapping Play when interrupted must resume immediately');
      assert.strictEqual(env.activeRafs.size, 1, 'RAF loop resumes immediately');
      assert.strictEqual(env.getActiveTimeoutCount(), 0, 'Countdown timer cleared');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 2: DOCK CONTROL EVENT ISOLATION
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger M4 — Dock Control Event Isolation');

  await runner.test('ISO-01: Dispatched pointerdown/touchstart on speed slider does NOT interrupt scrolling', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      assert.strictEqual(rig.currentState, 'scrolling');

      // User drags speed slider: dispatch events targeting slider element inside dock
      rig.triggerDockGesture('pointerdown', rig.sliderElement);
      assert.strictEqual(rig.currentState, 'scrolling', 'pointerdown on slider must NOT trigger interruption');

      rig.triggerDockGesture('touchstart', rig.sliderElement);
      assert.strictEqual(rig.currentState, 'scrolling', 'touchstart on slider must NOT trigger interruption');

      rig.triggerDockGesture('touchmove', rig.sliderElement);
      assert.strictEqual(rig.currentState, 'scrolling', 'touchmove on slider must NOT trigger interruption');

      assert.strictEqual(env.activeRafs.size, 1, 'RAF loop must keep running uninterrupted');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('ISO-02: Dispatched events on dock buttons and nested SVG elements do NOT interrupt scrolling', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      assert.strictEqual(rig.currentState, 'scrolling');

      // Dispatched gestures on dock buttons
      rig.triggerDockGesture('pointerdown', rig.playBtnElement);
      assert.strictEqual(rig.currentState, 'scrolling');

      rig.triggerDockGesture('touchstart', rig.jumpBtnElement);
      assert.strictEqual(rig.currentState, 'scrolling');

      // Nested SVG path inside dock
      const nestedSvgElement = new MockElement('svgPath', true);
      rig.triggerDockGesture('touchstart', nestedSvgElement);
      assert.strictEqual(rig.currentState, 'scrolling', 'Nested SVG in dock must be isolated');

      // But outside gesture DOES interrupt immediately
      rig.triggerScreenGesture('touchstart');
      assert.strictEqual(rig.currentState, 'interrupted', 'Outside gesture must interrupt');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('ISO-03: Dynamic velocity modification while scrolling updates speed immediately without loop reset', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      let speedChangeReceived = 0;
      const rig = new AutoScrollTestRig(env, {
        initialSpeed: 30,
        onSpeedChange: (s) => {
          speedChangeReceived = s;
        },
      });

      rig.clickPlayPause();
      assert.strictEqual(rig.currentState, 'scrolling');

      // Change speed slider to 90 px/s
      rig.changeSpeed(90);
      assert.strictEqual(speedChangeReceived, 90, 'onSpeedChange callback received updated velocity');
      assert.strictEqual(rig.currentState, 'scrolling', 'State remains scrolling during slider change');
      assert.strictEqual(env.activeRafs.size, 1, 'RAF loop remains active without restart');

      // Run RAF step at 90 px/s: delta for 100ms should be (90 * 0.1) = 9px
      const beforeScroll = env.scrollY;
      env.stepRaf(100);
      env.stepRaf(100);
      assert(env.scrollY > beforeScroll, 'Scroll moved at new higher velocity');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 3: 3-SECOND INACTIVITY TIMER DEBOUNCE & RACE CONDITIONS
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger M4 — Timer Debounce & Race Conditions');

  await runner.test('DEB-01: Successive screen gestures during interruption reset 3000ms timer', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');
      assert.strictEqual(rig.currentState, 'interrupted');

      // Advance to t = 1800ms
      env.advanceTime(1800);
      assert.strictEqual(rig.currentState, 'interrupted');

      // User flicks screen again at t = 1800ms: must debounce/reset 3s timer
      rig.triggerScreenGesture('touchmove');
      assert.strictEqual(rig.currentState, 'interrupted');

      // Advance by 1500ms (t = 3300ms from start, but only 1500ms from flick): must NOT resume yet!
      env.advanceTime(1500);
      assert.strictEqual(rig.currentState, 'interrupted', 'Timer must NOT have expired at 3300ms');

      // Advance by remaining 1500ms (t = 4800ms from start, exactly 3000ms from flick): resumes!
      env.advanceTime(1500);
      assert.strictEqual(rig.currentState, 'scrolling', 'Timer must resume exactly 3000ms after last gesture');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('DEB-02: High-frequency gesture burst (30 events) debounces cleanly with zero orphaned timers', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');

      // High-throughput gesture burst: 30 events spaced 20ms apart (600ms total)
      for (let i = 0; i < 30; i++) {
        env.advanceTime(20);
        rig.triggerScreenGesture('touchmove');
      }

      assert.strictEqual(rig.currentState, 'interrupted');
      assert.strictEqual(env.getActiveTimeoutCount(), 1, 'Strictly 1 active timeout allowed despite 30 gestures');
      assert.strictEqual(env.getActiveIntervalCount(), 1, 'Strictly 1 active countdown interval allowed');

      // 2500ms after burst: still interrupted
      env.advanceTime(2500);
      assert.strictEqual(rig.currentState, 'interrupted');

      // 3000ms after burst: resumes
      env.advanceTime(500);
      assert.strictEqual(rig.currentState, 'scrolling', 'Resumes 3000ms after final gesture in burst');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('DEB-03: Race condition test: gesture at t=2990ms (10ms before expiration) resets timer', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');

      // Advance to 2990ms (just 10ms before the 3000ms timer fires)
      env.advanceTime(2990);
      assert.strictEqual(rig.currentState, 'interrupted');

      // Gesture lands at 2990ms
      rig.triggerScreenGesture('wheel');

      // Advance 20ms to 3010ms: previous timer would have fired, but reset timer must NOT fire!
      env.advanceTime(20);
      assert.strictEqual(rig.currentState, 'interrupted', 'Timer must have been reset; must not fire at 3010ms');

      // Advance another 2980ms to t=5990ms (3000ms from last gesture): resumes!
      env.advanceTime(2980);
      assert.strictEqual(rig.currentState, 'scrolling', 'Resumes exactly 3000ms from the 2990ms gesture');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('DEB-04: Race condition test: explicit pause at t=2990ms successfully halts auto-resume', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');

      env.advanceTime(2990);
      assert.strictEqual(rig.currentState, 'interrupted');

      // User taps Zatrzymaj at 2990ms
      rig.clickExplicitStop();
      assert.strictEqual(rig.currentState, 'idle');
      assert.strictEqual(env.getActiveTimeoutCount(), 0);

      // Advance by 1000ms: must remain idle
      env.advanceTime(1000);
      assert.strictEqual(rig.currentState, 'idle');
      assert.strictEqual(env.activeRafs.size, 0);
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 4: POSITION RESYNCHRONIZATION & ACCUMULATOR MATH
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger M4 — Position Resync & Accumulator Math');

  await runner.test('RESYNC-01: Manual scrolling during interruption updates accumulator baseline (no snap-back)', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env, { initialSpeed: 30 });
      env.scrollY = 100;

      // Start scrolling and let RAF run 3 frames
      rig.clickPlayPause();
      env.stepRaf(100);
      env.stepRaf(100);
      const scrollBeforeInterruption = env.scrollY;
      assert(scrollBeforeInterruption > 100, 'Scroll should have moved past 100');

      // Interruption occurs
      rig.triggerScreenGesture('touchstart');
      assert.strictEqual(rig.currentState, 'interrupted');

      // During 3s pause, musician manually scrolls way down to 850px
      env.scrollY = 850;

      // Auto-resume fires at 3000ms
      env.advanceTime(3000);
      assert.strictEqual(rig.currentState, 'scrolling');

      // Step RAF: baseline must be 850, it MUST NOT snap back to scrollBeforeInterruption (~105px)!
      env.stepRaf(100); // 30 px/s * 0.1s = 3px
      env.stepRaf(100);
      assert(
        env.scrollY >= 850,
        `Scroll must advance smoothly from manual position 850px, actual scrollY: ${env.scrollY}`
      );
      assert(
        env.scrollY < 870,
        `Scroll must NOT leap wildly, actual scrollY: ${env.scrollY}`
      );
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('RESYNC-02: Manual scroll to bottom during interruption causes auto-resume to transition to "idle"', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      env.scrollHeight = 2000;
      env.clientHeight = 800;
      // maxScrollTop = 2000 - 800 = 1200px

      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');
      assert.strictEqual(rig.currentState, 'interrupted');

      // User manually scrolls all the way to bottom (1200px)
      env.scrollY = 1200;

      // 3s expires: auto-resume checks bottom boundary
      env.advanceTime(3000);
      assert.strictEqual(
        rig.currentState,
        'idle',
        'Auto-resuming while already at bottom must transition directly to idle'
      );
      assert.strictEqual(env.activeRafs.size, 0, 'No RAF loop should run');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('RESYNC-03: Clean bottom detection ($y + vh >= h - 2) halts RAF loop and transitions to "idle"', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env, { initialSpeed: 60 });
      env.scrollHeight = 1000;
      env.clientHeight = 800;
      // maxScrollTop = 200px. Boundary is 198px (distanceRemaining <= 2)
      env.scrollY = 195;

      rig.clickPlayPause();
      assert.strictEqual(rig.currentState, 'scrolling');

      // Tick 1: establishes RAF timestamp baseline
      env.stepRaf(100);
      // Tick 2: advances by 6px (195 + 6 = 201 >= 198px boundary) -> reaches bottom and stops
      env.stepRaf(100);

      assert.strictEqual(
        rig.currentState,
        'idle',
        'Reaching bottom boundary must cleanly transition state to idle'
      );
      assert.strictEqual(env.activeRafs.size, 0, 'RAF loop must be stopped');
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('RESYNC-04: Sub-pixel accumulator prevents stalling at 15 px/s minimum velocity', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env, { initialSpeed: 15 });
      env.scrollY = 0;
      rig.clickPlayPause();
      assert.strictEqual(rig.currentState, 'scrolling');

      // At 15 px/s and 16.6667ms per frame: delta is exactly 0.25px per frame
      // With integer truncation, delta would be 0 and scroll would permanently freeze.
      // With sub-pixel accumulator:
      // Tick 1: establishes RAF timestamp baseline (accumulated = 0)
      // Tick 2: acc = 0.25 -> scroll 0
      // Tick 3: acc = 0.50 -> scroll 0
      // Tick 4: acc = 0.75 -> scroll 0
      // Tick 5: acc = 1.00 -> scrolls 1 physical integer pixel!
      env.stepRaf(16.6667); // baseline
      env.stepRaf(16.6667); // acc = 0.25
      env.stepRaf(16.6667); // acc = 0.50
      env.stepRaf(16.6667); // acc = 0.75
      env.stepRaf(16.6667); // acc = 1.00 -> scroll 1px!

      assert.strictEqual(
        env.scrollY,
        1,
        `Sub-pixel accumulator must advance integer scroll after 4 delta frames at 15 px/s, got: ${env.scrollY}`
      );
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('RESYNC-05: Delta-t clamp (<= 100ms) prevents runaway scroll leaps on tab re-entry', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env, { initialSpeed: 60 });
      env.scrollY = 100;
      rig.clickPlayPause();
      env.stepRaf(16.6667); // establish baseline

      // Simulate returning from background tab with huge 5000ms time jump
      const beforeLeap = env.scrollY;
      env.stepRaf(5000); // 5 seconds elapsed

      // Without clamp: 60 px/s * 5s = 300px jump!
      // With 100ms clamp: max jump is 60 px/s * 0.1s = 6px!
      const deltaScrolled = env.scrollY - beforeLeap;
      assert(
        deltaScrolled <= 8,
        `Scroll leap must be clamped to <= 100ms equivalent (expected <= 8px, got ${deltaScrolled}px)`
      );
      rig.unmount();
    } finally {
      env.uninstall();
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 5: CLEAN TEARDOWN & LIFECYCLE AUDIT
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger M4 — Clean Teardown & Lifecycle Audit');

  await runner.test('CLEAN-01: Unmounting while "scrolling" cleans up RAF and all window listeners', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      assert.strictEqual(rig.currentState, 'scrolling');
      assert.strictEqual(env.activeRafs.size, 1);
      assert.strictEqual(env.getWindowListenerCount('touchstart'), 1);

      // Unmount
      rig.unmount();

      assert.strictEqual(env.activeRafs.size, 0, 'Active RAF must be canceled on unmount');
      assert.strictEqual(env.getActiveTimeoutCount(), 0, 'No active timeouts after unmount');
      assert.strictEqual(env.getWindowListenerCount('touchstart'), 0, 'Touch listener removed');
      assert.strictEqual(env.getWindowListenerCount('wheel'), 0, 'Wheel listener removed');
      assert.strictEqual(env.getWindowListenerCount('pointerdown'), 0, 'Pointerdown listener removed');
    } finally {
      env.uninstall();
    }
  });

  await runner.test('CLEAN-02: Unmounting while "interrupted" cleans up timeout and countdown interval', () => {
    const env = new VirtualBrowserEnvironment();
    env.install();
    try {
      const rig = new AutoScrollTestRig(env);
      rig.clickPlayPause();
      rig.triggerScreenGesture('touchstart');
      assert.strictEqual(rig.currentState, 'interrupted');
      assert.strictEqual(env.getActiveTimeoutCount(), 1);
      assert.strictEqual(env.getActiveIntervalCount(), 1);

      // Unmount while interrupted
      rig.unmount();

      assert.strictEqual(env.getActiveTimeoutCount(), 0, '3s auto-resume timeout must be cleared on unmount');
      assert.strictEqual(env.getActiveIntervalCount(), 0, '1s countdown interval must be cleared on unmount');
      assert.strictEqual(env.getWindowListenerCount('touchstart'), 0, 'Window listeners must be removed');

      // Advance time by 5000ms: ensure no callbacks fire after unmount
      env.advanceTime(5000);
      assert.strictEqual(env.activeRafs.size, 0, 'No orphaned RAF loop spawned after unmount');
    } finally {
      env.uninstall();
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 6: REAL BROWSER CDP E2E VERIFICATION (HEADLESS CHROME)
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger M4 — Headless Chrome CDP Live Verification');

  if (!fs.existsSync(CHROME_PATH) || !fs.existsSync('dist/index.html')) {
    console.log('  \x1b[33mℹ Skipping Chrome CDP live verification (Chrome or dist/index.html not found)\x1b[0m');
    return;
  }

  // Create static HTTP server for production build
  const server = http.createServer((req, res) => {
    let reqPath = req.url?.split('?')[0] || '/';
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(process.cwd(), 'dist', reqPath.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime = (ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream');
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise<void>((resolve) => server.listen(PROD_PORT, resolve));

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=375,812', // standard mobile viewport (iPhone X/13/14)
    `http://127.0.0.1:${PROD_PORT}`,
  ]);

  try {
    const { cdp, ws } = await connectToChrome();

    // Navigate to song viewer
    await cdp.eval(`
      new Promise((resolve) => {
        window.location.hash = '#/song/wehiku-czasu';
        setTimeout(resolve, 350);
      })
    `);

    await runner.test('CDP-01: AutoScroll dock renders on live page with Polish accessibility semantics', async () => {
      const hasDock = await cdp.eval(`
        Boolean(document.querySelector('[role="region"][aria-label="Panel automatycznego przewijania"]'))
      `);
      assert(hasDock, 'Panel automatycznego przewijania floating dock must be present in DOM');

      const playBtn = await cdp.eval(`
        Boolean(document.querySelector('button[aria-label="Start"]'))
      `);
      assert(playBtn, 'Start button with Polish aria-label="Start" must be present');

      const slider = await cdp.eval(`
        Boolean(document.querySelector('input[type="range"][aria-label="Prędkość przewijania"]'))
      `);
      assert(slider, 'Speed slider with Polish aria-label="Prędkość przewijania" must be present');

      const jumpBtn = await cdp.eval(`
        Boolean(document.querySelector('button[aria-label="Wróć na górę"]'))
      `);
      assert(jumpBtn, 'Jump to top button with Polish aria-label="Wróć na górę" must be present');
    });

    await runner.test('CDP-02: Touch targets >= 40x40px on mobile viewport', async () => {
      const dimensions = await cdp.eval(`
        (() => {
          const startBtn = document.querySelector('button[aria-label="Start"]');
          const jumpBtn = document.querySelector('button[aria-label="Wróć na górę"]');
          const slider = document.querySelector('input[type="range"][aria-label="Prędkość przewijania"]');
          const sRect = startBtn ? startBtn.getBoundingClientRect() : null;
          const jRect = jumpBtn ? jumpBtn.getBoundingClientRect() : null;
          const slRect = slider ? slider.getBoundingClientRect() : null;
          return {
            start: sRect ? { w: sRect.width, h: sRect.height } : null,
            jump: jRect ? { w: jRect.width, h: jRect.height } : null,
            slider: slRect ? { w: slRect.width, h: slRect.height } : null,
          };
        })()
      `);
      assert(dimensions.start && dimensions.start.w >= 40 && dimensions.start.h >= 40, `Start button < 40px: ${JSON.stringify(dimensions.start)}`);
      assert(dimensions.jump && dimensions.jump.w >= 40 && dimensions.jump.h >= 40, `Jump button < 40px: ${JSON.stringify(dimensions.jump)}`);
    });

    await runner.test('CDP-03: Clicking Start smoothly drives scrolling and changes button to "Pauza"', async () => {
      await cdp.eval(`
        (() => {
          const btn = document.querySelector('button[aria-label="Start"]');
          if (btn) btn.click();
        })()
      `);

      // Let autoscroll run for 400ms
      await new Promise((r) => setTimeout(r, 400));

      const scrollY = await cdp.eval(`window.scrollY`);
      const hasPauseBtn = await cdp.eval(`Boolean(document.querySelector('button[aria-label="Pauza"]'))`);

      assert(scrollY > 0, `AutoScroll must have moved scroll position down, actual: ${scrollY}`);
      assert(hasPauseBtn, 'Button must toggle to aria-label="Pauza" during scrolling');
    });

    await runner.test('CDP-04: Real touch gesture on lyrics pauses movement and displays countdown badge', async () => {
      // Dispatch pointerdown gesture on song content container
      await cdp.eval(`
        (() => {
          const songCard = document.querySelector('main') || document.body;
          const ev = new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            clientX: 150,
            clientY: 300,
          });
          songCard.dispatchEvent(ev);
        })()
      `);

      await new Promise((r) => setTimeout(r, 100));

      const hasCountdown = await cdp.eval(`
        (() => {
          const badge = document.querySelector('.animate-pulse');
          const bodyText = document.body.innerText;
          return Boolean((badge && badge.textContent.includes('Wznowienie za')) || bodyText.includes('Wznowienie za'));
        })()
      `);
      assert(hasCountdown, 'Interrupted countdown badge "Wznowienie za..." must be visible');
    });

    await runner.test('CDP-05: Inactivity for 3s in browser automatically resumes scrolling', async () => {
      const scrollBefore = await cdp.eval(`window.scrollY`);

      // Wait 3200ms for auto-resume
      await new Promise((r) => setTimeout(r, 3300));

      // After auto-resume, let it scroll for 300ms
      await new Promise((r) => setTimeout(r, 300));

      const scrollAfter = await cdp.eval(`window.scrollY`);
      const isScrolling = await cdp.eval(`Boolean(document.querySelector('button[aria-label="Pauza"]'))`);

      assert(scrollAfter > scrollBefore, `Auto-resume should have scrolled further (before: ${scrollBefore}, after: ${scrollAfter})`);
      assert(isScrolling, 'Play button must be back to "Pauza" state');
    });

    await runner.test('CDP-06: Explicit Pause button permanently halts scrolling', async () => {
      await cdp.eval(`
        (() => {
          const btn = document.querySelector('button[aria-label="Pauza"]');
          if (btn) btn.click();
        })()
      `);

      await new Promise((r) => setTimeout(r, 100));
      const scrollFrozen = await cdp.eval(`window.scrollY`);

      // Wait 1000ms: scroll position must remain frozen
      await new Promise((r) => setTimeout(r, 1000));
      const scrollAfterWait = await cdp.eval(`window.scrollY`);
      const hasStartBtn = await cdp.eval(`Boolean(document.querySelector('button[aria-label="Start"]'))`);

      assert.strictEqual(scrollAfterWait, scrollFrozen, 'Scroll must remain frozen after explicit pause');
      assert(hasStartBtn, 'Button must show "Start" in idle state');
    });

    await runner.test('CDP-07: Jump-to-top button returns scroll position to top and enters idle', async () => {
      // Ensure we are not at 0
      await cdp.eval(`window.scrollTo(0, 400)`);
      assert((await cdp.eval(`window.scrollY`)) > 0);

      await cdp.eval(`
        (() => {
          const jumpBtn = document.querySelector('button[aria-label="Wróć na górę"]');
          if (jumpBtn) jumpBtn.click();
        })()
      `);

      // Wait for smooth scroll to finish
      await new Promise((r) => setTimeout(r, 500));
      const finalScrollY = await cdp.eval(`window.scrollY`);
      const hasStartBtn = await cdp.eval(`Boolean(document.querySelector('button[aria-label="Start"]'))`);

      assert.strictEqual(finalScrollY, 0, `Jump to top must reset scrollY to 0, got: ${finalScrollY}`);
      assert(hasStartBtn, 'Must enter idle state with Start button');
    });

    ws.close();
  } finally {
    chromeProc.kill('SIGKILL');
    server.close();
  }
}
