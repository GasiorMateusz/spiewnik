import { useEffect, useRef, useState, useCallback } from 'react';
import type { UseWakeLockResult } from '../types';

/**
 * Screen Wake Lock lifecycle hook (REQ-SCR-3).
 * Keeps device screen awake while viewing songs, auto-reacquires on tab refocus,
 * and releases cleanly on component unmount or view navigation.
 */
export function useWakeLock(enabled: boolean = true): UseWakeLockResult {
  const [isSupported] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  });
  const [isActive, setIsActive] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const enabledRef = useRef<boolean>(enabled);
  enabledRef.current = enabled;

  const handleRelease = useCallback(() => {
    sentinelRef.current = null;
    if (isMountedRef.current) {
      setIsActive(false);
    }
  }, []);

  const request = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }
    // Prevent requesting when document is in background or tab is hidden
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    // Avoid duplicate requests if already active
    if (sentinelRef.current && !sentinelRef.current.released) {
      return;
    }

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // Check if unmounted or disabled while request was awaiting
      if (!isMountedRef.current || !enabledRef.current) {
        await sentinel.release();
        return;
      }
      sentinelRef.current = sentinel;
      sentinel.addEventListener('release', handleRelease);
      setIsActive(true);
      setError(null);
    } catch (err: unknown) {
      // Gracefully handle browser rejections (NotAllowedError, AbortError, etc.)
      if (isMountedRef.current) {
        setIsActive(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }, [handleRelease]);

  const release = useCallback(async () => {
    if (sentinelRef.current && !sentinelRef.current.released) {
      try {
        await sentinelRef.current.release();
      } catch {
        // Silently swallow release errors on teardown
      }
    }
    sentinelRef.current = null;
    if (isMountedRef.current) {
      setIsActive(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      release();
      return () => {
        isMountedRef.current = false;
      };
    }

    // Acquire lock initially
    request();

    // Re-acquire lock when returning from background
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && enabledRef.current) {
        request();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isMountedRef.current = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      release();
    };
  }, [enabled, request, release]);

  return {
    isSupported,
    isActive,
    error,
    request,
    release,
  };
}
