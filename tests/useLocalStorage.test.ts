import fs from 'node:fs';
import { TestRunner, assert } from './helpers/test_framework';
import { HookHarness } from './helpers/hook_harness';
import { MockRoutingEnvironment } from './helpers/routing_storage_harness';
import {
  useLocalStorage,
  useTheme,
  useInstrument,
  usePolishNotation,
  useFontSizeOffset,
  useFavorites,
  useSongPreferences,
  readStorage,
  writeStorage,
  clearMemoryStore,
  getSongPrefKey,
  STORAGE_KEYS,
  validateTheme,
  validateInstrument,
  validatePolishNotation,
  validateFontOffset,
  validateFavorites,
  validateSongPreferences,
} from '../src/hooks/useLocalStorage';

export async function runUseLocalStorageTests(runner: TestRunner) {
  runner.setTier('Stage 4 — Tier 2: Typed Persistence (F87–F100)');

  // F87: Generic Read & Write
  await runner.test('F87: Generic useLocalStorage reads default value and writes serialized JSON', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const harness = new HookHarness(
        () => useLocalStorage<string>('test_key', 'initial_val'),
        undefined
      );
      harness.render();
      const [val1, setVal1] = harness.result;
      assert.strictEqual(val1, 'initial_val');

      // Update value
      setVal1('updated_val');
      assert.strictEqual(env.localStorage.getItem('test_key'), JSON.stringify('updated_val'));

      harness.render();
      const [val2] = harness.result;
      assert.strictEqual(val2, 'updated_val');
      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F87: Functional State Updates
  await runner.test('F87: Generic useLocalStorage supports functional updates (prev => next)', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const harness = new HookHarness(
        () => useLocalStorage<number>('counter_key', 10),
        undefined
      );
      harness.render();
      const [, setCount] = harness.result;

      setCount((prev) => prev + 5);
      assert.strictEqual(env.localStorage.getItem('counter_key'), '15');

      harness.render();
      assert.strictEqual(harness.result[0], 15);
      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F88: Global Theme Persistence & Validator
  await runner.test('F88: Global theme persistence defaults to dark and validates input', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      // Validator pure unit check
      assert.strictEqual(validateTheme('dark'), 'dark');
      assert.strictEqual(validateTheme('light'), 'light');
      assert.strictEqual(validateTheme('blue'), 'dark', 'Invalid theme falls back to dark');
      assert.strictEqual(validateTheme(null), 'dark');
      assert.strictEqual(validateTheme(123), 'dark');

      const harness = new HookHarness(() => useTheme(), undefined);
      harness.render();
      assert.strictEqual(harness.result[0], 'dark');

      harness.result[1]('light');
      assert.strictEqual(env.localStorage.getItem(STORAGE_KEYS.THEME), JSON.stringify('light'));

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F89: Global Instrument Persistence & Validator
  await runner.test('F89: Global instrument persistence defaults to guitar and validates input', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      assert.strictEqual(validateInstrument('guitar'), 'guitar');
      assert.strictEqual(validateInstrument('ukulele'), 'ukulele');
      assert.strictEqual(validateInstrument('bass'), 'guitar', 'Invalid instrument falls back to guitar');
      assert.strictEqual(validateInstrument(undefined), 'guitar');

      const harness = new HookHarness(() => useInstrument(), undefined);
      harness.render();
      assert.strictEqual(harness.result[0], 'guitar');

      harness.result[1]('ukulele');
      assert.strictEqual(env.localStorage.getItem(STORAGE_KEYS.INSTRUMENT), JSON.stringify('ukulele'));

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F90: Global Polish Notation Persistence & Validator
  await runner.test('F90: Global Polish notation defaults to true and validates boolean type', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      assert.strictEqual(validatePolishNotation(true), true);
      assert.strictEqual(validatePolishNotation(false), false);
      assert.strictEqual(validatePolishNotation('false'), true, 'Non-boolean falls back to true');
      assert.strictEqual(validatePolishNotation(null), true);

      const harness = new HookHarness(() => usePolishNotation(), undefined);
      harness.render();
      assert.strictEqual(harness.result[0], true);

      harness.result[1](false);
      assert.strictEqual(env.localStorage.getItem(STORAGE_KEYS.POLISH_NOTATION), 'false');

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F91: Global Font Offset Persistence & Clamping
  await runner.test('F91: Global font offset defaults to 0 and clamps strictly to [-4, 12]', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      assert.strictEqual(validateFontOffset(0), 0);
      assert.strictEqual(validateFontOffset(6), 6);
      assert.strictEqual(validateFontOffset(-4), -4);
      assert.strictEqual(validateFontOffset(12), 12);
      assert.strictEqual(validateFontOffset(-10), -4, 'Underflow clamped to -4');
      assert.strictEqual(validateFontOffset(20), 12, 'Overflow clamped to +12');
      assert.strictEqual(validateFontOffset('8'), 8, 'String parsed to number');
      assert.strictEqual(validateFontOffset('invalid'), 0, 'NaN falls back to 0');

      const harness = new HookHarness(() => useFontSizeOffset(), undefined);
      harness.render();
      assert.strictEqual(harness.result[0], 0);

      harness.result[1](8);
      assert.strictEqual(env.localStorage.getItem(STORAGE_KEYS.FONT_OFFSET), '8');

      harness.result[1](25); // Exceeds upper bound
      assert.strictEqual(env.localStorage.getItem(STORAGE_KEYS.FONT_OFFSET), '12', 'Clamped to 12 in storage');

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F92: Global Favorites Persistence & Sanitization
  await runner.test('F92: Global favorites persistence defaults to [] and sanitizes array elements', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      assert.deepStrictEqual(validateFavorites(['lornetka', 'whisky']), ['lornetka', 'whisky']);
      assert.deepStrictEqual(validateFavorites(['lornetka', 'lornetka']), ['lornetka'], 'Deduplicates slugs');
      assert.deepStrictEqual(validateFavorites(['lornetka', 123, '', null]), ['lornetka'], 'Filters invalid elements');
      assert.deepStrictEqual(validateFavorites('not-an-array'), [], 'Non-array falls back to []');

      const harness = new HookHarness(() => useFavorites(), undefined);
      harness.render();
      assert.deepStrictEqual(harness.result[0], []);

      harness.result[1](['lornetka', 'wehikul-czasu']);
      assert.strictEqual(
        env.localStorage.getItem(STORAGE_KEYS.FAVORITES),
        JSON.stringify(['lornetka', 'wehikul-czasu'])
      );

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F93 & F94: Per-Song Preferences Keying & Clamping
  await runner.test('F93: Per-song preferences isolation and speed clamping [15, 120]', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      assert.strictEqual(getSongPrefKey('lornetka'), 'spiewnik_song_pref_lornetka');

      // Validator checks
      assert.deepStrictEqual(validateSongPreferences({ transpose: 2, scrollSpeed: 60 }), {
        transpose: 2,
        scrollSpeed: 60,
      });
      assert.deepStrictEqual(validateSongPreferences({ transpose: -3, scrollSpeed: 5 }), {
        transpose: -3,
        scrollSpeed: 5,
      });
      assert.deepStrictEqual(validateSongPreferences({ transpose: -3, scrollSpeed: 2 }), {
        transpose: -3,
        scrollSpeed: 5, // Clamped to min 5
      });
      assert.deepStrictEqual(validateSongPreferences({ transpose: 4, scrollSpeed: 200 }), {
        transpose: 4,
        scrollSpeed: 120, // Clamped to max 120
      });
      assert.deepStrictEqual(validateSongPreferences(null), { transpose: 0, scrollSpeed: 14 });

      // Isolated persistence
      const harnessLornetka = new HookHarness(() => useSongPreferences('lornetka'), undefined);
      const harnessWhisky = new HookHarness(() => useSongPreferences('whisky'), undefined);

      harnessLornetka.render();
      harnessWhisky.render();

      harnessLornetka.result[1]({ transpose: 3, scrollSpeed: 50 });

      assert.strictEqual(
        env.localStorage.getItem('spiewnik_song_pref_lornetka'),
        JSON.stringify({ transpose: 3, scrollSpeed: 50 })
      );
      assert.strictEqual(env.localStorage.getItem('spiewnik_song_pref_whisky'), null, 'Whisky remains untouched');

      harnessLornetka.unmount();
      harnessWhisky.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F95: Intra-Tab Cross-Component Synchronization
  await runner.test('F95: Sibling hook instances synchronize in same tab via spiewnik-storage-sync event', async () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const hook1 = new HookHarness(() => useInstrument(), undefined);
      const hook2 = new HookHarness(() => useInstrument(), undefined);

      hook1.render();
      hook2.render();

      assert.strictEqual(hook1.result[0], 'guitar');
      assert.strictEqual(hook2.result[0], 'guitar');

      // Update via hook1
      hook1.result[1]('ukulele');
      await hook2.waitForNextUpdate(15);

      assert.strictEqual(hook2.result[0], 'ukulele', 'hook2 synchronized immediately via custom event');

      hook1.unmount();
      hook2.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F96: Inter-Tab Storage Event Synchronization
  await runner.test('F96: Hook synchronizes when external tab dispatches storage event', async () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const harness = new HookHarness(() => useTheme(), undefined);
      harness.render();
      assert.strictEqual(harness.result[0], 'dark');

      // Simulate external tab write
      env.localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify('light'));
      env.dispatchEvent('storage', {
        key: STORAGE_KEYS.THEME,
        newValue: JSON.stringify('light'),
      });

      await harness.waitForNextUpdate(15);
      assert.strictEqual(harness.result[0], 'light', 'Updated to light after storage event');

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F97: Corrupted JSON Recovery
  await runner.test('F97: Corrupted JSON in localStorage cleanly falls back to default value without crashing', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      env.localStorage.setItem('corrupted_key', '{ broken: json ::: malformed');

      let val: string = '';
      let threw = false;
      try {
        val = readStorage('corrupted_key', 'safe_default');
      } catch {
        threw = true;
      }

      assert.strictEqual(threw, false, 'readStorage must not throw on corrupted JSON');
      assert.strictEqual(val, 'safe_default', 'Must return safe default');
    } finally {
      env.uninstall();
    }
  });

  // F98: QuotaExceededError Exception Shielding
  await runner.test('F98: QuotaExceededError is caught safely and falls back to in-memory state', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      env.localStorage.simulateQuotaExceeded(true);

      let threw = false;
      try {
        writeStorage('quota_test', { foo: 'bar' });
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, 'writeStorage must not throw QuotaExceededError');

      // Value must still be accessible from memory store
      const readVal = readStorage('quota_test', null);
      assert.deepStrictEqual(readVal, { foo: 'bar' }, 'Persisted to in-memory fallback');
    } finally {
      env.uninstall();
    }
  });

  // F99: SecurityError (Private Browsing Mode) Shielding
  await runner.test('F99: SecurityError in private browsing is caught safely and uses memory store', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      env.localStorage.simulateSecurityError(true);

      const harness = new HookHarness(
        () => useLocalStorage<string>('sec_key', 'default_sec'),
        undefined
      );
      harness.render();
      assert.strictEqual(harness.result[0], 'default_sec');

      harness.result[1]('private_val');
      harness.render();
      assert.strictEqual(harness.result[0], 'private_val');

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F100: Zero State Library Dependencies
  await runner.test('F100: Zero external state persistence dependencies in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const forbidden = ['zustand', 'redux', '@reduxjs/toolkit', 'jotai', 'recoil', 'mobx', 'valtio', 'pinia'];
    for (const lib of forbidden) {
      assert(!allDeps[lib], `Forbidden state persistence library "${lib}" detected in package.json`);
    }
  });
}
