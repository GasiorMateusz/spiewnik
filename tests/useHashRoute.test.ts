import { TestRunner, assert } from './helpers/test_framework';
import { HookHarness } from './helpers/hook_harness';
import { MockRoutingEnvironment } from './helpers/routing_storage_harness';
import {
  useHashRoute,
  parseHashRoute,
  areRoutesEqual,
  getSnapshot,
  getServerSnapshot,
  navigate,
} from '../src/hooks/useHashRoute';
import type { Route } from '../src/types';

export async function runUseHashRouteTests(runner: TestRunner) {
  runner.setTier('Stage 4 — Tier 1: Zero-Dependency Hash Routing (F73–F86)');

  // F73: Root and Empty Catalog Route Resolution
  await runner.test('F73: Root and catalog hash route parsing ("", "#", "#/", "#!/")', () => {
    assert.deepStrictEqual(parseHashRoute(''), { type: 'catalog' });
    assert.deepStrictEqual(parseHashRoute('#'), { type: 'catalog' });
    assert.deepStrictEqual(parseHashRoute('#/'), { type: 'catalog' });
    assert.deepStrictEqual(parseHashRoute('#!/'), { type: 'catalog' });
    assert.deepStrictEqual(parseHashRoute('#///'), { type: 'catalog' });
    assert.deepStrictEqual(parseHashRoute('#/catalog'), { type: 'not-found', path: '/catalog' });
  });

  // F74: Song Route Parsing & Slugs
  await runner.test('F74: Song route parsing extracts valid song slug', () => {
    assert.deepStrictEqual(parseHashRoute('#/song/lornetka'), { type: 'song', slug: 'lornetka' });
    assert.deepStrictEqual(parseHashRoute('#/song/wehikul-czasu'), { type: 'song', slug: 'wehikul-czasu' });
    assert.deepStrictEqual(parseHashRoute('#/song/bieszczadzkie-anioly'), { type: 'song', slug: 'bieszczadzkie-anioly' });
  });

  // F74: Query parameter and fragment truncation
  await runner.test('F74: Strips query parameters and secondary hash fragments from song route', () => {
    assert.deepStrictEqual(parseHashRoute('#/song/lornetka?offset=2&speed=40'), { type: 'song', slug: 'lornetka' });
    assert.deepStrictEqual(parseHashRoute('#/song/lornetka#section-chorus'), { type: 'song', slug: 'lornetka' });
    assert.deepStrictEqual(parseHashRoute('#/song/lornetka?offset=2#section-chorus'), { type: 'song', slug: 'lornetka' });
  });

  // F74: Trailing and duplicate slash normalization
  await runner.test('F74: Normalizes duplicate and trailing slashes in song route', () => {
    assert.deepStrictEqual(parseHashRoute('#/song/lornetka/'), { type: 'song', slug: 'lornetka' });
    assert.deepStrictEqual(parseHashRoute('#///song///lornetka///'), { type: 'song', slug: 'lornetka' });
  });

  // F75: Artist Route Parsing & Slugs
  await runner.test('F75: Artist route parsing extracts artist slug', () => {
    assert.deepStrictEqual(parseHashRoute('#/artist/dzem'), { type: 'artist', slug: 'dzem' });
    assert.deepStrictEqual(parseHashRoute('#/artist/myslovitz'), { type: 'artist', slug: 'myslovitz' });
    assert.deepStrictEqual(parseHashRoute('#/artist/dzem?tab=songs'), { type: 'artist', slug: 'dzem' });
    assert.deepStrictEqual(parseHashRoute('#/artist/dzem/'), { type: 'artist', slug: 'dzem' });
  });

  // F76: Unknown / Missing Slug Route Handling
  await runner.test('F76: Missing slugs and unknown routes map to not-found', () => {
    assert.deepStrictEqual(parseHashRoute('#/song'), { type: 'not-found', path: '/song' });
    assert.deepStrictEqual(parseHashRoute('#/song/'), { type: 'not-found', path: '/song' });
    assert.deepStrictEqual(parseHashRoute('#/artist'), { type: 'not-found', path: '/artist' });
    assert.deepStrictEqual(parseHashRoute('#/artist/'), { type: 'not-found', path: '/artist' });
    assert.deepStrictEqual(parseHashRoute('#/settings'), { type: 'not-found', path: '/settings' });
    assert.deepStrictEqual(parseHashRoute('#/song/lornetka/extra/path'), { type: 'not-found', path: '/song/lornetka/extra/path' });
  });

  // F77: Percent-Encoded Polish Diacritics Decoding
  await runner.test('F77: Percent-encoded Polish diacritics are cleanly decoded in slugs', () => {
    assert.deepStrictEqual(parseHashRoute('#/artist/d%C5%BCem'), { type: 'artist', slug: 'dżem' });
    assert.deepStrictEqual(parseHashRoute('#/song/wehiku%C5%82-czasu'), { type: 'song', slug: 'wehikuł-czasu' });
  });

  // F77: Malformed Percent-Encoding Error Shielding
  await runner.test('F77: Malformed percent-encoding does not throw URIError and degrades gracefully', () => {
    let threw = false;
    let route: Route | null = null;
    try {
      route = parseHashRoute('#/song/%E0%A4%A');
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, 'parseHashRoute must not throw URIError on malformed encoding');
    assert(route !== null && route.type === 'song', 'Degrades to song route with raw slug');
  });

  // F80 & F81: React 19 useSyncExternalStore Referential Stability
  await runner.test('F81: Consecutive getSnapshot calls return referentially identical Route object', () => {
    const env = new MockRoutingEnvironment('#/song/lornetka');
    env.install();
    try {
      const snap1 = getSnapshot();
      const snap2 = getSnapshot();
      assert.strictEqual(snap1, snap2, 'getSnapshot() must return referentially stable Route object');
      assert.deepStrictEqual(snap1, { type: 'song', slug: 'lornetka' });
    } finally {
      env.uninstall();
    }
  });

  // F80: Reactive Hook Updates on Hashchange
  await runner.test('F80: Hook updates reactively when window.location.hash changes', async () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    try {
      const harness = new HookHarness(useHashRoute, undefined);
      harness.render();
      assert.deepStrictEqual(harness.result, { type: 'catalog' });

      // Change hash
      env.setHash('#/song/lornetka');
      await harness.waitForNextUpdate(15);
      assert.deepStrictEqual(harness.result, { type: 'song', slug: 'lornetka' });

      // Change hash again
      env.setHash('#/artist/dzem');
      await harness.waitForNextUpdate(15);
      assert.deepStrictEqual(harness.result, { type: 'artist', slug: 'dzem' });

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F83: Browser History Navigation (popstate)
  await runner.test('F83: Responds to popstate events from browser back/forward buttons', async () => {
    const env = new MockRoutingEnvironment('#/song/lornetka');
    env.install();
    try {
      const harness = new HookHarness(useHashRoute, undefined);
      harness.render();
      assert.deepStrictEqual(harness.result, { type: 'song', slug: 'lornetka' });

      // Simulate browser Back button
      env.setHash('#/', false); // update location without hashchange
      env.dispatchEvent('popstate', { state: null }); // fire popstate
      await harness.waitForNextUpdate(15);
      assert.deepStrictEqual(harness.result, { type: 'catalog' });

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F84: Programmatic Navigation Helper
  await runner.test('F84: navigate() updates window.location.hash and triggers reactive hook pass', async () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    try {
      const harness = new HookHarness(useHashRoute, undefined);
      harness.render();

      navigate('#/song/whisky');
      assert.strictEqual(env.hash, '#/song/whisky');
      await harness.waitForNextUpdate(15);
      assert.deepStrictEqual(harness.result, { type: 'song', slug: 'whisky' });

      // navigate with omitted #
      navigate('/song/lornetka');
      assert.strictEqual(env.hash, '#/song/lornetka');
      await harness.waitForNextUpdate(15);
      assert.deepStrictEqual(harness.result, { type: 'song', slug: 'lornetka' });

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // F79: Zero Listener Leaks on Unmount
  await runner.test('F79: Hook unmount cleans up all event listeners with zero leaks', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    try {
      const initialHashCount = env.getListenerCount('hashchange');
      const initialPopCount = env.getListenerCount('popstate');

      const harness = new HookHarness(useHashRoute, undefined);
      harness.render();

      assert.strictEqual(env.getListenerCount('hashchange'), initialHashCount + 1, '1 hashchange listener attached');
      assert.strictEqual(env.getListenerCount('popstate'), initialPopCount + 1, '1 popstate listener attached');

      harness.unmount();

      assert.strictEqual(env.getListenerCount('hashchange'), initialHashCount, 'hashchange listener cleaned up on unmount');
      assert.strictEqual(env.getListenerCount('popstate'), initialPopCount, 'popstate listener cleaned up on unmount');
    } finally {
      env.uninstall();
    }
  });

  // F82: SSR Server Snapshot Fallback
  await runner.test('F82: getServerSnapshot returns frozen catalog route without window access', () => {
    const serverSnap = getServerSnapshot();
    assert.deepStrictEqual(serverSnap, { type: 'catalog' });
    assert(Object.isFrozen(serverSnap), 'Server snapshot must be a frozen immutable object');
  });

  // F86: areRoutesEqual utility checks
  await runner.test('F86: areRoutesEqual correctly discriminates equality across all route types', () => {
    assert(areRoutesEqual({ type: 'catalog' }, { type: 'catalog' }));
    assert(areRoutesEqual({ type: 'song', slug: 'lornetka' }, { type: 'song', slug: 'lornetka' }));
    assert(!areRoutesEqual({ type: 'song', slug: 'lornetka' }, { type: 'song', slug: 'whisky' }));
    assert(areRoutesEqual({ type: 'artist', slug: 'dzem' }, { type: 'artist', slug: 'dzem' }));
    assert(!areRoutesEqual({ type: 'song', slug: 'lornetka' }, { type: 'artist', slug: 'lornetka' }));
    assert(areRoutesEqual({ type: 'not-found', path: '/abc' }, { type: 'not-found', path: '/abc' }));
    assert(!areRoutesEqual({ type: 'not-found', path: '/abc' }, { type: 'not-found', path: '/xyz' }));
  });
}
