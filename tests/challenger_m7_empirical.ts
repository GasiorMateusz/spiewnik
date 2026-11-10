import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { TestRunner, assert } from './helpers/test_framework';
import { HookHarness } from './helpers/hook_harness';
import { MockRoutingEnvironment } from './helpers/routing_storage_harness';
import { SongList } from '../src/components/SongList';
import {
  STORAGE_KEYS,
  validateFavorites,
  useFavorites,
  useLocalStorage,
  readStorage,
  writeStorage,
  clearMemoryStore,
} from '../src/hooks/useLocalStorage';
import {
  normalizeSearchText,
  cleanLyricLine,
  extractLyricSnippet,
  matchSong,
  extractCatalogTags,
  extractArtistCatalog,
  artistToSlug,
} from '../src/lib/search';
import type { ParsedSong, SongListProps } from '../src/types';

// ============================================================================
// PRODUCTION TEST FIXTURES
// ============================================================================

const FIXTURE_LORNETKA: ParsedSong = {
  slug: 'lornetka',
  title: 'Lornetka',
  artist: 'Golec uOrkiestra',
  key: 'G',
  tags: ['folk', 'golec'],
  rawLyrics: `[Zwrotka 1]
[G]Kupiłek se lornetkę by [C]oglądać świat
[D]Siedzę se na dachu już od [G]kilku lat
[Refren]
[C]Widać stąd rzekę i [G]widać stąd las
[D]Oglądam ludzi już [G]cały ten czas`,
  lines: [
    { type: 'section-header', header: 'Zwrotka 1' },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'G', lyrics: 'Kupiłek se lornetkę by ' },
        { chord: 'C', lyrics: 'oglądać świat' },
      ],
    },
  ],
  uniqueChords: ['G', 'C', 'D'],
};

const FIXTURE_WEHIKUL: ParsedSong = {
  slug: 'wehikul-czasu',
  title: 'Wehikuł czasu',
  artist: 'Dżem',
  key: 'A',
  tags: ['rock', 'dzem', 'klasyka'],
  rawLyrics: `[Zwrotka 1]
[A]Pamiętam dobrze ten [E]wspaniały czas
[D]Gdy na ulicach rządził [A]rock and roll
[Refren]
[A]Tylko nocą [E]do klubu puls
[D]Płynęła muzyka i [A]tłum`,
  lines: [
    { type: 'section-header', header: 'Zwrotka 1' },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'A', lyrics: 'Pamiętam dobrze ten ' },
        { chord: 'E', lyrics: 'wspaniały czas' },
      ],
    },
  ],
  uniqueChords: ['A', 'E', 'D'],
};

const FIXTURE_PIWNICA: ParsedSong = {
  slug: 'w-piwnicy-u-dziadka',
  title: 'W piwnicy u dziadka',
  artist: 'Stare Dobre Małżeństwo',
  key: 'C',
  tags: ['poezja', 'folk'],
  rawLyrics: `[Zwrotka 1]
[C]W piwnicy stoi stary [F]kufer z mosiądzu
[G]Pełen wspomnień i [C]dawnych pamiątek`,
  lines: [
    { type: 'section-header', header: 'Zwrotka 1' },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'C', lyrics: 'W piwnicy stoi stary ' },
        { chord: 'F', lyrics: 'kufer z mosiądzu' },
      ],
    },
  ],
  uniqueChords: ['C', 'F', 'G'],
};

const TEST_SONGS: ParsedSong[] = [FIXTURE_LORNETKA, FIXTURE_WEHIKUL, FIXTURE_PIWNICA];

// ============================================================================
// REACT ELEMENT TREE TRAVERSAL HELPERS
// ============================================================================

function findElementsBy(node: any, predicate: (el: any) => boolean): any[] {
  const matches: any[] = [];
  if (!node) return matches;
  if (Array.isArray(node)) {
    for (const item of node) {
      matches.push(...findElementsBy(item, predicate));
    }
    return matches;
  }
  if (typeof node !== 'object') return matches;
  if (predicate(node)) {
    matches.push(node);
  }
  if (node.props && node.props.children) {
    const children = Array.isArray(node.props.children)
      ? node.props.children
      : [node.props.children];
    for (const child of children) {
      matches.push(...findElementsBy(child, predicate));
    }
  }
  return matches;
}

interface MockEvent {
  stopPropagationCalled: boolean;
  stopPropagationCallCount: number;
  preventDefaultCalled: boolean;
  preventDefaultCallCount: number;
  stopPropagation: () => void;
  preventDefault: () => void;
}

function createMockEvent(): MockEvent {
  const evt: MockEvent = {
    stopPropagationCalled: false,
    stopPropagationCallCount: 0,
    preventDefaultCalled: false,
    preventDefaultCallCount: 0,
    stopPropagation() {
      evt.stopPropagationCalled = true;
      evt.stopPropagationCallCount++;
    },
    preventDefault() {
      evt.preventDefaultCalled = true;
      evt.preventDefaultCallCount++;
    },
  };
  return evt;
}

// ============================================================================
// MAIN EMPIRICAL CHALLENGE SUITE
// ============================================================================

export async function runM7ChallengerTests(runner: TestRunner) {
  // --------------------------------------------------------------------------
  // SUITE 1: Star Button Event Isolation & Handler Dispatch
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger — Star Button Event Isolation & Favorites');

  await runner.test('CHAL-STAR-01: Clicking star button triggers stopPropagation and preventDefault', () => {
    let toggledSlug: string | null = null;
    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: ['wehikul-czasu'],
        onToggleFavorite: (slug) => {
          toggledSlug = slug;
        },
      }
    );

    const tree = harness.render();
    const starButtons = findElementsBy(
      tree,
      (el) =>
        el.type === 'button' &&
        el.props &&
        (el.props['aria-label']?.includes('ulubionych') || el.props.title?.includes('ulubionych'))
    );

    assert(starButtons.length >= 3, `Expected at least 3 star buttons, found ${starButtons.length}`);

    // Test first button (lornetka, un-favorited)
    const btn1 = starButtons[0];
    const mockEvent1 = createMockEvent();
    btn1.props.onClick(mockEvent1);

    assert.strictEqual(mockEvent1.stopPropagationCalled, true, 'stopPropagation must be called');
    assert.strictEqual(mockEvent1.stopPropagationCallCount, 1, 'stopPropagation called exactly once');
    assert.strictEqual(mockEvent1.preventDefaultCalled, true, 'preventDefault must be called');
    assert.strictEqual(mockEvent1.preventDefaultCallCount, 1, 'preventDefault called exactly once');
    assert.strictEqual(toggledSlug, 'lornetka', 'onToggleFavorite called with "lornetka"');

    // Test second button (wehikul-czasu, favorited)
    const btn2 = starButtons[1];
    const mockEvent2 = createMockEvent();
    btn2.props.onClick(mockEvent2);

    assert.strictEqual(mockEvent2.stopPropagationCalled, true, 'stopPropagation must be called');
    assert.strictEqual(mockEvent2.preventDefaultCalled, true, 'preventDefault must be called');
    assert.strictEqual(toggledSlug, 'wehikul-czasu', 'onToggleFavorite called with "wehikul-czasu"');

    // Test third button (w-piwnicy-u-dziadka)
    const btn3 = starButtons[2];
    const mockEvent3 = createMockEvent();
    btn3.props.onClick(mockEvent3);

    assert.strictEqual(mockEvent3.stopPropagationCalled, true, 'stopPropagation must be called');
    assert.strictEqual(mockEvent3.preventDefaultCalled, true, 'preventDefault must be called');
    assert.strictEqual(toggledSlug, 'w-piwnicy-u-dziadka', 'onToggleFavorite called with "w-piwnicy-u-dziadka"');
  });

  await runner.test('CHAL-STAR-02: Card click navigation is isolated when star button is clicked', () => {
    let cardSelectedSlug: string | null = null;
    let starToggledSlug: string | null = null;

    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: [FIXTURE_LORNETKA],
        theme: 'dark',
        favorites: [],
        onToggleFavorite: (slug) => {
          starToggledSlug = slug;
        },
        onSelectSong: (slug) => {
          cardSelectedSlug = slug;
        },
      }
    );

    const tree = harness.render();

    // Locate the song card anchor
    const anchors = findElementsBy(
      tree,
      (el) => el.type === 'a' && el.props && el.props.href === '#/song/lornetka'
    );
    assert.strictEqual(anchors.length, 1, 'Must find song card anchor tag');
    const cardAnchor = anchors[0];

    // Locate the star button inside the card
    const starBtn = findElementsBy(
      cardAnchor,
      (el) => el.type === 'button' && el.props['aria-label']?.includes('Dodaj')
    )[0];
    assert(starBtn, 'Must find star button inside song card');

    // Click star button with event simulation
    const mockEvent = createMockEvent();
    starBtn.props.onClick(mockEvent);

    assert.strictEqual(starToggledSlug, 'lornetka', 'Star toggle called');
    assert.strictEqual(mockEvent.stopPropagationCalled, true, 'stopPropagation stopped bubble');
    // If propagation was stopped, cardAnchor.props.onClick was NOT triggered
    assert.strictEqual(cardSelectedSlug, null, 'Parent card onSelectSong must NOT be invoked');

    // But if parent card is clicked directly:
    const cardEvent = createMockEvent();
    cardAnchor.props.onClick(cardEvent);
    assert.strictEqual(cardSelectedSlug, 'lornetka', 'Direct card click invokes onSelectSong');
    assert.strictEqual(cardEvent.preventDefaultCalled, true, 'Card click calls preventDefault when onSelectSong is present');
  });

  await runner.test('CHAL-STAR-03: Visual star states reflect favorites prop (filled vs outlined)', () => {
    const htmlWithFav = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: [FIXTURE_LORNETKA, FIXTURE_WEHIKUL],
        theme: 'dark',
        favorites: ['wehikul-czasu'],
        onToggleFavorite: () => {},
      })
    );

    // lornetka: not in favorites -> aria-label "Dodaj Lornetka do ulubionych"
    assert(
      htmlWithFav.includes('aria-label="Dodaj Lornetka do ulubionych"'),
      'Must render "Dodaj Lornetka do ulubionych" aria label for un-favorited song'
    );
    assert(
      htmlWithFav.includes('title="Dodaj do ulubionych"'),
      'Must render "Dodaj do ulubionych" title for un-favorited song'
    );

    // wehikul-czasu: in favorites -> aria-label "Usuń Wehikuł czasu z ulubionych"
    assert(
      htmlWithFav.includes('aria-label="Usuń Wehikuł czasu z ulubionych"'),
      'Must render "Usuń Wehikuł czasu z ulubionych" aria label for favorited song'
    );
    assert(
      htmlWithFav.includes('title="Usuń z ulubionych"'),
      'Must render "Usuń z ulubionych" title for favorited song'
    );
    // Filled star uses currentColor fill and amber text styling
    assert(
      htmlWithFav.includes('text-amber-400') && htmlWithFav.includes('fill="currentColor"'),
      'Filled star must have amber text and filled svg path'
    );
  });

  await runner.test('CHAL-STAR-04: Artist view star button in App.tsx isolation contracts', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');

    // Verify star button in artist view has stopPropagation and preventDefault
    assert(
      appSrc.includes('e.stopPropagation();') && appSrc.includes('e.preventDefault();'),
      'App.tsx must invoke stopPropagation and preventDefault on star click'
    );
    assert(
      appSrc.includes('handleToggleFavorite(s.slug)'),
      'App.tsx artist view star must invoke handleToggleFavorite with song slug'
    );
    assert(
      appSrc.includes('favorites.includes(s.slug)'),
      'App.tsx artist view star must check favorites.includes(s.slug)'
    );
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Favorites Storage Synchronization (spiewnik_favorites)
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger — Storage Sync (spiewnik_favorites)');

  await runner.test('CHAL-FAV-01: STORAGE_KEYS.FAVORITES is exactly "spiewnik_favorites"', () => {
    assert.strictEqual(
      STORAGE_KEYS.FAVORITES,
      'spiewnik_favorites',
      'Storage key must be "spiewnik_favorites"'
    );
  });

  await runner.test('CHAL-FAV-02: validateFavorites sanitizes, filters, deduplicates, and rejects garbage', () => {
    // Valid array of strings
    assert.deepStrictEqual(validateFavorites(['a', 'b', 'c']), ['a', 'b', 'c']);

    // Deduplication
    assert.deepStrictEqual(validateFavorites(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);

    // Filters empty and blank whitespace-only strings
    assert.deepStrictEqual(validateFavorites(['song-1', '', '   ', 'song-2']), ['song-1', 'song-2']);

    // Rejects non-string types inside array
    assert.deepStrictEqual(validateFavorites(['valid', 123, null, undefined, false, {}]), ['valid']);

    // Rejects non-array values safely
    assert.deepStrictEqual(validateFavorites(null), []);
    assert.deepStrictEqual(validateFavorites(undefined), []);
    assert.deepStrictEqual(validateFavorites('invalid_string'), []);
    assert.deepStrictEqual(validateFavorites(42), []);
    assert.deepStrictEqual(validateFavorites({ slug: 'lornetka' }), []);
  });

  await runner.test('CHAL-FAV-03: useFavorites hook loads from and serializes to spiewnik_favorites', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      // Pre-seed storage with JSON
      env.localStorage.setItem('spiewnik_favorites', JSON.stringify(['wehikul-czasu']));

      const harness = new HookHarness(() => useFavorites(), undefined);
      harness.render();
      const [favs1, setFavs1] = harness.result;

      assert.deepStrictEqual(favs1, ['wehikul-czasu'], 'Hydrated initial favorites from localStorage');

      // Add a favorite
      setFavs1(['wehikul-czasu', 'lornetka']);
      const rawStored = env.localStorage.getItem('spiewnik_favorites');
      assert.strictEqual(rawStored, JSON.stringify(['wehikul-czasu', 'lornetka']));

      harness.render();
      const [favs2] = harness.result;
      assert.deepStrictEqual(favs2, ['wehikul-czasu', 'lornetka']);

      // Remove a favorite
      setFavs1((prev) => prev.filter((s) => s !== 'wehikul-czasu'));
      const rawStored2 = env.localStorage.getItem('spiewnik_favorites');
      assert.strictEqual(rawStored2, JSON.stringify(['lornetka']));

      harness.render();
      const [favs3] = harness.result;
      assert.deepStrictEqual(favs3, ['lornetka']);

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('CHAL-FAV-04: Intra-tab CustomEvent spiewnik-storage-sync synchronizes favorites', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const harness = new HookHarness(() => useFavorites(), undefined);
      harness.render();
      const [initial] = harness.result;
      assert.deepStrictEqual(initial, []);

      // Another part of the app writes storage
      writeStorage('spiewnik_favorites', ['lornetka']);

      // Hook re-reads on custom event
      harness.render();
      const [updated] = harness.result;
      assert.deepStrictEqual(updated, ['lornetka']);

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('CHAL-FAV-05: Inter-tab StorageEvent synchronizes favorites from external tab', async () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      const harness = new HookHarness(() => useFavorites(), undefined);
      harness.render();

      // Simulate external window modifying localStorage
      env.localStorage.setItem('spiewnik_favorites', JSON.stringify(['w-piwnicy-u-dziadka']));

      // Dispatch storage event
      env.dispatchEvent('storage', {
        key: 'spiewnik_favorites',
        newValue: JSON.stringify(['w-piwnicy-u-dziadka']),
      });

      await harness.waitForNextUpdate(15);
      const [updated] = harness.result;
      assert.deepStrictEqual(updated, ['w-piwnicy-u-dziadka']);

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  await runner.test('CHAL-FAV-06: QuotaExceededError and SecurityError fallback safely for favorites', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      env.localStorage.simulateQuotaExceeded(true);

      // Should not throw, should gracefully write to memoryStore
      assert.doesNotThrow(() => {
        writeStorage('spiewnik_favorites', ['fallback-slug']);
      });

      // Now simulate SecurityError (private mode)
      env.localStorage.simulateSecurityError(true);
      assert.doesNotThrow(() => {
        writeStorage('spiewnik_favorites', ['private-mode-slug']);
      });

      // Hook handles SecurityError in private browsing safely
      const harness = new HookHarness(() => useFavorites(), undefined);
      harness.render();
      assert.deepStrictEqual(harness.result[0], [], 'Initial mount returns safe default during SecurityError');

      harness.result[1](['private-mode-favorite']);
      harness.render();
      assert.deepStrictEqual(harness.result[0], ['private-mode-favorite'], 'Hook state updates and survives in private browsing');

      harness.unmount();
    } finally {
      env.uninstall();
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Dual Catalog Tabs & Ulubione Polish Empty State
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger — Dual Catalog Tabs & Polish Empty State');

  await runner.test('CHAL-TAB-01: Tab bar renders 3 tabs: Piosenki, Wykonawcy, Ulubione with badges', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: ['lornetka'],
        onToggleFavorite: () => {},
      })
    );

    assert(html.includes('id="tab-songs"'), 'Must have tab-songs');
    assert(html.includes('id="tab-artists"'), 'Must have tab-artists');
    assert(html.includes('id="tab-favorites"'), 'Must have tab-favorites');

    assert(html.includes('>Piosenki<'), 'Must display tab label Piosenki');
    assert(html.includes('>Wykonawcy<'), 'Must display tab label Wykonawcy');
    assert(html.includes('>Ulubione<'), 'Must display tab label Ulubione');

    // Total song count badge: 3
    assert(html.includes('>3</span>'), 'Must display badge 3 for songs count');
    // Unique artists badge: 3 (Golec uOrkiestra, Dżem, Stare Dobre Małżeństwo)
    // Favorites badge: 1 (lornetka)
    assert(html.includes('>1</span>'), 'Must display badge 1 for favorites count');
  });

  await runner.test('CHAL-TAB-02: Switching to Ulubione tab when favorites is empty displays exact Polish empty state', () => {
    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: [], // empty favorites
        onToggleFavorite: () => {},
      }
    );

    const initialTree = harness.render();

    // Ulubione tab button
    const favTabBtn = findElementsBy(
      initialTree,
      (el) => el.type === 'button' && el.props.id === 'tab-favorites'
    )[0];
    assert(favTabBtn, 'Must find tab-favorites button');

    // Simulate clicking Ulubione tab
    favTabBtn.props.onClick();

    // Re-render
    const favTree = harness.render();

    // Locate panel-favorites
    const favPanels = findElementsBy(
      favTree,
      (el) => el.props && el.props.id === 'panel-favorites'
    );
    assert.strictEqual(favPanels.length, 1, 'Must render panel-favorites');

    // Check static HTML of panel
    const panelHtml = renderToStaticMarkup(favPanels[0]);

    const EXPECTED_EMPTY_TEXT =
      'Brak ulubionych utworów. Dodaj piosenki do ulubionych, klikając gwiazdkę.';

    assert(
      panelHtml.includes(EXPECTED_EMPTY_TEXT),
      `Expected exact Polish empty state: "${EXPECTED_EMPTY_TEXT}", but got:\n${panelHtml}`
    );

    assert(
      panelHtml.includes('Brak ulubionych utworów'),
      'Must contain heading "Brak ulubionych utworów"'
    );

    assert(
      panelHtml.includes('Przeglądaj piosenki'),
      'Must contain call-to-action button "Przeglądaj piosenki"'
    );

    // Verify clicking "Przeglądaj piosenki" switches tab back to "songs"
    const browseBtn = findElementsBy(
      favPanels[0],
      (el) => el.type === 'button' && el.props.children === 'Przeglądaj piosenki'
    )[0];
    assert(browseBtn, 'Must find "Przeglądaj piosenki" button');

    browseBtn.props.onClick();
    const backToSongsTree = harness.render();
    const songPanels = findElementsBy(
      backToSongsTree,
      (el) => el.props && el.props.id === 'panel-songs'
    );
    assert.strictEqual(songPanels.length, 1, 'Clicking "Przeglądaj piosenki" returned to panel-songs');
  });

  await runner.test('CHAL-TAB-03: Switching to Ulubione tab when favorites has items renders only favorited songs', () => {
    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: ['wehikul-czasu'],
        onToggleFavorite: () => {},
      }
    );

    const tree = harness.render();
    const favTabBtn = findElementsBy(tree, (el) => el.props && el.props.id === 'tab-favorites')[0];
    favTabBtn.props.onClick();

    const favTree = harness.render();
    const favHtml = renderToStaticMarkup(favTree);

    // Should contain Wehikuł czasu
    assert(favHtml.includes('Wehikuł czasu'), 'Must render favorited song Wehikuł czasu');
    // Should NOT contain Lornetka or W piwnicy u dziadka
    assert(!favHtml.includes('Lornetka'), 'Must NOT render non-favorited song Lornetka in Ulubione tab');
    assert(!favHtml.includes('W piwnicy u dziadka'), 'Must NOT render non-favorited song W piwnicy u dziadka in Ulubione tab');
    // Should NOT render the empty state notice
    assert(!favHtml.includes('Dodaj piosenki do ulubionych, klikając gwiazdkę.'), 'Must not render empty notice when favorites exist');
  });

  await runner.test('CHAL-TAB-04: Ulubione tab search filter empty state renders contextual Polish notice', () => {
    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: ['wehikul-czasu'],
        onToggleFavorite: () => {},
      }
    );

    const tree = harness.render();
    // Switch to Ulubione tab
    const favTabBtn = findElementsBy(tree, (el) => el.props && el.props.id === 'tab-favorites')[0];
    favTabBtn.props.onClick();

    // Type query that matches nothing in favorites
    const searchInput = findElementsBy(tree, (el) => el.type === 'input')[0];
    searchInput.props.onChange({ target: { value: 'nieistniejacytekst' } });

    const searchedTree = harness.render();
    const searchedHtml = renderToStaticMarkup(searchedTree);

    assert(
      searchedHtml.includes('Brak wyników w ulubionych dla zapytania:'),
      'Must render contextual favorites search empty notice'
    );
    assert(
      searchedHtml.includes('nieistniejacytekst'),
      'Must display the non-matching query in quotes'
    );
    assert(
      searchedHtml.includes('Wyczyść wyszukiwanie'),
      'Must provide "Wyczyść wyszukiwanie" action button'
    );
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Artist Navigation & Slug Matching
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger — Artist Navigation & Slug Matching');

  await runner.test('CHAL-ART-01: artistToSlug correctly converts Polish and special artist names', () => {
    assert.strictEqual(artistToSlug('Dżem'), 'dzem');
    assert.strictEqual(artistToSlug('Golec uOrkiestra'), 'golec-uorkiestra');
    assert.strictEqual(artistToSlug('Michał Bajor'), 'michal-bajor');
    assert.strictEqual(artistToSlug('Stare Dobre Małżeństwo'), 'stare-dobre-malzenstwo');
    assert.strictEqual(artistToSlug('Czesław Niemen'), 'czeslaw-niemen');
    assert.strictEqual(artistToSlug('T.Love'), 't-love');
    assert.strictEqual(artistToSlug('Łzy'), 'lzy');
    assert.strictEqual(artistToSlug('Kult'), 'kult');
    assert.strictEqual(artistToSlug('Żywiołak'), 'zywiolak');

    // Edge cases
    assert.strictEqual(artistToSlug(''), '');
    assert.strictEqual(artistToSlug('   '), '');
    assert.strictEqual(artistToSlug('---'), '');
    assert.strictEqual(artistToSlug(null as any), '');
    assert.strictEqual(artistToSlug(undefined as any), '');
  });

  await runner.test('CHAL-ART-02: Wykonawcy tab renders artist link with format #/artist/:slug', () => {
    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      }
    );

    const tree = harness.render();
    const artistTabBtn = findElementsBy(tree, (el) => el.props && el.props.id === 'tab-artists')[0];
    artistTabBtn.props.onClick();

    const artistTree = harness.render();
    const artistHtml = renderToStaticMarkup(artistTree);

    assert(
      artistHtml.includes('href="#/artist/dzem"'),
      'Must render link with format #/artist/dzem'
    );
    assert(
      artistHtml.includes('href="#/artist/golec-uorkiestra"'),
      'Must render link with format #/artist/golec-uorkiestra'
    );
    assert(
      artistHtml.includes('href="#/artist/stare-dobre-malzenstwo"'),
      'Must render link with format #/artist/stare-dobre-malzenstwo'
    );
  });

  await runner.test('CHAL-ART-03: Polish pluralization for artist song counts', () => {
    // 1 song: "1 utwór"
    const harness1 = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: [FIXTURE_LORNETKA],
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      }
    );
    const tree1 = harness1.render();
    findElementsBy(tree1, (el) => el.props?.id === 'tab-artists')[0].props.onClick();
    const html1 = renderToStaticMarkup(harness1.render());
    assert(html1.includes('1 utwór'), 'Must format count 1 as "1 utwór"');

    // Multiple songs: 2, 3, 4 -> "utwory", 5+ -> "utworów"
    const song2: ParsedSong = { ...FIXTURE_LORNETKA, slug: 'lornetka-2', title: 'Lornetka 2' };
    const song3: ParsedSong = { ...FIXTURE_LORNETKA, slug: 'lornetka-3', title: 'Lornetka 3' };
    const song4: ParsedSong = { ...FIXTURE_LORNETKA, slug: 'lornetka-4', title: 'Lornetka 4' };
    const song5: ParsedSong = { ...FIXTURE_LORNETKA, slug: 'lornetka-5', title: 'Lornetka 5' };

    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: [FIXTURE_LORNETKA, song2],
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      }
    );
    const tree2 = harness.render();
    findElementsBy(tree2, (el) => el.props?.id === 'tab-artists')[0].props.onClick();
    const html2 = renderToStaticMarkup(harness.render());
    assert(html2.includes('2 utwory'), 'Must format count 2 as "2 utwory"');

    // Test with 5 songs
    const harness5 = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: [FIXTURE_LORNETKA, song2, song3, song4, song5],
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      }
    );
    const tree5 = harness5.render();
    findElementsBy(tree5, (el) => el.props?.id === 'tab-artists')[0].props.onClick();
    const html5 = renderToStaticMarkup(harness5.render());
    assert(html5.includes('5 utworów'), 'Must format count 5 as "5 utworów"');
  });

  await runner.test('CHAL-ART-04: App.tsx artist route slug matching and Polish fallback notice', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');

    // Matching logic assertions in App.tsx
    assert(appSrc.includes('route.type === \'artist\''), 'App.tsx must handle artist route type');
    assert(appSrc.includes('artistToSlug(s.artist) === normSlug'), 'App.tsx must compare artistToSlug');
    assert(appSrc.includes('normArtist === normSlug'), 'App.tsx must compare normalized artist');

    // Polish fallback notice in App.tsx
    assert(appSrc.includes('Nie znaleziono wykonawcy'), 'App.tsx must render "Nie znaleziono wykonawcy" header');
    assert(appSrc.includes('Nie znaleziono piosenek wykonawcy'), 'App.tsx must render detailed Polish fallback explanation');
    assert(appSrc.includes('Wróć do katalogu'), 'App.tsx artist fallback must include "Wróć do katalogu" link to #/');
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Touch Target Size Compliance (>= 44px)
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger — Touch Target Compliance (>= 44px)');

  await runner.test('CHAL-TOUCH-01: Tab buttons satisfy min-h-[44px]', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      })
    );

    // Check each tab button element
    const tabSongsMatch = html.match(/id="tab-songs"[^>]*class="([^"]*)"/);
    assert(tabSongsMatch, 'Must find tab-songs markup');
    assert(tabSongsMatch[1].includes('min-h-[44px]'), 'tab-songs must have min-h-[44px]');

    const tabArtistsMatch = html.match(/id="tab-artists"[^>]*class="([^"]*)"/);
    assert(tabArtistsMatch, 'Must find tab-artists markup');
    assert(tabArtistsMatch[1].includes('min-h-[44px]'), 'tab-artists must have min-h-[44px]');

    const tabFavoritesMatch = html.match(/id="tab-favorites"[^>]*class="([^"]*)"/);
    assert(tabFavoritesMatch, 'Must find tab-favorites markup');
    assert(tabFavoritesMatch[1].includes('min-h-[44px]'), 'tab-favorites must have min-h-[44px]');
  });

  await runner.test('CHAL-TOUCH-02: Search input and clear button satisfy >= 44px hit areas', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      })
    );

    // Search input
    const inputMatch = html.match(/<input[^>]*class="([^"]*)"/);
    assert(inputMatch, 'Must find search input markup');
    assert(inputMatch[1].includes('min-h-[44px]'), 'Search input must have min-h-[44px]');

    // Clear button with active query
    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      }
    );
    const tree = harness.render();
    const inputEl = findElementsBy(tree, (el) => el.type === 'input')[0];
    inputEl.props.onChange({ target: { value: 'query' } });
    const treeWithQuery = harness.render();
    const clearBtn = findElementsBy(
      treeWithQuery,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Wyczyść wyszukiwanie'
    )[0];

    assert(clearBtn, 'Must render clear button when query is present');
    const clearClass = clearBtn.props.className;
    assert(
      clearClass.includes('min-w-[44px]') &&
        clearClass.includes('min-h-[44px]') &&
        clearClass.includes('w-11') &&
        clearClass.includes('h-11'),
      `Clear button must satisfy min-w-[44px] min-h-[44px] and w-11 h-11, got: "${clearClass}"`
    );
  });

  await runner.test('CHAL-TOUCH-03: Tag filter chips satisfy min-h-[44px]', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      })
    );

    // Tag buttons
    const tagBtnMatches = Array.from(html.matchAll(/<button[^>]*aria-pressed="[^"]*"[^>]*class="([^"]*)"/g));
    assert(tagBtnMatches.length >= 3, `Expected at least 3 tag chips, got ${tagBtnMatches.length}`);

    for (const match of tagBtnMatches) {
      assert(
        match[1].includes('min-h-[44px]'),
        `Tag chip must have min-h-[44px], got: "${match[1]}"`
      );
    }
  });

  await runner.test('CHAL-TOUCH-04: Star favorite buttons satisfy 44x44px target box', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongList, {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: [],
        onToggleFavorite: () => {},
      })
    );

    const starBtnMatches = Array.from(html.matchAll(/<button[^>]*title="(?:Dodaj|Usuń)[^"]*"[^>]*class="([^"]*)"/g));
    assert(starBtnMatches.length >= 3, `Expected at least 3 star buttons, got ${starBtnMatches.length}`);

    for (const match of starBtnMatches) {
      assert(
        match[1].includes('min-w-[44px]') &&
          match[1].includes('min-h-[44px]') &&
          match[1].includes('w-11') &&
          match[1].includes('h-11'),
        `Star button must satisfy min-w-[44px] min-h-[44px] and w-11 h-11, got: "${match[1]}"`
      );
    }

    // Also check star button in App.tsx
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(
      appSrc.includes('w-11 h-11 min-w-[44px] min-h-[44px]'),
      'App.tsx artist view star button must satisfy w-11 h-11 min-w-[44px] min-h-[44px]'
    );
  });

  await runner.test('CHAL-TOUCH-05: Empty state call-to-action buttons satisfy min-h-[44px]', () => {
    const songListSrc = fs.readFileSync('src/components/SongList.tsx', 'utf8');
    // Check all empty state action buttons have min-h-[44px]
    assert(
      songListSrc.includes('Przeglądaj piosenki') &&
        songListSrc.includes('Wyczyść wyszukiwanie') &&
        songListSrc.includes('Pokaż wszystkie piosenki'),
      'Must contain all 3 Polish empty state button labels'
    );

    // Verify all 3 occurrences have min-h-[44px]
    const buttonOccurrences = songListSrc.match(/min-h-\[44px\]/g);
    assert(
      buttonOccurrences && buttonOccurrences.length >= 8,
      `Expected at least 8 elements with min-h-[44px] in SongList.tsx, found ${buttonOccurrences?.length}`
    );
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Search & Contextual Lyric Snippet Adversarial Scenarios
  // --------------------------------------------------------------------------
  runner.setTier('Empirical Challenger — Search & Lyric Snippet Previews');

  await runner.test('CHAL-SRCH-01: Polish diacritic normalization handles all Polish glyphs and edge cases', () => {
    assert.strictEqual(normalizeSearchText('Zażółć gęślą jaźń'), 'zazolc gesla jazn');
    assert.strictEqual(normalizeSearchText('ZAŻÓŁĆ GĘŚLĄ JAŹŃ'), 'zazolc gesla jazn');
    assert.strictEqual(normalizeSearchText('Wehikuł'), 'wehikul');
    assert.strictEqual(normalizeSearchText('Dżem'), 'dzem');
    assert.strictEqual(normalizeSearchText('Łódź'), 'lodz');
    assert.strictEqual(normalizeSearchText('Kołobrzeg'), 'kolobrzeg');
    assert.strictEqual(normalizeSearchText('Śpiewnik'), 'spiewnik');
  });

  await runner.test('CHAL-SRCH-02: REQ-CAT-3 snippet suppression when title or artist matches', () => {
    // When query matches song title: lyricSnippet MUST BE NULL
    const matchTitle = matchSong(FIXTURE_LORNETKA, 'lornetka');
    assert.strictEqual(matchTitle.matches, true, 'Matches title');
    assert.strictEqual(matchTitle.matchedField, 'title', 'Attributed to title');
    assert.strictEqual(matchTitle.lyricSnippet, null, 'Snippet must be null when title matches');

    // When query matches artist name: lyricSnippet MUST BE NULL
    const matchArtist = matchSong(FIXTURE_LORNETKA, 'golec');
    assert.strictEqual(matchArtist.matches, true, 'Matches artist');
    assert.strictEqual(matchArtist.matchedField, 'artist', 'Attributed to artist');
    assert.strictEqual(matchArtist.lyricSnippet, null, 'Snippet must be null when artist matches');

    // When query matches ONLY inside rawLyrics: lyricSnippet MUST BE PRESENT
    const matchLyrics = matchSong(FIXTURE_LORNETKA, 'dachu');
    assert.strictEqual(matchLyrics.matches, true, 'Matches lyrics');
    assert.strictEqual(matchLyrics.matchedField, 'lyrics', 'Attributed to lyrics');
    assert.strictEqual(
      matchLyrics.lyricSnippet,
      '... Siedzę se na dachu już od kilku lat ...',
      'Snippet must extract cleaned lyric line formatted as ... [line] ...'
    );
  });

  await runner.test('CHAL-SRCH-03: Snippet extraction strips chord tokens and section headers', () => {
    // Strips chord brackets like [G], [C#m], [D/F#]
    const lineWithChords = '[G]Kupiłek se [C]lornetkę by [D/F#]oglądać świat';
    const cleaned = cleanLyricLine(lineWithChords);
    assert.strictEqual(cleaned, 'Kupiłek se lornetkę by oglądać świat');

    // Rejects pure section headers
    assert.strictEqual(cleanLyricLine('[Refren]'), null);
    assert.strictEqual(cleanLyricLine('[Zwrotka 1]'), null);
    assert.strictEqual(cleanLyricLine('{title: Test}'), null);
    assert.strictEqual(cleanLyricLine('---'), null);
    assert.strictEqual(cleanLyricLine(''), null);
    assert.strictEqual(cleanLyricLine('   '), null);

    // Rejects pure chord lines
    assert.strictEqual(cleanLyricLine('G C D G'), null);
    assert.strictEqual(cleanLyricLine('Am  F  C  G'), null);
  });

  await runner.test('CHAL-SRCH-04: Multi-criteria AND matrix (Tab + Tag + Query)', () => {
    const harness = new HookHarness<SongListProps, React.JSX.Element>(
      (props) => SongList(props),
      {
        songs: TEST_SONGS,
        theme: 'dark',
        favorites: ['wehikul-czasu'],
        onToggleFavorite: () => {},
      }
    );

    // Default: all 3 songs shown
    let tree = harness.render();
    assert.strictEqual(findElementsBy(tree, (el) => el.type === 'a' && el.props?.href?.startsWith('#/song/')).length, 3);

    // Select tag 'folk': should match Lornetka and W piwnicy u dziadka (2 songs)
    const folkChip = findElementsBy(tree, (el) => el.type === 'button' && el.props.children === 'folk')[0];
    assert(folkChip, 'Must find folk chip');
    folkChip.props.onClick();

    tree = harness.render();
    let songCards = findElementsBy(tree, (el) => el.type === 'a' && el.props?.href?.startsWith('#/song/'));
    assert.strictEqual(songCards.length, 2, 'Tag folk filters to 2 songs');

    // Now type search query 'dziadka' while tag 'folk' is active -> 1 song
    const searchInput = findElementsBy(tree, (el) => el.type === 'input')[0];
    searchInput.props.onChange({ target: { value: 'dziadka' } });

    tree = harness.render();
    songCards = findElementsBy(tree, (el) => el.type === 'a' && el.props?.href?.startsWith('#/song/'));
    assert.strictEqual(songCards.length, 1, 'Tag folk AND query dziadka filters to 1 song');
    assert(songCards[0].props.href.includes('w-piwnicy-u-dziadka'), 'Matches w-piwnicy-u-dziadka');

    // Now switch to Ulubione tab while tag & query are active -> 0 songs because w-piwnicy is not in favorites!
    const favTab = findElementsBy(tree, (el) => el.props?.id === 'tab-favorites')[0];
    favTab.props.onClick();

    tree = harness.render();
    const favHtml = renderToStaticMarkup(tree);
    assert(favHtml.includes('Brak wyników w ulubionych dla zapytania:'), 'Renders contextual empty state in Ulubione');

    // Deselect tag and clear search -> now Ulubione shows wehikul-czasu (1 song)
    const clearSearchBtn = findElementsBy(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Wyczyść wyszukiwanie')[0];
    if (clearSearchBtn) clearSearchBtn.props.onClick();

    // Click "Wszystkie" chip
    const allChip = findElementsBy(tree, (el) => el.type === 'button' && el.props.children === 'Wszystkie')[0];
    if (allChip) allChip.props.onClick();

    tree = harness.render();
    const restoredCards = findElementsBy(tree, (el) => el.type === 'a' && el.props?.href?.startsWith('#/song/'));
    assert.strictEqual(restoredCards.length, 1, 'Ulubione shows 1 favorited song');
    assert(restoredCards[0].props.href.includes('wehikul-czasu'), 'Matches wehikul-czasu in Ulubione');
  });
}
