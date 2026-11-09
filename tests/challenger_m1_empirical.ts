import assert from 'node:assert';
import { transposeChord, formatNote, formatChordForDisplay, isChordToken, isChordLine } from '../src/lib/chordNotation.ts';
import { useWakeLock } from '../src/hooks/useWakeLock.ts';

// Test harness types and reporter
interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

async function test(suite: string, name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ suite, name, passed: true });
    console.log(`  \x1b[32m✓\x1b[0m [${suite}] ${name}`);
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    results.push({ suite, name, passed: false, error: errorMsg, details: err });
    console.error(`  \x1b[31m✗\x1b[0m [${suite}] ${name}: \x1b[31m${errorMsg}\x1b[0m`);
    if (err?.stack) {
      console.error(`    \x1b[90m${err.stack.split('\n').slice(1, 3).join('\n    ')}\x1b[0m`);
    }
  }
}

// ============================================================================
// MOCK DOM & BROWSER ENVIRONMENT FOR HOOK TESTING
// ============================================================================

class MockWakeLockSentinel {
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

  // Simulate external release by browser (e.g. background tab or system sleep)
  simulateExternalRelease() {
    this.release();
  }
}

class MockDocument {
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

/**
 * Lightweight React Hook Lifecycle Runner.
 * Simulates React's internal hooks dispatcher (useState, useRef, useCallback, useEffect)
 * without requiring the full React DOM reconciliation tree.
 */
class HookHarness<TProps, TResult> {
  private hookFn: (props: TProps) => TResult;
  private currentProps: TProps;
  private hookIndex = 0;
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

    this.hookIndex = 0;
    let stateIdx = 0;
    let refIdx = 0;
    let effectIdx = 0;
    let callbackIdx = 0;

    // Install mock React hooks into React object or hook scope
    const originalUseState = React.useState;
    const originalUseRef = React.useRef;
    const originalUseCallback = React.useCallback;
    const originalUseEffect = React.useEffect;

    React.useState = ((initial: any) => {
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
    }) as any;

    React.useRef = ((initial: any) => {
      const idx = refIdx++;
      if (this.refs.length <= idx) {
        this.refs.push({ current: initial });
      }
      return this.refs[idx];
    }) as any;

    React.useCallback = ((fn: any, deps: any[]) => {
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
    }) as any;

    React.useEffect = ((effect: any, deps?: any[]) => {
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
    }) as any;

    try {
      this.result = this.hookFn(this.currentProps);
    } finally {
      React.useState = originalUseState;
      React.useRef = originalUseRef;
      React.useCallback = originalUseCallback;
      React.useEffect = originalUseEffect;
    }

    // Run effects only when deps changed or on initial mount
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

import React from 'react';

// ============================================================================
// MAIN CHALLENGER SUITE EXECUTION
// ============================================================================

function setGlobalProperty(key: string, value: any) {
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

async function main() {
  console.log('\n================================================================');
  console.log('  CHALLENGER M1: EMPIRICAL STRESS TESTS & FAILURE MODE ANALYSIS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SUITE 1: useWakeLock Lifecycle & Browser Simulation
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: useWakeLock Lifecycle & Browser Edge Cases ---');

  await test('useWakeLock', 'Degrades gracefully when navigator.wakeLock is missing', async () => {
    const restoreNav = setGlobalProperty('navigator', {});
    const restoreDoc = setGlobalProperty('document', new MockDocument());

    try {
      const harness = new HookHarness(useWakeLock, true);
      const res = harness.render();

      assert.strictEqual(res.isSupported, false, 'isSupported must be false when wakeLock missing');
      assert.strictEqual(res.isActive, false, 'isActive must be false');
      assert.strictEqual(res.error, null, 'error must be null initially');

      // Calling request or release should safely no-op without exceptions
      await res.request();
      assert.strictEqual(res.isActive, false);

      await res.release();
      assert.strictEqual(res.isActive, false);

      harness.unmount();
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  await test('useWakeLock', 'Degrades gracefully when navigator is undefined (SSR)', async () => {
    const restoreNav = setGlobalProperty('navigator', undefined);
    const restoreDoc = setGlobalProperty('document', undefined);

    try {
      const harness = new HookHarness(useWakeLock, true);
      const res = harness.render();

      assert.strictEqual(res.isSupported, false, 'isSupported must be false when navigator is undefined');
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

  await test('useWakeLock', 'Handles request rejection (NotAllowedError / battery saver denial)', async () => {
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
      const res = harness.render();

      assert.strictEqual(res.isSupported, true, 'isSupported must be true when wakeLock exists in navigator');

      // The initial mount triggers request()
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

  await test('useWakeLock', 'VisibilityChange transitions: auto-reacquires lock on return to foreground', async () => {
    const mockDoc = new MockDocument();
    let currentSentinel: MockWakeLockSentinel | null = null;
    let requestCount = 0;

    const restoreDoc = setGlobalProperty('document', mockDoc);
    const restoreNav = setGlobalProperty('navigator', {
      wakeLock: {
        request: async (type: string) => {
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

      assert.strictEqual(requestCount, 1, 'Initial mount must request lock');
      assert.strictEqual(harness.result.isActive, true, 'Lock must be active');
      assert(currentSentinel !== null && !currentSentinel.released, 'Sentinel must not be released');

      // Step 1: User switches tabs -> document becomes hidden
      // Native browser releases the sentinel when hidden
      const firstSentinel = currentSentinel;
      firstSentinel!.simulateExternalRelease();
      mockDoc.triggerVisibilityChange('hidden');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(firstSentinel!.released, true, 'First sentinel was released');
      assert.strictEqual(harness.result.isActive, false, 'Lock must be inactive while hidden');

      // Step 2: User returns to tab -> document becomes visible
      mockDoc.triggerVisibilityChange('visible');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(requestCount, 2, 'Returning to foreground must re-acquire lock');
      assert.strictEqual(harness.result.isActive, true, 'Lock must be active again');
      assert(currentSentinel !== firstSentinel, 'A new sentinel must be acquired');
      assert(!currentSentinel!.released, 'New sentinel must be active');

      // Cleanup
      harness.unmount();
      assert.strictEqual(currentSentinel!.released, true, 'Unmounting must release active sentinel');
      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 0, 'Listener must be removed on unmount');
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  await test('useWakeLock', 'Component unmount while request() is in-flight releases acquired sentinel cleanly', async () => {
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

      // Request is now in-flight. Unmount the hook before request resolves!
      harness.unmount();

      // Now resolve the in-flight request
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

  await test('useWakeLock', 'Rapid visibilitychange toggles do not leak listeners or duplicate sentinels', async () => {
    const mockDoc = new MockDocument();
    let activeSentinels: MockWakeLockSentinel[] = [];

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

      // Simulate 10 rapid switches between hidden and visible
      for (let i = 0; i < 10; i++) {
        activeSentinels[activeSentinels.length - 1]?.simulateExternalRelease();
        mockDoc.triggerVisibilityChange('hidden');
        mockDoc.triggerVisibilityChange('visible');
      }
      await new Promise((r) => setTimeout(r, 20));

      // Check listener count on document
      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 1, 'Must have exactly 1 visibility listener');

      harness.unmount();
      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 0, 'Must have 0 listeners after unmount');
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 2: chordNotation.ts Comprehensive Property & Edge Testing
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: chordNotation.ts Edge & Property Testing ---');

  await test('chordNotation', 'Property test all 12 chromatic pitches across [-24, +24] semitone shifts', () => {
    const chromaticPitches = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    for (const pitch of chromaticPitches) {
      // Test octaves (+12, -12, +24, -24) preserve pitch identically
      for (const oct of [-24, -12, 0, 12, 24]) {
        const transposed = transposeChord(pitch, oct, false);
        assert.strictEqual(transposed, pitch, `Octave shift ${oct} for ${pitch} must yield exact pitch ${pitch}, got ${transposed}`);
      }

      // Test all semitone offsets [-24..+24] round-trip
      for (let s = -24; s <= 24; s++) {
        const shifted = transposeChord(pitch, s, false);
        const restored = transposeChord(shifted, -s, false);
        assert.strictEqual(restored, pitch, `Shift ${s} then ${-s} for ${pitch} must restore original pitch`);
      }
    }
  });

  await test('chordNotation', 'Enharmonic sharp preservation for flat inputs (Db, Eb, Gb, Ab, Bb)', () => {
    const flatToSharpMap: Record<string, string> = {
      Db: 'C#',
      Eb: 'D#',
      Gb: 'F#',
      Ab: 'G#',
      Bb: 'A#',
    };

    for (const [flat, expectedSharp] of Object.entries(flatToSharpMap)) {
      // In International notation, all flat accidentals must normalize to sharp
      const res = transposeChord(flat, 0, false);
      assert.strictEqual(res, expectedSharp, `${flat} in International notation (0 shift) must format as ${expectedSharp}`);

      // With semitone shifts (+1, -1), result must still use sharp accidentals
      const plus1 = transposeChord(flat, 1, false);
      assert(!plus1.includes('b'), `${flat} + 1 (${plus1}) must not contain flat 'b'`);
      const minus1 = transposeChord(flat, -1, false);
      assert(!minus1.includes('b'), `${flat} - 1 (${minus1}) must not contain flat 'b'`);
    }
  });

  await test('chordNotation', 'Minor chord normalization (am, amin, Amin, Am, c#min, c#m, Hm, hmin)', () => {
    const testCases: [string, string][] = [
      ['am', 'Am'],
      ['amin', 'Am'],
      ['Amin', 'Am'],
      ['Am', 'Am'],
      ['c#min', 'C#m'],
      ['c#m', 'C#m'],
      ['Hm', 'Hm'],
      ['hmin', 'Hm'],
      // Extra variations
      ['dm', 'Dm'],
      ['dmin', 'Dm'],
      ['Dmin7', 'Dm7'],
      ['f#min7', 'F#m7'],
      ['bbmin', 'Bm'], // in Polish notation Bb -> B
    ];

    for (const [input, expected] of testCases) {
      const actual = transposeChord(input, 0, true);
      assert.strictEqual(actual, expected, `Minor chord "${input}" must normalize to "${expected}", got "${actual}"`);
    }
  });

  await test('chordNotation', 'Complex slash chords (D/F#, G/H, C/E, F#/A#)', () => {
    // 1. D/F#
    assert.strictEqual(transposeChord('D/F#', 0, true), 'D/F#');
    assert.strictEqual(transposeChord('D/F#', 1, true), 'D#/G');
    assert.strictEqual(transposeChord('D/F#', -1, true), 'C#/F');

    // 2. G/H (Polish slash chord with H bass)
    assert.strictEqual(transposeChord('G/H', 0, true), 'G/H');
    assert.strictEqual(transposeChord('G/H', 0, false), 'G/B', 'G/H in International must be G/B');
    assert.strictEqual(transposeChord('G/H', 1, true), 'G#/C');
    assert.strictEqual(transposeChord('G/H', 1, false), 'G#/C');

    // 3. C/E
    assert.strictEqual(transposeChord('C/E', 0, true), 'C/E');
    assert.strictEqual(transposeChord('C/E', 2, true), 'D/F#');

    // 4. F#/A# (A# in Polish is B)
    assert.strictEqual(transposeChord('F#/A#', 0, true), 'F#/B');
    assert.strictEqual(transposeChord('F#/A#', 0, false), 'F#/A#');
    assert.strictEqual(transposeChord('F#/A#', 1, true), 'G/H');
    assert.strictEqual(transposeChord('F#/A#', 1, false), 'G/B');

    // 5. Minor slash chords
    assert.strictEqual(transposeChord('Am/G', 0, true), 'Am/G');
    assert.strictEqual(transposeChord('amin/g', 0, true), 'Am/G');
  });

  await test('chordNotation', 'Polish notation toggle: H -> B (natural) and B/Bb behavior', () => {
    // Polish H (B natural) -> International B (B natural)
    assert.strictEqual(transposeChord('H', 0, true), 'H', 'Polish H in PL mode must remain H');
    assert.strictEqual(transposeChord('H', 0, false), 'B', 'Polish H in INT mode must toggle to B');
    assert.strictEqual(transposeChord('Hm', 0, true), 'Hm', 'Polish Hm in PL mode must remain Hm');
    assert.strictEqual(transposeChord('Hm', 0, false), 'Bm', 'Polish Hm in INT mode must toggle to Bm');

    // International Bb (B flat) -> Polish B (B flat)
    assert.strictEqual(transposeChord('Bb', 0, true), 'B', 'International Bb in PL mode must format as B');
    assert.strictEqual(transposeChord('Bbm', 0, true), 'Bm', 'International Bbm in PL mode must format as Bm');

    // Transposition cross-check:
    // G + 4 semitones = B natural: H in PL, B in INT
    assert.strictEqual(transposeChord('G', 4, true), 'H');
    assert.strictEqual(transposeChord('G', 4, false), 'B');

    // G + 3 semitones = B flat: B in PL, A# in INT (sharp enharmonic)
    assert.strictEqual(transposeChord('G', 3, true), 'B');
    assert.strictEqual(transposeChord('G', 3, false), 'A#');
  });

  await test('chordNotation', 'Non-chord token discrimination and chord line detection', () => {
    assert.strictEqual(isChordToken('C'), true);
    assert.strictEqual(isChordToken('Am'), true);
    assert.strictEqual(isChordToken('F#m7'), true);
    assert.strictEqual(isChordToken('D/F#'), true);
    assert.strictEqual(isChordToken('G/H'), true);
    assert.strictEqual(isChordToken('hello'), false);
    assert.strictEqual(isChordToken('anioly'), false);
    assert.strictEqual(isChordToken(''), false);

    assert.strictEqual(isChordLine('G   C   D   G'), true);
    assert.strictEqual(isChordLine('F   G   Cmaj7   Am'), true);
    assert.strictEqual(isChordLine('To moje bieszczadzkie anioly'), false);
    assert.strictEqual(isChordLine('[Refren]'), false);
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`CHALLENGER RESULTS: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFATAL CHALLENGER HARNESS ERROR:', err);
  process.exit(1);
});
