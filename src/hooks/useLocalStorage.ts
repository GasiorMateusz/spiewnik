import { useState, useEffect, useCallback, useRef } from 'react';
import type { Instrument, SongPreferences } from '../types';

/**
 * Standard Storage Keys matching docs/PLAN.md §1.3
 */
export const STORAGE_KEYS = {
  THEME: 'spiewnik_theme',
  INSTRUMENT: 'spiewnik_instrument',
  POLISH_NOTATION: 'spiewnik_polish_notation',
  FONT_OFFSET: 'spiewnik_font_offset',
  FAVORITES: 'spiewnik_favorites',
  SONG_PREF_PREFIX: 'spiewnik_song_pref_',
} as const;

export function getSongPrefKey(slug: string): string {
  return `${STORAGE_KEYS.SONG_PREF_PREFIX}${slug}`;
}

// In-memory fallback map for environments where localStorage is unavailable
// (e.g., SecurityError in private browsing or QuotaExceededError)
const memoryStore = new Map<string, string>();

function getStorageSafe(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Read from localStorage with JSON parsing, validation, and defensive fallback.
 */
export function readStorage<T>(key: string, defaultValue: T, validator?: (val: unknown) => T): T {
  try {
    const storage = getStorageSafe();
    const raw = (storage ? storage.getItem(key) : null) ?? memoryStore.get(key) ?? null;
    if (raw === null) return defaultValue;
    const parsed = JSON.parse(raw);
    return validator ? validator(parsed) : (parsed as T);
  } catch {
    return defaultValue;
  }
}

/**
 * Write to localStorage immediately with JSON serialization,
 * error handling (QuotaExceededError/SecurityError), and intra-tab event dispatch.
 */
export function writeStorage<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  const storage = getStorageSafe();
  let writtenToStorage = false;

  if (storage) {
    try {
      storage.setItem(key, serialized);
      writtenToStorage = true;
    } catch (err) {
      console.warn(`[useLocalStorage] Storage write failed for key "${key}", falling back to memory:`, err);
    }
  }

  if (!writtenToStorage) {
    memoryStore.set(key, serialized);
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('spiewnik-storage-sync', {
          detail: { key, value },
        })
      );
    } catch {
      // Safe fallback if CustomEvent constructor fails
    }
  }
}

export function clearMemoryStore(): void {
  memoryStore.clear();
}

// ==========================================
// Schema Validators & Bound Clampers
// ==========================================

export function validateTheme(val: unknown): 'dark' | 'light' {
  return val === 'light' ? 'light' : 'dark';
}

export function validateInstrument(val: unknown): Instrument {
  return val === 'ukulele' ? 'ukulele' : 'guitar';
}

export function validatePolishNotation(val: unknown): boolean {
  return typeof val === 'boolean' ? val : true;
}

export function validateFontOffset(val: unknown): number {
  const num = Number(val);
  return Number.isFinite(num) ? Math.max(-4, Math.min(12, Math.round(num))) : 0;
}

export function validateFavorites(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return [...new Set(val.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))];
}

export function validateSongPreferences(val: unknown): SongPreferences {
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    return { transpose: 0, scrollSpeed: 30 };
  }
  const obj = val as Record<string, unknown>;
  const rawT = Number(obj.transpose);
  const rawS = Number(obj.scrollSpeed);
  return {
    transpose: Number.isFinite(rawT) ? Math.round(rawT) : 0,
    scrollSpeed: Number.isFinite(rawS) ? Math.max(15, Math.min(120, rawS)) : 30,
  };
}

// ==========================================
// Main useLocalStorage Hook
// ==========================================

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  validator?: (val: unknown) => T
): [T, (val: T | ((prev: T) => T)) => void] {
  const validatorRef = useRef(validator);
  validatorRef.current = validator;

  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  const [value, setValue] = useState<T>(() => readStorage(key, defaultValue, validator));

  useEffect(() => {
    // Re-synchronize when key changes
    setValue(readStorage(key, defaultValueRef.current, validatorRef.current));

    if (typeof window === 'undefined') return;

    // Inter-tab synchronization (StorageEvent from other windows)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === key) {
        setValue(readStorage(key, defaultValueRef.current, validatorRef.current));
      }
    };

    // Intra-tab synchronization (CustomEvent within this window)
    const handleCustomSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; value: unknown }>;
      if (customEvent.detail && customEvent.detail.key === key) {
        setValue(readStorage(key, defaultValueRef.current, validatorRef.current));
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('spiewnik-storage-sync', handleCustomSync);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('spiewnik-storage-sync', handleCustomSync);
    };
  }, [key]);

  const setStoredValue = useCallback(
    (action: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const nextValue = typeof action === 'function'
          ? (action as (prev: T) => T)(prev)
          : action;
        const validated = validatorRef.current ? validatorRef.current(nextValue) : nextValue;
        writeStorage(key, validated);
        return validated;
      });
    },
    [key]
  );

  return [value, setStoredValue];
}

// ==========================================
// Convenience Typed Hooks
// ==========================================

export function useTheme() {
  return useLocalStorage<'dark' | 'light'>(STORAGE_KEYS.THEME, 'dark', validateTheme);
}

export function useInstrument() {
  return useLocalStorage<Instrument>(STORAGE_KEYS.INSTRUMENT, 'guitar', validateInstrument);
}

export function usePolishNotation() {
  return useLocalStorage<boolean>(STORAGE_KEYS.POLISH_NOTATION, true, validatePolishNotation);
}

export function useFontSizeOffset() {
  return useLocalStorage<number>(STORAGE_KEYS.FONT_OFFSET, 0, validateFontOffset);
}

export function useFavorites() {
  return useLocalStorage<string[]>(STORAGE_KEYS.FAVORITES, [], validateFavorites);
}

export function useSongPreferences(slug: string) {
  return useLocalStorage<SongPreferences>(
    getSongPrefKey(slug),
    { transpose: 0, scrollSpeed: 30 },
    validateSongPreferences
  );
}
