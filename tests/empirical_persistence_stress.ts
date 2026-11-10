import fs from 'node:fs';
import { TestRunner, assert } from './helpers/test_framework';
import { HookHarness, setGlobalProperty } from './helpers/hook_harness';
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

export async function runPersistenceStressTests() {
  const runner = new TestRunner();
  runner.setTier('Empirical Persistence Stress Suite (Challenger 2)');

  console.log('\n================================================================');
  console.log('  CHALLENGER 2: EMPIRICAL PERSISTENCE STRESS TESTS');
  console.log('================================================================\n');

  // =====================================================================
  // 1. Schema enforcement and bounds clamping: Font offset [-4, 12]
  // =====================================================================
  await runner.test('P01: Font offset bounds clamping [-4, +12] adversarial matrix', () => {
    // Normal boundaries
    assert.strictEqual(validateFontOffset(-4), -4);
    assert.strictEqual(validateFontOffset(0), 0);
    assert.strictEqual(validateFontOffset(12), 12);

    // Hard underflow / overflow
    assert.strictEqual(validateFontOffset(-5), -4);
    assert.strictEqual(validateFontOffset(-1000), -4);
    assert.strictEqual(validateFontOffset(13), 12);
    assert.strictEqual(validateFontOffset(99999), 12);

    // Floating point rounding
    assert.strictEqual(validateFontOffset(3.4), 3);
    assert.strictEqual(validateFontOffset(3.6), 4);
    assert.strictEqual(validateFontOffset(-3.8), -4);
    assert.strictEqual(validateFontOffset(-4.2), -4);
    assert.strictEqual(validateFontOffset(11.8), 12);
    assert.strictEqual(validateFontOffset(12.4), 12);

    // Non-finite numbers & NaNs
    assert.strictEqual(validateFontOffset(NaN), 0);
    assert.strictEqual(validateFontOffset(Infinity), 0);
    assert.strictEqual(validateFontOffset(-Infinity), 0);

    // String coercion
    assert.strictEqual(validateFontOffset('6'), 6);
    assert.strictEqual(validateFontOffset('-2'), -2);
    assert.strictEqual(validateFontOffset('-20'), -4);
    assert.strictEqual(validateFontOffset('50'), 12);
    assert.strictEqual(validateFontOffset('3.7'), 4);
    assert.strictEqual(validateFontOffset('abc'), 0);
    assert.strictEqual(validateFontOffset(''), 0);
    assert.strictEqual(validateFontOffset('  '), 0);

    // Non-numeric types
    assert.strictEqual(validateFontOffset(null), 0);
    assert.strictEqual(validateFontOffset(undefined), 0);
    assert.strictEqual(validateFontOffset({}), 0);
    assert.strictEqual(validateFontOffset([]), 0);
    assert.strictEqual(validateFontOffset(true), 1);
    assert.strictEqual(validateFontOffset(false), 0);
  });

  // =====================================================================
  // 2. Schema enforcement and bounds clamping: Scroll speed [15, 120]
  // =====================================================================
  await runner.test('P02: Scroll speed bounds clamping [15, 120] adversarial matrix', () => {
    // Normal boundaries
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 5 }), { transpose: 0, scrollSpeed: 5 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 14 }), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 30 }), { transpose: 0, scrollSpeed: 30 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 120 }), { transpose: 0, scrollSpeed: 120 });

    // Underflow / overflow
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 4 }), { transpose: 0, scrollSpeed: 5 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 0 }), { transpose: 0, scrollSpeed: 5 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: -50 }), { transpose: 0, scrollSpeed: 5 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 121 }), { transpose: 0, scrollSpeed: 120 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 9999 }), { transpose: 0, scrollSpeed: 120 });

    // Floating point values
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 45.7 }), { transpose: 0, scrollSpeed: 45.7 });

    // Non-finite and NaN values fallback to default 14
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: NaN }), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: Infinity }), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: -Infinity }), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: undefined }), { transpose: 0, scrollSpeed: 14 });

    // String coercion
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: '60' }), { transpose: 0, scrollSpeed: 60 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: '5' }), { transpose: 0, scrollSpeed: 5 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: '3' }), { transpose: 0, scrollSpeed: 5 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: '250' }), { transpose: 0, scrollSpeed: 120 });
    assert.deepStrictEqual(validateSongPreferences({ transpose: 0, scrollSpeed: 'slow' }), { transpose: 0, scrollSpeed: 14 });

    // Malformed objects
    assert.deepStrictEqual(validateSongPreferences(null), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences(undefined), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences([]), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences('invalid'), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences(123), { transpose: 0, scrollSpeed: 14 });
    assert.deepStrictEqual(validateSongPreferences({}), { transpose: 0, scrollSpeed: 14 });
  });

  // =====================================================================
  // 3. Corrupted JSON in localStorage: Malformed strings
  // =====================================================================
  await runner.test('P03: Corrupted JSON strings in localStorage cleanly fall back to default values', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const corruptedPayloads = [
        '{ broken: json :::',
        '{"transpose": 2', // truncated JSON
        '{"transpose": 2,}', // dangling comma
        'undefined',
        'NaN',
        'Infinity',
        '\x00\x01\x02\xFF', // binary gibberish
        '   ',
        '',
        '<html><body>404</body></html>',
      ];

      for (const payload of corruptedPayloads) {
        env.localStorage.setItem('test_corrupt', payload);
        let res: any;
        let threw = false;
        try {
          res = readStorage('test_corrupt', { default: 'safe' });
        } catch {
          threw = true;
        }

        assert.strictEqual(threw, false, `Must not throw on payload: ${payload}`);
        assert.deepStrictEqual(res, { default: 'safe' }, `Must return fallback on payload: ${payload}`);
      }
    } finally {
      env.uninstall();
    }
  });

  // =====================================================================
  // 4. Corrupted JSON with validator enforcement: Wrong data types & mixed arrays
  // =====================================================================
  await runner.test('P04: Valid JSON but corrupted types handled by validators', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      // 1. Theme with invalid strings/numbers
      env.localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify('super-dark'));
      assert.strictEqual(readStorage(STORAGE_KEYS.THEME, 'dark', validateTheme), 'dark');
      env.localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(12345));
      assert.strictEqual(readStorage(STORAGE_KEYS.THEME, 'dark', validateTheme), 'dark');
      env.localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(null));
      assert.strictEqual(readStorage(STORAGE_KEYS.THEME, 'dark', validateTheme), 'dark');

      // 2. Instrument with invalid strings/objects
      env.localStorage.setItem(STORAGE_KEYS.INSTRUMENT, JSON.stringify('synthesizer'));
      assert.strictEqual(readStorage(STORAGE_KEYS.INSTRUMENT, 'guitar', validateInstrument), 'guitar');
      env.localStorage.setItem(STORAGE_KEYS.INSTRUMENT, JSON.stringify({ instrument: 'ukulele' }));
      assert.strictEqual(readStorage(STORAGE_KEYS.INSTRUMENT, 'guitar', validateInstrument), 'guitar');

      // 3. Polish notation with non-boolean values
      env.localStorage.setItem(STORAGE_KEYS.POLISH_NOTATION, JSON.stringify('false'));
      assert.strictEqual(readStorage(STORAGE_KEYS.POLISH_NOTATION, true, validatePolishNotation), true);
      env.localStorage.setItem(STORAGE_KEYS.POLISH_NOTATION, JSON.stringify(0));
      assert.strictEqual(readStorage(STORAGE_KEYS.POLISH_NOTATION, true, validatePolishNotation), true);

      // 4. Font offset with array/object/string
      env.localStorage.setItem(STORAGE_KEYS.FONT_OFFSET, JSON.stringify('25'));
      assert.strictEqual(readStorage(STORAGE_KEYS.FONT_OFFSET, 0, validateFontOffset), 12);
      env.localStorage.setItem(STORAGE_KEYS.FONT_OFFSET, JSON.stringify('-50'));
      assert.strictEqual(readStorage(STORAGE_KEYS.FONT_OFFSET, 0, validateFontOffset), -4);
      env.localStorage.setItem(STORAGE_KEYS.FONT_OFFSET, JSON.stringify({ size: 10 }));
      assert.strictEqual(readStorage(STORAGE_KEYS.FONT_OFFSET, 0, validateFontOffset), 0);

      // 5. Favorites array with mixed types, nulls, empty strings, and duplicates
      const mixedFavorites = [
        'lornetka',
        '',
        '   ',
        null,
        undefined,
        123,
        { slug: 'wehikul' },
        ['nested'],
        'whisky',
        'lornetka', // duplicate
      ];
      env.localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(mixedFavorites));
      const validatedFavs = readStorage(STORAGE_KEYS.FAVORITES, [], validateFavorites);
      assert.deepStrictEqual(validatedFavs, ['lornetka', 'whisky'], 'Only non-empty unique string slugs survive');

      // Favorites as non-array
      env.localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify('not-an-array'));
      assert.deepStrictEqual(readStorage(STORAGE_KEYS.FAVORITES, [], validateFavorites), []);

      // 6. Song preferences with inverted / missing keys
      env.localStorage.setItem('spiewnik_song_pref_test', JSON.stringify({ transpose: 'not_num', scrollSpeed: 'fast' }));
      assert.deepStrictEqual(readStorage('spiewnik_song_pref_test', { transpose: 0, scrollSpeed: 14 }, validateSongPreferences), {
        transpose: 0,
        scrollSpeed: 14,
      });

      env.localStorage.setItem('spiewnik_song_pref_test', JSON.stringify({ transpose: 4 })); // missing scrollSpeed
      assert.deepStrictEqual(readStorage('spiewnik_song_pref_test', { transpose: 0, scrollSpeed: 14 }, validateSongPreferences), {
        transpose: 4,
        scrollSpeed: 14,
      });

      env.localStorage.setItem('spiewnik_song_pref_test', JSON.stringify([1, 2, 3])); // array instead of object
      assert.deepStrictEqual(readStorage('spiewnik_song_pref_test', { transpose: 0, scrollSpeed: 14 }, validateSongPreferences), {
        transpose: 0,
        scrollSpeed: 14,
      });

      // Prototype pollution attempt parsed as valid JSON handled cleanly by validator
      env.localStorage.setItem('spiewnik_song_pref_test', '{"__proto__": {"polluted": true}}');
      assert.deepStrictEqual(readStorage('spiewnik_song_pref_test', { transpose: 0, scrollSpeed: 14 }, validateSongPreferences), {
        transpose: 0,
        scrollSpeed: 14,
      });
    } finally {
      env.uninstall();
    }
  });

  // =====================================================================
  // 5. QuotaExceededError and SecurityError fault injection
  // =====================================================================
  await runner.test('P05: QuotaExceededError fault injection: catches error safely without throwing', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      env.localStorage.simulateQuotaExceeded(true);

      // Writing with quota exceeded should NOT throw
      let threw = false;
      try {
        writeStorage('fresh_quota_key', { transpose: 2, scrollSpeed: 45 });
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, 'QuotaExceededError must be caught gracefully');

      // In-memory state updated for fresh key
      const readVal = readStorage('fresh_quota_key', { transpose: 0, scrollSpeed: 30 }, validateSongPreferences);
      assert.deepStrictEqual(readVal, { transpose: 2, scrollSpeed: 45 }, 'Memory store preserves data on fresh key');
    } finally {
      env.uninstall();
    }
  });

  await runner.test('P06: SecurityError fault injection (Private Browsing / Blocked Storage)', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      // Simulate SecurityError on every localStorage access
      env.localStorage.simulateSecurityError(true);

      let threw = false;
      try {
        writeStorage('sec_test_key', { secret: 'data' });
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, 'writeStorage must not throw SecurityError');

      // Read back from memory
      const readVal = readStorage('sec_test_key', null);
      assert.deepStrictEqual(readVal, { secret: 'data' }, 'Memory store preserves data during SecurityError');

      // Verify useLocalStorage hook functions in private browsing mode
      const harness = new HookHarness(() => useLocalStorage<string>('sec_hook', 'init'), undefined);
      harness.render();
      assert.strictEqual(harness.result[0], 'init');

      harness.result[1]('private_modified');
      harness.render();
      assert.strictEqual(harness.result[0], 'private_modified');

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('P07: Total window.localStorage denial (window.localStorage getter throws SecurityError)', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();

    // Redefine window.localStorage getter to throw DOMException SecurityError
    const originalWindow = (globalThis as any).window;
    const restrictedWindow = {
      ...originalWindow,
      get localStorage(): Storage {
        throw new DOMException('Access denied by browser security policy', 'SecurityError');
      },
    };

    const restoreWindow = setGlobalProperty('window', restrictedWindow);
    try {
      let threw = false;
      try {
        writeStorage('hostile_sec_key', 'safe_data');
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, 'writeStorage must not crash when window.localStorage getter throws');

      let readVal: any;
      try {
        readVal = readStorage('hostile_sec_key', 'fallback');
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, 'readStorage must not crash when window.localStorage getter throws');
      assert.strictEqual(readVal, 'safe_data', 'readStorage must fall back to memoryStore');
    } finally {
      restoreWindow();
      env.uninstall();
    }
  });

  // =====================================================================
  // 6. Intra-tab and inter-tab storage updates
  // =====================================================================
  await runner.test('P08: Intra-tab synchronization across 3 concurrent sibling hooks', async () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const hookA = new HookHarness(() => useTheme(), undefined);
      const hookB = new HookHarness(() => useTheme(), undefined);
      const hookC = new HookHarness(() => useTheme(), undefined);

      hookA.render();
      hookB.render();
      hookC.render();

      assert.strictEqual(hookA.result[0], 'dark');
      assert.strictEqual(hookB.result[0], 'dark');
      assert.strictEqual(hookC.result[0], 'dark');

      // Hook A triggers change to 'light'
      hookA.result[1]('light');

      await hookB.waitForNextUpdate(25);
      await hookC.waitForNextUpdate(25);

      assert.strictEqual(hookA.result[0], 'light');
      assert.strictEqual(hookB.result[0], 'light', 'Hook B synchronized with Hook A');
      assert.strictEqual(hookC.result[0], 'light', 'Hook C synchronized with Hook A');

      // Hook C triggers change back to 'dark'
      hookC.result[1]('dark');

      await hookA.waitForNextUpdate(25);
      await hookB.waitForNextUpdate(25);

      assert.strictEqual(hookA.result[0], 'dark', 'Hook A synchronized with Hook C');
      assert.strictEqual(hookB.result[0], 'dark', 'Hook B synchronized with Hook C');
      assert.strictEqual(hookC.result[0], 'dark');

      hookA.unmount();
      hookB.unmount();
      hookC.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('P09: Storage event synchronization (Inter-Tab) with edge cases', async () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const harness = new HookHarness(() => useInstrument(), undefined);
      harness.render();
      assert.strictEqual(harness.result[0], 'guitar');

      // 1. StorageEvent for a different key should NOT affect this hook
      env.dispatchEvent('storage', {
        key: STORAGE_KEYS.THEME,
        newValue: JSON.stringify('light'),
      });
      assert.strictEqual(harness.result[0], 'guitar', 'Unrelated storage event ignored');

      // 2. StorageEvent for this key updates the hook
      env.localStorage.setItem(STORAGE_KEYS.INSTRUMENT, JSON.stringify('ukulele'));
      env.dispatchEvent('storage', {
        key: STORAGE_KEYS.INSTRUMENT,
        newValue: JSON.stringify('ukulele'),
      });

      await harness.waitForNextUpdate(25);
      assert.strictEqual(harness.result[0], 'ukulele', 'Updated to ukulele via storage event');

      // 3. StorageEvent with null newValue (e.g. key cleared) reverts to default value
      env.localStorage.removeItem(STORAGE_KEYS.INSTRUMENT);
      env.dispatchEvent('storage', {
        key: STORAGE_KEYS.INSTRUMENT,
        newValue: null,
      });

      await harness.waitForNextUpdate(25);
      assert.strictEqual(harness.result[0], 'guitar', 'Cleared key reverts to default instrument');

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('P10: Listener cleanup on unmount (zero event listener leaks)', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const initialStorageListeners = env.getListenerCount('storage');
      const initialCustomSyncListeners = env.getListenerCount('spiewnik-storage-sync');

      const hook1 = new HookHarness(() => useTheme(), undefined);
      const hook2 = new HookHarness(() => useTheme(), undefined);

      hook1.render();
      hook2.render();

      assert.strictEqual(env.getListenerCount('storage'), initialStorageListeners + 2);
      assert.strictEqual(env.getListenerCount('spiewnik-storage-sync'), initialCustomSyncListeners + 2);

      hook1.unmount();
      assert.strictEqual(env.getListenerCount('storage'), initialStorageListeners + 1);
      assert.strictEqual(env.getListenerCount('spiewnik-storage-sync'), initialCustomSyncListeners + 1);

      hook2.unmount();
      assert.strictEqual(env.getListenerCount('storage'), initialStorageListeners);
      assert.strictEqual(env.getListenerCount('spiewnik-storage-sync'), initialCustomSyncListeners);
    } finally {
      env.uninstall();
    }
  });

  // =====================================================================
  // 7. Per-Song Preference Isolation & Unicode Slugs
  // =====================================================================
  await runner.test('P11: Multi-song preference isolation across sequential transitions & Polish diacritics', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const songASlug = 'bieszczadzkie-anioly';
      const songBSlug = 'wehikul-czasu';
      const songCSlug = 'piosenka-z-ogrodka-za-mgla-zoltym';

      const hookA = new HookHarness(() => useSongPreferences(songASlug), undefined);
      const hookB = new HookHarness(() => useSongPreferences(songBSlug), undefined);
      const hookC = new HookHarness(() => useSongPreferences(songCSlug), undefined);

      hookA.render();
      hookB.render();
      hookC.render();

      // All start at default
      assert.deepStrictEqual(hookA.result[0], { transpose: 0, scrollSpeed: 14 });
      assert.deepStrictEqual(hookB.result[0], { transpose: 0, scrollSpeed: 14 });
      assert.deepStrictEqual(hookC.result[0], { transpose: 0, scrollSpeed: 14 });

      // Mutate Song A
      hookA.result[1]({ transpose: 4, scrollSpeed: 75 });
      hookA.render();
      assert.deepStrictEqual(hookA.result[0], { transpose: 4, scrollSpeed: 75 });
      assert.deepStrictEqual(hookB.result[0], { transpose: 0, scrollSpeed: 14 }, 'Song B untouched');
      assert.deepStrictEqual(hookC.result[0], { transpose: 0, scrollSpeed: 14 }, 'Song C untouched');

      // Mutate Song C with clamped speed
      hookC.result[1]({ transpose: -2, scrollSpeed: 200 }); // 200 should clamp to 120
      hookC.render();
      assert.deepStrictEqual(hookC.result[0], { transpose: -2, scrollSpeed: 120 });
      assert.deepStrictEqual(hookA.result[0], { transpose: 4, scrollSpeed: 75 }, 'Song A preserved');
      assert.deepStrictEqual(hookB.result[0], { transpose: 0, scrollSpeed: 14 }, 'Song B preserved');

      // Verify localStorage entries
      const storedA = JSON.parse(env.localStorage.getItem(getSongPrefKey(songASlug))!);
      const storedC = JSON.parse(env.localStorage.getItem(getSongPrefKey(songCSlug))!);

      assert.deepStrictEqual(storedA, { transpose: 4, scrollSpeed: 75 });
      assert.deepStrictEqual(storedC, { transpose: -2, scrollSpeed: 120 });
      assert.strictEqual(env.localStorage.getItem(getSongPrefKey(songBSlug)), null, 'Song B never written');

      hookA.unmount();
      hookB.unmount();
      hookC.unmount();
    } finally {
      env.uninstall();
    }
  });

  // =====================================================================
  // 8. Zero external state management libraries in package.json
  // =====================================================================
  await runner.test('P12: Strictly zero third-party state or persistence libraries', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = Object.keys(pkg.dependencies || {});
    const devDependencies = Object.keys(pkg.devDependencies || {});
    const all = [...dependencies, ...devDependencies];

    const forbidden = [
      'redux',
      '@reduxjs/toolkit',
      'zustand',
      'jotai',
      'recoil',
      'mobx',
      'valtio',
      'pinia',
      'xstate',
      'dexie',
      'localforage',
      'react-router',
      'react-router-dom',
      'wouter',
      '@tanstack/react-router',
    ];

    for (const lib of forbidden) {
      assert(!all.includes(lib), `Forbidden library "${lib}" found in package.json!`);
    }

    // Only allowable production dependencies
    const allowedProd = ['@tombatossals/chords-db', 'react', 'react-dom'];
    for (const dep of dependencies) {
      assert(allowedProd.includes(dep), `Unexpected production dependency: "${dep}"`);
    }
  });

  // Summary
  const results = runner.getResults();
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\nEmpirical Persistence Stress Suite: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    throw new Error(`${failed} persistence stress tests failed!`);
  }
}

// Execute standalone when run directly via node
runPersistenceStressTests().catch((err) => {
  console.error('Empirical Stress Harness Error:', err);
  process.exit(1);
});
