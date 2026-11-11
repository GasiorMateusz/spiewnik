import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AutoScrollProps, AutoScrollState } from '../types';
import { PlayIcon, PauseIcon, ArrowUpIcon, MinusIcon, PlusIcon } from './Icons';

interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  scrollBy: (dy: number) => void;
  scrollToTop: (smooth?: boolean) => void;
}

function resolveTarget(
  scrollTarget?: 'window' | HTMLElement | null,
  containerRef?: React.RefObject<HTMLElement | null>
): HTMLElement | null {
  if (containerRef && containerRef.current) {
    return containerRef.current;
  }
  if (typeof HTMLElement !== 'undefined' && scrollTarget instanceof HTMLElement) {
    return scrollTarget;
  }
  return null;
}

function getScrollMetrics(target: HTMLElement | null): ScrollMetrics {
  if (target) {
    return {
      scrollTop: target.scrollTop,
      clientHeight: target.clientHeight,
      scrollHeight: target.scrollHeight,
      scrollBy: (dy: number) => {
        target.scrollTop += dy;
      },
      scrollToTop: (smooth = true) => {
        if (typeof target.scrollTo === 'function') {
          try {
            target.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
          } catch {
            target.scrollTop = 0;
          }
        } else {
          target.scrollTop = 0;
        }
      },
    };
  }

  if (typeof window === 'undefined') {
    return {
      scrollTop: 0,
      clientHeight: 0,
      scrollHeight: 0,
      scrollBy: () => {},
      scrollToTop: () => {},
    };
  }

  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY ?? doc?.scrollTop ?? body?.scrollTop ?? 0;
  const clientHeight = window.innerHeight ?? doc?.clientHeight ?? 0;
  const scrollHeight = Math.max(
    doc?.scrollHeight ?? 0,
    body?.scrollHeight ?? 0,
    doc?.offsetHeight ?? 0
  );

  return {
    scrollTop,
    clientHeight,
    scrollHeight,
    scrollBy: (dy: number) => {
      if (typeof window.scrollBy === 'function') {
        window.scrollBy(0, dy);
      }
    },
    scrollToTop: (smooth = true) => {
      if (typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      }
    },
  };
}

/**
 * Hands-Free Auto-Scroll Floating Dock (REQ-SCR-1, REQ-SCR-2).
 * Drives 60/120 FPS requestAnimationFrame scrolling with sub-pixel accumulator math,
 * touch interruption state machine with dock isolation, and 3-second auto-resume.
 */
export function AutoScroll({
  initialSpeed = 14,
  onSpeedChange,
  scrollTarget = 'window',
  containerRef,
  theme = 'dark',
  className = '',
  onStateChange,
}: AutoScrollProps): React.JSX.Element {
  const [speed, setSpeed] = useState<number>(() => Math.max(5, Math.min(120, initialSpeed)));
  const [state, setState] = useState<AutoScrollState>('idle');
  const [countdown, setCountdown] = useState<number | null>(null);

  const stateRef = useRef<AutoScrollState>('idle');
  const speedRef = useRef<number>(speed);
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const accumulatedScrollRef = useRef<number>(0);
  const isResettingToTopRef = useRef<boolean>(false);
  const resetStartTimeRef = useRef<number>(0);

  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerHandledRef = useRef<boolean>(false);

  useEffect(() => {
    const clamped = Math.max(5, Math.min(120, initialSpeed));
    setSpeed(clamped);
    speedRef.current = clamped;
  }, [initialSpeed]);

  const isDark = theme === 'dark';

  const transitionTo = useCallback(
    (nextState: AutoScrollState) => {
      stateRef.current = nextState;
      setState(nextState);
      onStateChange?.(nextState);
    },
    [onStateChange]
  );

  const getMetrics = useCallback((): ScrollMetrics => {
    const resolved = resolveTarget(scrollTarget, containerRef);
    return getScrollMetrics(resolved);
  }, [scrollTarget, containerRef]);

  const stopRafLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastTimeRef.current = null;
    isResettingToTopRef.current = false;
  }, []);

  const clearAutoResumeTimers = useCallback(() => {
    if (autoResumeTimerRef.current !== null) {
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  }, []);

  const stopScrolling = useCallback(() => {
    stopRafLoop();
    clearAutoResumeTimers();
    accumulatedScrollRef.current = 0;
    transitionTo('idle');
  }, [stopRafLoop, clearAutoResumeTimers, transitionTo]);

  // Main RAF tick engine
  const tick = useCallback(
    (timestamp: number) => {
      if (stateRef.current !== 'scrolling') {
        rafIdRef.current = null;
        lastTimeRef.current = null;
        return;
      }

      const metrics = getMetrics();

      // Smooth reset arbitration when starting at the bottom
      if (isResettingToTopRef.current) {
        const atTop = metrics.scrollTop <= 5;
        const timeout = timestamp - resetStartTimeRef.current > 1000;
        if (atTop || timeout) {
          isResettingToTopRef.current = false;
          lastTimeRef.current = performance.now();
          accumulatedScrollRef.current = metrics.scrollTop;
        }
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
        accumulatedScrollRef.current = metrics.scrollTop;
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      // Delta time capped to 100ms for background tab protection
      const rawDt = Math.max(0, now - lastTimeRef.current);
      const dt = Math.min(rawDt, 100);
      lastTimeRef.current = now;

      // Sub-pixel delta accumulation
      const deltaY = (speedRef.current * dt) / 1000;
      accumulatedScrollRef.current += deltaY;

      // Boundary calculation with -2px tolerance
      const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
      const distanceRemaining = maxScrollTop - metrics.scrollTop;

      if (distanceRemaining <= 2) {
        stopScrolling();
        return;
      }

      // Extract integer pixels to scroll
      const targetY = Math.min(accumulatedScrollRef.current, maxScrollTop);
      const desiredScroll = Math.floor(targetY) - metrics.scrollTop;

      if (desiredScroll > 0) {
        const actualScroll = Math.min(desiredScroll, distanceRemaining);
        metrics.scrollBy(actualScroll);

        if (distanceRemaining - actualScroll <= 2) {
          stopScrolling();
          return;
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    },
    [getMetrics, stopScrolling]
  );

  const startRafLoop = useCallback(() => {
    stopRafLoop();
    rafIdRef.current = requestAnimationFrame(tick);
  }, [stopRafLoop, tick]);

  const executeAutoResume = useCallback(() => {
    clearAutoResumeTimers();
    const metrics = getMetrics();
    const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
    if (maxScrollTop > 0 && maxScrollTop - metrics.scrollTop <= 2) {
      transitionTo('idle');
      return;
    }
    // Resynchronize accumulator to physical DOM scroll position
    accumulatedScrollRef.current = metrics.scrollTop;
    lastTimeRef.current = null;
    transitionTo('scrolling');
    startRafLoop();
  }, [clearAutoResumeTimers, getMetrics, transitionTo, startRafLoop]);

  const armAutoResumeTimer = useCallback(() => {
    clearAutoResumeTimers();
    setCountdown(3);
    let rem = 3;

    countdownIntervalRef.current = setInterval(() => {
      rem -= 1;
      if (rem > 0) {
        setCountdown(rem);
      } else {
        if (countdownIntervalRef.current !== null) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }
    }, 1000);

    autoResumeTimerRef.current = setTimeout(() => {
      executeAutoResume();
    }, 3000);
  }, [clearAutoResumeTimers, executeAutoResume]);

  const handleInterruption = useCallback(() => {
    stopRafLoop();
    transitionTo('interrupted');
    armAutoResumeTimer();
  }, [stopRafLoop, transitionTo, armAutoResumeTimer]);

  const handleDebounce = useCallback(() => {
    armAutoResumeTimer();
  }, [armAutoResumeTimer]);

  // Touch and pointer gesture listeners on window with dock isolation
  useEffect(() => {
    if (state === 'idle') return;

    const handleUserGesture = (e: Event) => {
      const target = e.target as Node | null;
      // Dock event isolation
      if (dockRef.current && target && dockRef.current.contains(target)) {
        return;
      }

      if (stateRef.current === 'scrolling') {
        handleInterruption();
      } else if (stateRef.current === 'interrupted') {
        handleDebounce();
      }
    };

    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('touchstart', handleUserGesture, opts);
    window.addEventListener('touchmove', handleUserGesture, opts);
    window.addEventListener('wheel', handleUserGesture, opts);
    window.addEventListener('pointerdown', handleUserGesture, opts);

    return () => {
      window.removeEventListener('touchstart', handleUserGesture, opts);
      window.removeEventListener('touchmove', handleUserGesture, opts);
      window.removeEventListener('wheel', handleUserGesture, opts);
      window.removeEventListener('pointerdown', handleUserGesture, opts);
    };
  }, [state, handleInterruption, handleDebounce]);

  // Foreground tab return: reset baseline timestamp to prevent leap
  useEffect(() => {
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && stateRef.current === 'scrolling') {
        lastTimeRef.current = null;
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Complete cleanup on unmount
  useEffect(() => {
    return () => {
      stopRafLoop();
      clearAutoResumeTimers();
      clearHoldTimer();
    };
  }, [stopRafLoop, clearAutoResumeTimers, clearHoldTimer]);

  const stepSpeed = useCallback(
    (delta: number): boolean => {
      const current = speedRef.current;
      const next = Math.max(5, Math.min(120, current + delta));
      if (next !== current) {
        speedRef.current = next;
        setSpeed(next);
        onSpeedChange?.(next);
        return true;
      }
      return false;
    },
    [onSpeedChange]
  );

  const handleHoldStart = useCallback(
    (delta: number, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      pointerHandledRef.current = true;
      clearHoldTimer();

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}

      const changed = stepSpeed(delta);
      if (!changed) return;

      let currentInterval = 200;
      const scheduleNext = (delay: number) => {
        holdTimerRef.current = setTimeout(() => {
          const didChange = stepSpeed(delta);
          if (didChange) {
            currentInterval = Math.max(40, currentInterval * 0.85);
            scheduleNext(currentInterval);
          } else {
            clearHoldTimer();
          }
        }, delay);
      };

      scheduleNext(400);
    },
    [clearHoldTimer, stepSpeed]
  );

  const handleHoldEnd = useCallback(
    (e?: React.PointerEvent) => {
      clearHoldTimer();
      if (e) {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
      }
    },
    [clearHoldTimer]
  );

  const handleButtonClick = useCallback(
    (delta: number) => {
      if (pointerHandledRef.current) {
        pointerHandledRef.current = false;
        return;
      }
      stepSpeed(delta);
    },
    [stepSpeed]
  );

  const handlePlayPause = () => {
    if (stateRef.current === 'scrolling') {
      // Explicit pause: permanently cancel auto-resume, enter idle
      stopRafLoop();
      clearAutoResumeTimers();
      transitionTo('idle');
    } else if (stateRef.current === 'interrupted') {
      // Immediate resume on play tap
      executeAutoResume();
    } else {
      // Idle -> start scrolling
      clearAutoResumeTimers();
      const metrics = getMetrics();
      const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
      const isAtBottom = maxScrollTop > 2 && maxScrollTop - metrics.scrollTop <= 2;

      if (isAtBottom) {
        metrics.scrollToTop(true);
        isResettingToTopRef.current = true;
        resetStartTimeRef.current = performance.now();
        accumulatedScrollRef.current = 0;
      } else {
        accumulatedScrollRef.current = metrics.scrollTop;
      }
      lastTimeRef.current = null;
      transitionTo('scrolling');
      startRafLoop();
    }
  };

  const handleJumpToTop = () => {
    stopRafLoop();
    clearAutoResumeTimers();
    isResettingToTopRef.current = false;
    accumulatedScrollRef.current = 0;
    lastTimeRef.current = null;
    transitionTo('idle');
    const metrics = getMetrics();
    metrics.scrollToTop(true);
  };

  return (
    <div
      ref={dockRef}
      role="region"
      aria-label="Panel automatycznego przewijania"
      className={`fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-xl z-30 ${
        isDark
          ? 'bg-neutral-900/95 text-neutral-100 border-neutral-700/80 shadow-black/60'
          : 'bg-white/95 text-neutral-900 border-neutral-300 shadow-neutral-400/30'
      } border rounded-2xl shadow-2xl backdrop-blur-md px-3.5 py-2.5 sm:px-4 sm:py-3 transition-colors ${className}`}
      style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
    >
      {/* Interruption countdown status badge & permanent pause action */}
      {state === 'interrupted' && (
        <div className="flex items-center justify-between pb-2 border-b border-amber-500/20 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Wznowienie za {countdown ?? 3}s...
          </span>
          <button
            type="button"
            onClick={stopScrolling}
            className="text-xs text-neutral-400 hover:text-neutral-200 underline cursor-pointer"
            aria-label="Pauza"
            title="Zatrzymaj automatyczne przewijanie"
          >
            Zatrzymaj
          </button>
        </div>
      )}

      {/* Main Controls Row */}
      <div className="flex items-center justify-between gap-3">
        {/* Play / Pause Toggle Button */}
        <button
          type="button"
          onClick={handlePlayPause}
          aria-label={state === 'scrolling' ? 'Pauza' : 'Start'}
          title={state === 'scrolling' ? 'Wstrzymaj automatyczne przewijanie' : 'Uruchom automatyczne przewijanie'}
          className="h-10 min-w-[40px] px-3.5 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-neutral-950 font-bold transition shadow-sm cursor-pointer select-none shrink-0"
        >
          {state === 'scrolling' ? (
            <>
              <PauseIcon className="w-4 h-4 fill-current" />
              <span className="text-sm font-semibold">Pauza</span>
            </>
          ) : (
            <>
              <PlayIcon className="w-4 h-4 fill-current ml-0.5" />
              <span className="text-sm font-semibold">Start</span>
            </>
          )}
        </button>

        {/* Dynamic Velocity Buttons & Readout */}
        <div
          role="group"
          aria-label="Prędkość przewijania"
          className="flex items-center justify-center gap-2 sm:gap-3 flex-1 min-w-0 px-1 py-1"
        >
          {/* Velocity Readout */}
          <span
            aria-live="polite"
            className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
              isDark ? 'text-amber-400' : 'text-amber-600'
            } min-w-[68px] text-center shrink-0 select-none`}
          >
            {speed} px/s
          </span>

          {/* Decrement + Increment buttons grouped together */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Decrement Button */}
            <button
              type="button"
              aria-label="Zmniejsz prędkość"
              title="Zmniejsz prędkość o 2 px/s (przytrzymaj, aby przyspieszyć)"
              disabled={speed <= 5}
              onPointerDown={(e) => handleHoldStart(-2, e)}
              onPointerUp={handleHoldEnd}
              onPointerCancel={handleHoldEnd}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => handleButtonClick(-2)}
              className={`h-10 w-10 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center border select-none touch-manipulation transition ${
                speed <= 5
                  ? 'opacity-30 cursor-not-allowed border-neutral-700/50 text-neutral-500'
                  : isDark
                  ? 'bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 border-neutral-700 cursor-pointer active:scale-95'
                  : 'bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-800 border-neutral-300 cursor-pointer active:scale-95'
              }`}
            >
              <MinusIcon className="w-4 h-4 stroke-[2.5]" />
            </button>

            {/* Increment Button */}
            <button
              type="button"
              aria-label="Zwiększ prędkość"
              title="Zwiększ prędkość o 2 px/s (przytrzymaj, aby przyspieszyć)"
              disabled={speed >= 120}
              onPointerDown={(e) => handleHoldStart(2, e)}
              onPointerUp={handleHoldEnd}
              onPointerCancel={handleHoldEnd}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => handleButtonClick(2)}
              className={`h-10 w-10 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center border select-none touch-manipulation transition ${
                speed >= 120
                  ? 'opacity-30 cursor-not-allowed border-neutral-700/50 text-neutral-500'
                  : isDark
                  ? 'bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 border-neutral-700 cursor-pointer active:scale-95'
                  : 'bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-800 border-neutral-300 cursor-pointer active:scale-95'
              }`}
            >
              <PlusIcon className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Jump-to-Top Button */}
        <button
          type="button"
          onClick={handleJumpToTop}
          aria-label="Wróć na górę"
          title="Wróć na górę"
          className={`h-10 w-10 sm:h-11 sm:w-11 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center shrink-0 border cursor-pointer transition select-none ${
            isDark
              ? 'bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 border-neutral-700'
              : 'bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-800 border-neutral-300'
          }`}
        >
          <ArrowUpIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
