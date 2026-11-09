import React from 'react';

export class MockWakeLockSentinel {
  public released: boolean = false;
  private listeners: Record<string, Function[]> = {};

  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    const handlers = this.listeners['release'] || [];
    for (const h of handlers) {
      h();
    }
  }

  simulateExternalRelease() {
    this.release();
  }
}

export class MockDocument {
  public visibilityState: 'visible' | 'hidden' = 'visible';
  private listeners: Record<string, Function[]> = {};

  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
  }

  triggerVisibilityChange(newState: 'visible' | 'hidden') {
    this.visibilityState = newState;
    const handlers = this.listeners['visibilitychange'] || [];
    for (const h of handlers) {
      h();
    }
  }

  getListenerCount(event: string): number {
    return (this.listeners[event] || []).length;
  }
}

const getReactInternals = () => {
  return (
    (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
    (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
  );
};

/**
 * Lightweight React Hook Lifecycle Runner.
 * Simulates React's internal hooks dispatcher (useState, useRef, useCallback, useEffect)
 * across both React 18 and React 19 dispatchers without requiring a browser DOM tree.
 */
export class HookHarness<TProps, TResult> {
  private hookFn: (props: TProps) => TResult;
  private currentProps: TProps;
  private states: any[] = [];
  private stateSetters: Array<(val: any) => void> = [];
  private refs: any[] = [];
  private effects: Array<{ effect: () => (() => void) | void; deps?: any[]; cleanup?: () => void; hasRun: boolean }> = [];
  private callbacks: Array<{ fn: any; deps?: any[] }> = [];
  public result!: TResult;
  public isMounted = true;

  constructor(hookFn: (props: TProps) => TResult, initialProps: TProps) {
    this.hookFn = hookFn;
    this.currentProps = initialProps;
  }

  render(newProps?: TProps): TResult {
    if (!this.isMounted) throw new Error('Cannot render unmounted hook');
    if (newProps !== undefined) this.currentProps = newProps;

    let stateIdx = 0;
    let refIdx = 0;
    let effectIdx = 0;
    let callbackIdx = 0;

    const mockDispatcher = {
      useState: (initial: any) => {
        const idx = stateIdx++;
        if (this.states.length <= idx) {
          const initVal = typeof initial === 'function' ? initial() : initial;
          this.states.push(initVal);
          this.stateSetters.push((newVal: any) => {
            const resolved = typeof newVal === 'function' ? newVal(this.states[idx]) : newVal;
            if (this.states[idx] !== resolved) {
              this.states[idx] = resolved;
              if (this.isMounted) {
                queueMicrotask(() => {
                  if (this.isMounted) {
                    this.render();
                  }
                });
              }
            }
          });
        }
        return [this.states[idx], this.stateSetters[idx]];
      },
      useRef: (initial: any) => {
        const idx = refIdx++;
        if (this.refs.length <= idx) {
          this.refs.push({ current: initial });
        }
        return this.refs[idx];
      },
      useCallback: (fn: any, deps: any[]) => {
        const idx = callbackIdx++;
        if (this.callbacks.length <= idx) {
          this.callbacks.push({ fn, deps });
          return fn;
        }
        const prev = this.callbacks[idx];
        const depsChanged = !prev.deps || !deps || deps.some((d, i) => d !== prev.deps![i]);
        if (depsChanged) {
          this.callbacks[idx] = { fn, deps };
          return fn;
        }
        return prev.fn;
      },
      useEffect: (effect: any, deps?: any[]) => {
        const idx = effectIdx++;
        if (this.effects.length <= idx) {
          this.effects.push({ effect, deps, hasRun: false });
        } else {
          const prev = this.effects[idx];
          const depsChanged = !prev.deps || !deps || deps.some((d, i) => d !== prev.deps![i]);
          if (depsChanged) {
            this.effects[idx] = { effect, deps, cleanup: prev.cleanup, hasRun: false };
          }
        }
      },
    };

    const internals = getReactInternals();
    const prevDispatcher = internals ? internals.H : null;

    if (internals) {
      internals.H = mockDispatcher;
    }

    const originalUseState = React.useState;
    const originalUseRef = React.useRef;
    const originalUseCallback = React.useCallback;
    const originalUseEffect = React.useEffect;

    React.useState = mockDispatcher.useState as any;
    React.useRef = mockDispatcher.useRef as any;
    React.useCallback = mockDispatcher.useCallback as any;
    React.useEffect = mockDispatcher.useEffect as any;

    try {
      this.result = this.hookFn(this.currentProps);
    } finally {
      if (internals) {
        internals.H = prevDispatcher;
      }
      React.useState = originalUseState;
      React.useRef = originalUseRef;
      React.useCallback = originalUseCallback;
      React.useEffect = originalUseEffect;
    }

    for (const eff of this.effects) {
      if (!eff.hasRun) {
        if (eff.cleanup) {
          eff.cleanup();
          eff.cleanup = undefined;
        }
        const cleanup = eff.effect();
        if (typeof cleanup === 'function') {
          eff.cleanup = cleanup;
        }
        eff.hasRun = true;
      }
    }

    return this.result;
  }

  unmount() {
    this.isMounted = false;
    for (const eff of this.effects) {
      if (eff.cleanup) {
        eff.cleanup();
        eff.cleanup = undefined;
      }
    }
  }
}

export function setGlobalProperty(key: string, value: any) {
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, key, original);
    } else {
      delete (globalThis as any)[key];
    }
  };
}
