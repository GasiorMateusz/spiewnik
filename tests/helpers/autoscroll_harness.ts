import React from 'react';
import { AutoScroll } from '../../src/components/AutoScroll';
import type { AutoScrollProps, AutoScrollState } from '../../src/types';
import { HookHarness, setGlobalProperty } from './hook_harness';

export interface MockEvent {
  type: string;
  target?: any;
  defaultPrevented?: boolean;
}

export class MockScrollEnvironment {
  public scrollY: number = 0;
  public innerHeight: number = 800;
  public scrollHeight: number = 2400;
  public visibilityState: 'visible' | 'hidden' = 'visible';

  public currentTime: number = 1000.0;
  private rafSeq = 1;
  private rafCallbacks = new Map<number, (time: number) => void>();

  private timerSeq = 1;
  private timers = new Map<number, { due: number; cb: Function; interval?: number }>();

  public windowListeners: Record<string, Function[]> = {};
  public documentListeners: Record<string, Function[]> = {};

  public mockDockNode = {
    __isDock: true,
    contains: (node: any) => {
      if (!node) return false;
      if (node === this.mockDockNode) return true;
      return node.__insideDock === true;
    },
  };

  private restoreGlobals: Array<() => void> = [];

  install() {
    this.restoreGlobals.push(
      setGlobalProperty('performance', {
        now: () => this.currentTime,
      })
    );

    const mockDocEl = {
      get scrollTop() {
        return self.scrollY;
      },
      set scrollTop(val: number) {
        self.scrollY = val;
      },
      get clientHeight() {
        return self.innerHeight;
      },
      get scrollHeight() {
        return self.scrollHeight;
      },
      get offsetHeight() {
        return self.scrollHeight;
      },
    };

    const mockBody = {
      get scrollTop() {
        return self.scrollY;
      },
      set scrollTop(val: number) {
        self.scrollY = val;
      },
      get scrollHeight() {
        return self.scrollHeight;
      },
    };

    const self = this;

    const mockDocument = {
      documentElement: mockDocEl,
      body: mockBody,
      get visibilityState() {
        return self.visibilityState;
      },
      addEventListener: (event: string, handler: Function) => {
        if (!self.documentListeners[event]) self.documentListeners[event] = [];
        self.documentListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: Function) => {
        if (!self.documentListeners[event]) return;
        self.documentListeners[event] = self.documentListeners[event].filter((h) => h !== handler);
      },
      dispatchEvent: (event: MockEvent) => {
        const handlers = self.documentListeners[event.type] || [];
        for (const h of handlers) h(event);
      },
    };

    const mockWindow = {
      get scrollY() {
        return self.scrollY;
      },
      set scrollY(val: number) {
        self.scrollY = val;
      },
      get innerHeight() {
        return self.innerHeight;
      },
      scrollBy: (_x: number, y: number) => {
        self.scrollY = Math.max(0, self.scrollY + y);
      },
      scrollTo: (opts: any) => {
        if (typeof opts === 'number') {
          self.scrollY = opts;
        } else if (opts && typeof opts.top === 'number') {
          self.scrollY = opts.top;
        }
      },
      requestAnimationFrame: (cb: (time: number) => void) => {
        const id = self.rafSeq++;
        self.rafCallbacks.set(id, cb);
        return id;
      },
      cancelAnimationFrame: (id: number) => {
        self.rafCallbacks.delete(id);
      },
      addEventListener: (event: string, handler: Function) => {
        if (!self.windowListeners[event]) self.windowListeners[event] = [];
        self.windowListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: Function) => {
        if (!self.windowListeners[event]) return;
        self.windowListeners[event] = self.windowListeners[event].filter((h) => h !== handler);
      },
      dispatchEvent: (event: MockEvent) => {
        const handlers = self.windowListeners[event.type] || [];
        for (const h of handlers) h(event);
      },
      setTimeout: (cb: Function, ms: number) => {
        const id = self.timerSeq++;
        self.timers.set(id, { due: self.currentTime + ms, cb });
        return id;
      },
      clearTimeout: (id: number) => {
        self.timers.delete(id);
      },
      setInterval: (cb: Function, ms: number) => {
        const id = self.timerSeq++;
        self.timers.set(id, { due: self.currentTime + ms, cb, interval: ms });
        return id;
      },
      clearInterval: (id: number) => {
        self.timers.delete(id);
      },
    };

    this.restoreGlobals.push(setGlobalProperty('window', mockWindow));
    this.restoreGlobals.push(setGlobalProperty('document', mockDocument));
    this.restoreGlobals.push(setGlobalProperty('requestAnimationFrame', mockWindow.requestAnimationFrame));
    this.restoreGlobals.push(setGlobalProperty('cancelAnimationFrame', mockWindow.cancelAnimationFrame));
    this.restoreGlobals.push(setGlobalProperty('setTimeout', mockWindow.setTimeout));
    this.restoreGlobals.push(setGlobalProperty('clearTimeout', mockWindow.clearTimeout));
    this.restoreGlobals.push(setGlobalProperty('setInterval', mockWindow.setInterval));
    this.restoreGlobals.push(setGlobalProperty('clearInterval', mockWindow.clearInterval));
  }

  uninstall() {
    while (this.restoreGlobals.length > 0) {
      const restore = this.restoreGlobals.pop();
      restore?.();
    }
    this.rafCallbacks.clear();
    this.timers.clear();
    this.windowListeners = {};
    this.documentListeners = {};
  }

  hasPendingRaf(): boolean {
    return this.rafCallbacks.size > 0;
  }

  stepFrame(dtMs = 16.6667) {
    this.currentTime += dtMs;
    this.flushTimers();

    if (this.rafCallbacks.size > 0) {
      const callbacks = Array.from(this.rafCallbacks.entries());
      this.rafCallbacks.clear();
      for (const [, cb] of callbacks) {
        cb(this.currentTime);
      }
    }
  }

  stepFrames(count = 60, dtMs = 16.6667) {
    for (let i = 0; i < count; i++) {
      this.stepFrame(dtMs);
    }
  }

  advanceTime(ms: number) {
    const target = this.currentTime + ms;
    while (this.currentTime < target) {
      const nextTimer = this.getNextDueTimer(target);
      const step = nextTimer ? Math.min(100, Math.max(1, nextTimer.due - this.currentTime)) : Math.min(100, target - this.currentTime);
      this.currentTime += step;
      this.flushTimers();
    }
  }

  private getNextDueTimer(upTo: number) {
    let earliest: { id: number; due: number; cb: Function; interval?: number } | null = null;
    for (const [id, t] of this.timers.entries()) {
      if (t.due <= upTo && (!earliest || t.due < earliest.due)) {
        earliest = { id, ...t };
      }
    }
    return earliest;
  }

  private flushTimers() {
    const expired: Array<{ id: number; due: number; cb: Function; interval?: number }> = [];
    for (const [id, t] of this.timers.entries()) {
      if (t.due <= this.currentTime) {
        expired.push({ id, ...t });
      }
    }

    expired.sort((a, b) => a.due - b.due);

    for (const t of expired) {
      if (!this.timers.has(t.id)) continue;
      if (t.interval) {
        this.timers.set(t.id, { due: this.currentTime + t.interval, cb: t.cb, interval: t.interval });
      } else {
        this.timers.delete(t.id);
      }
      try {
        t.cb();
      } catch (e) {
        console.error('Timer error:', e);
      }
    }
  }

  triggerGesture(type: 'touchstart' | 'touchmove' | 'wheel' | 'pointerdown', insideDock = false) {
    const target = insideDock ? { __insideDock: true } : { __insideDock: false };
    const event: MockEvent = {
      type,
      target,
    };
    const handlers = this.windowListeners[type] || [];
    for (const h of handlers) {
      h(event);
    }
  }

  triggerVisibilityChange(newState: 'visible' | 'hidden') {
    this.visibilityState = newState;
    const event: MockEvent = { type: 'visibilitychange' };
    const handlers = this.documentListeners['visibilitychange'] || [];
    for (const h of handlers) {
      h(event);
    }
  }
}

/**
 * Controller session for mounting and driving AutoScroll deterministically in tests.
 */
export class AutoScrollController {
  public env: MockScrollEnvironment;
  public harness: HookHarness<AutoScrollProps, React.JSX.Element>;
  public currentState: AutoScrollState = 'idle';
  public currentSpeed: number = 30;
  public stateHistory: AutoScrollState[] = [];
  public speedHistory: number[] = [];

  constructor(initialProps: AutoScrollProps = {}) {
    this.env = new MockScrollEnvironment();
    this.env.install();

    this.currentSpeed = Math.max(15, Math.min(120, initialProps.initialSpeed ?? 30));

    const wrappedProps: AutoScrollProps = {
      ...initialProps,
      onStateChange: (state: AutoScrollState) => {
        this.currentState = state;
        this.stateHistory.push(state);
        initialProps.onStateChange?.(state);
      },
      onSpeedChange: (speed: number) => {
        this.currentSpeed = speed;
        this.speedHistory.push(speed);
        initialProps.onSpeedChange?.(speed);
      },
    };

    this.harness = new HookHarness(AutoScroll, wrappedProps);
    this.render();
  }

  render(newProps?: AutoScrollProps): React.JSX.Element {
    const vdom = this.harness.render(newProps);
    // Wire dock node into ref (in React 19, ref is in props)
    const dockRef = (vdom.props as any)?.ref ?? (vdom as any).ref;
    if (dockRef) {
      dockRef.current = this.env.mockDockNode;
    }
    return vdom;
  }

  get vdom(): React.JSX.Element {
    return this.harness.result;
  }

  private findElement(predicate: (node: any) => boolean): any {
    const search = (node: any): any => {
      if (!node) return null;
      if (predicate(node)) return node;
      if (node.props?.children) {
        const children = Array.isArray(node.props.children)
          ? node.props.children
          : [node.props.children];
        for (const child of children) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(this.vdom);
  }

  clickPlayPause() {
    // Target the primary amber Play/Pause button in the main controls row
    const btn = this.findElement(
      (node) =>
        node.type === 'button' &&
        typeof node.props?.className === 'string' &&
        node.props.className.includes('bg-amber-500')
    );
    if (!btn) {
      throw new Error(`Play/Pause button not found in AutoScroll VDOM (current state: ${this.currentState})`);
    }
    btn.props.onClick();
    // Allow state change microtasks to flush
    this.render();
  }

  changeSpeed(newSpeed: number) {
    const input = this.findElement(
      (node) => node.type === 'input' && node.props['aria-label'] === 'Prędkość przewijania'
    );
    if (!input) {
      throw new Error('Speed input slider not found in AutoScroll VDOM');
    }
    input.props.onChange({ target: { value: String(newSpeed) } });
    this.render();
  }

  clickJumpToTop() {
    const btn = this.findElement(
      (node) => node.type === 'button' && node.props['aria-label'] === 'Wróć na górę'
    );
    if (!btn) {
      throw new Error('Jump-to-top button not found in AutoScroll VDOM');
    }
    btn.props.onClick();
    this.render();
  }

  clickExplicitStop() {
    const btn = this.findElement(
      (node) =>
        node.type === 'button' &&
        node.props['aria-label'] === 'Pauza' &&
        node.props.children === 'Zatrzymaj'
    );
    if (!btn) {
      throw new Error('Explicit "Zatrzymaj" button not found (must be in interrupted state)');
    }
    btn.props.onClick();
    this.render();
  }

  touchOutside(type: 'touchstart' | 'touchmove' | 'wheel' | 'pointerdown' = 'touchstart') {
    this.env.triggerGesture(type, false);
    this.render();
  }

  touchInsideDock(type: 'touchstart' | 'touchmove' | 'wheel' | 'pointerdown' = 'touchstart') {
    this.env.triggerGesture(type, true);
    this.render();
  }

  stepFrame(dtMs = 16.6667) {
    this.env.stepFrame(dtMs);
    this.render();
  }

  stepFrames(count = 60, dtMs = 16.6667) {
    for (let i = 0; i < count; i++) {
      this.stepFrame(dtMs);
    }
  }

  advanceTime(ms: number) {
    this.env.advanceTime(ms);
    this.render();
  }

  destroy() {
    this.harness.unmount();
    this.env.uninstall();
  }
}
