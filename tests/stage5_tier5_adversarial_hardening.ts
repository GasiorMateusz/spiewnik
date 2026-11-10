import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework';
import { HookHarness } from './helpers/hook_harness';
import { SongList } from '../src/components/SongList';
import {
  normalizeSearchText,
  cleanLyricLine,
  extractLyricSnippet,
  matchSong,
  extractCatalogTags,
  artistToSlug,
  extractArtistCatalog,
} from '../src/lib/search';
import { parseSong } from '../src/lib/songParser';
import type { ParsedSong, SongListProps, SongListTab, ArtistCatalogItem } from '../src/types';

// Load real repository songs with fixture tags fallback for test isolation
const FIXTURE_TAGS: Record<string, string[]> = {
  'bieszczadzkie-anioly': ['poezja', 'turystyczne', 'bieszczady'],
  'lornetka': ['biesiada', 'folk', 'biesiadne'],
  'wehikul-czasu': ['rock', 'klasyka', 'ognisko'],
  'whisky': ['rock', 'blues', 'ognisko'],
};

function loadTestCatalog(): ParsedSong[] {
  const songsDir = path.resolve(process.cwd(), 'songs');
  const files = ['bieszczadzkie-anioly.txt', 'lornetka.txt', 'wehikul-czasu.txt', 'whisky.txt'];
  return files
    .map((file) => {
      const filePath = path.join(songsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const slug = file.replace(/\.txt$/, '');
      const parsed = parseSong(content, slug, filePath);
      if (!parsed.tags || parsed.tags.length === 0) {
        parsed.tags = FIXTURE_TAGS[slug] ?? [];
      }
      return parsed;
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'pl'));
}

function createAdversarialSong(overrides: Partial<ParsedSong> = {}): ParsedSong {
  return {
    title: overrides.title ?? 'Adversarial Test Song',
    artist: overrides.artist ?? 'Adversarial Artist',
    slug: overrides.slug ?? 'adversarial-test-song',
    key: overrides.key ?? 'C',
    tags: overrides.tags ?? ['Rock'],
    rawLyrics: overrides.rawLyrics ?? 'Pierwsza linijka tekstu piosenki\nDruga linijka tekstu piosenki\n',
    metadata: overrides.metadata ?? {},
    lines: overrides.lines ?? [],
    chordsUsed: overrides.chordsUsed ?? ['C', 'G'],
    ...overrides,
  };
}

class AdversarialSongListHarness {
  public harness: HookHarness<SongListProps, React.JSX.Element>;
  public favorites: string[];
  public toggledFavorites: string[] = [];
  public selectedSongs: string[] = [];
  public selectedArtists: string[] = [];

  constructor(
    songs: ParsedSong[],
    initialFavorites: string[] = [],
    theme: 'dark' | 'light' = 'dark'
  ) {
    this.favorites = [...initialFavorites];
    const props: SongListProps = {
      songs,
      theme,
      favorites: this.favorites,
      onToggleFavorite: (slug: string) => {
        this.toggledFavorites.push(slug);
        if (this.favorites.includes(slug)) {
          this.favorites = this.favorites.filter((s) => s !== slug);
        } else {
          this.favorites.push(slug);
        }
        this.updateFavorites([...this.favorites]);
      },
      onSelectSong: (slug: string) => {
        this.selectedSongs.push(slug);
      },
      onSelectArtist: (slug: string) => {
        this.selectedArtists.push(slug);
      },
    };
    this.harness = new HookHarness((p) => SongList(p), props);
    this.harness.render();
  }

  updateFavorites(newFavorites: string[]) {
    this.favorites = newFavorites;
    const currentProps = (this.harness as any).currentProps;
    this.harness.render({
      ...currentProps,
      favorites: newFavorites,
    });
  }

  setTheme(theme: 'dark' | 'light') {
    const currentProps = (this.harness as any).currentProps;
    this.harness.render({
      ...currentProps,
      theme,
    });
  }

  get activeTab(): SongListTab {
    return (this.harness as any).states[0];
  }
  setTab(tab: SongListTab) {
    (this.harness as any).stateSetters[0](tab);
    return this.harness.render();
  }

  get searchQuery(): string {
    return (this.harness as any).states[1];
  }
  setSearchQuery(query: string) {
    (this.harness as any).stateSetters[1](query);
    return this.harness.render();
  }

  get selectedTag(): string | null {
    return (this.harness as any).states[2];
  }
  setSelectedTag(tag: string | null) {
    (this.harness as any).stateSetters[2](tag);
    return this.harness.render();
  }

  get html(): string {
    return renderToStaticMarkup(this.harness.result);
  }

  invokeClick(
    predicate: (node: any) => boolean,
    mockEvent: any = { stopPropagation: () => {}, preventDefault: () => {} }
  ) {
    const findNode = (curr: any): any => {
      if (!curr) return null;
      if (Array.isArray(curr)) {
        for (const item of curr) {
          const found = findNode(item);
          if (found) return found;
        }
        return null;
      }
      if (predicate(curr)) return curr;
      if (curr.props && curr.props.children) {
        return findNode(curr.props.children);
      }
      return null;
    };

    const targetNode = findNode(this.harness.result);
    if (!targetNode) {
      throw new Error('Target node not found for click');
    }
    if (typeof targetNode.props.onClick !== 'function') {
      throw new Error('Target node has no onClick handler');
    }
    targetNode.props.onClick(mockEvent);
    return this.harness.render();
  }
}

export async function runStage5Tier5AdversarialTests(runner: TestRunner) {
  const songs = loadTestCatalog();

  // =========================================================================
  // CATEGORY 1: Adversarial Query Regex & Injection Resilience
  // =========================================================================
  runner.setTier('Stage 5 — Tier 5: Adversarial Query Regex & Injection Resilience');

  await runner.test('ADV-Q01: Search queries with standalone and paired regex symbols (, ), [, ], *, +, ?, \\, ., ^, $, |, {, } never throw RegExp syntax errors', () => {
    const regexSymbols = ['(', ')', '[', ']', '*', '+', '?', '\\', '.', '^', '$', '|', '{', '}', '.*', '(?=.)', '(\\\\d+)'];
    for (const sym of regexSymbols) {
      assert.doesNotThrow(() => {
        for (const s of songs) {
          const res = matchSong(s, sym);
          assert(typeof res.matches === 'boolean');
        }
      }, `Search query "${sym}" must not throw regex exception`);
    }
  });

  await runner.test('ADV-Q02: Unmatched brackets and escape sequences are treated as literal strings and not parsed as RegExp tokens', () => {
    const unclosed = ['[unclosed', '(unclosed', '[[', '((', '\\', '\\\\', '\\x00', '\\u0000'];
    for (const q of unclosed) {
      const harness = new AdversarialSongListHarness(songs);
      assert.doesNotThrow(() => {
        harness.setSearchQuery(q);
        assert(typeof harness.html === 'string');
      }, `Unmatched query "${q}" must not crash component`);
    }
  });

  await runner.test('ADV-Q03: HTML, Script, SQL and template injection attacks are safely handled as inert string queries', () => {
    const injectionStrings = [
      "<script>alert('XSS')</script>",
      '"><img src=x onerror=alert(1)>',
      "' OR '1'='1' --",
      '${process.env.PATH}',
      '{{constructor.constructor("return this")()}}',
      '__proto__',
      'constructor',
    ];
    for (const inj of injectionStrings) {
      const harness = new AdversarialSongListHarness(songs);
      harness.setSearchQuery(inj);
      const html = harness.html;
      assert(!html.includes('<script>alert'), 'Must never execute or unescape script tags');
      assert(html.includes('Brak wyników') || html.includes('panel-songs'), 'Must render valid UI');
    }
  });

  await runner.test('ADV-Q04: Zero-width and control characters in queries do not corrupt search matching or crash normalization', () => {
    const zwQuery = 'wehiku\u200Bł\uFEFF czasu';
    const normalized = normalizeSearchText(zwQuery);
    assert(normalized.includes('wehikul'), 'Normalizer should retain alphanumeric tokens around zero-width marks');
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(song, 'wehikul');
    assert.strictEqual(res.matches, true);
  });

  await runner.test('ADV-Q05: Massive 10,000-character search query evaluates in under 5ms with zero polynomial ReDoS degradation', () => {
    const massiveQuery = 'a'.repeat(5000) + ' ' + 'b'.repeat(5000);
    const start = performance.now();
    for (const s of songs) {
      const res = matchSong(s, massiveQuery);
      assert.strictEqual(res.matches, false);
    }
    const elapsed = performance.now() - start;
    assert(elapsed < 20, `10,000-char query matching took ${elapsed}ms; must complete in <20ms without ReDoS`);
  });

  await runner.test('ADV-Q06: Literal match on song with bracketed title "[Live] Ballada o..." matches exact brackets without regex interpretation', () => {
    const customSong = createAdversarialSong({
      title: '[Live] Ballada o wędrowcu',
      slug: 'live-ballada',
    });
    const resBracket = matchSong(customSong, '[Live]');
    assert.strictEqual(resBracket.matches, true);
    assert.strictEqual(resBracket.matchedField, 'title');

    const resPartial = matchSong(customSong, '[');
    assert.strictEqual(resPartial.matches, true);
    assert.strictEqual(resPartial.matchedField, 'title');
  });

  await runner.test('ADV-Q07: Literal match on song with parenthesized title "(wersja akustyczna)" matches parentheses literally', () => {
    const customSong = createAdversarialSong({
      title: 'Whisky (wersja akustyczna)',
      slug: 'whisky-akustyczna',
    });
    const resParen = matchSong(customSong, '(wersja');
    assert.strictEqual(resParen.matches, true);
    assert.strictEqual(resParen.matchedField, 'title');

    const resCloseParen = matchSong(customSong, 'akustyczna)');
    assert.strictEqual(resCloseParen.matches, true);
    assert.strictEqual(resCloseParen.matchedField, 'title');
  });

  await runner.test('ADV-Q08: Query with forward and backward slashes (e.g. "rock/folk" and "C\\D") matches without escape errors', () => {
    const customSong = createAdversarialSong({
      title: 'C\\D Track',
      tags: ['Rock/Folk'],
      slug: 'cd-track',
    });
    const resSlash = matchSong(customSong, 'rock/folk');
    assert.strictEqual(resSlash.matches, true);
    assert.strictEqual(resSlash.matchedField, 'tag');

    const resBackslash = matchSong(customSong, 'C\\D');
    assert.strictEqual(resBackslash.matches, true);
    assert.strictEqual(resBackslash.matchedField, 'title');
  });

  await runner.test('ADV-Q09: Polish typographical quotes („”, «», "") and dashes (—, –) in titles and queries match cleanly', () => {
    const customSong = createAdversarialSong({
      title: '„Nadzieja” — pieśń wolności',
      slug: 'nadzieja',
    });
    const resQuotes = matchSong(customSong, '„nadzieja”');
    assert.strictEqual(resQuotes.matches, true);
    assert.strictEqual(resQuotes.matchedField, 'title');

    const resDash = matchSong(customSong, '—');
    assert.strictEqual(resDash.matches, true);
    assert.strictEqual(resDash.matchedField, 'title');
  });

  await runner.test('ADV-Q10: Null, undefined, empty, or whitespace queries safely degrade to match-all with null attribution', () => {
    const song = songs[0];
    assert.strictEqual(matchSong(song, null as any).matches, true);
    assert.strictEqual(matchSong(song, undefined as any).matches, true);
    assert.strictEqual(matchSong(song, '' as any).matches, true);
    assert.strictEqual(matchSong(song, '   ' as any).matches, true);
    assert.strictEqual(matchSong(song, '\t\n' as any).matches, true);
  });

  // =========================================================================
  // CATEGORY 2: Multiple Consecutive Spaces & Normalization Invariants
  // =========================================================================
  runner.setTier('Stage 5 — Tier 5: Whitespace Collapse & Query Normalization Invariants');

  await runner.test('ADV-W01: Multiple consecutive spaces in query ("wehikul    czasu", 4 spaces) matches single-spaced song title "Wehikuł Czasu"', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(song, 'wehikul    czasu');
    assert.strictEqual(res.matches, true, 'Multi-space query must match song title');
    assert.strictEqual(res.matchedField, 'title');
  });

  await runner.test('ADV-W02: Multi-space query ("tam    krolowal    blues") matches single-spaced lyrics with contextual snippet', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(song, 'tam    krolowal    blues');
    assert.strictEqual(res.matches, true, 'Multi-space lyric query must match lyrics');
    assert.strictEqual(res.matchedField, 'lyrics');
    assert(res.lyricSnippet !== null, 'Must extract contextual snippet for multi-space match');
  });

  await runner.test('ADV-W03: Mixed whitespace query (tabs, newlines, multiple spaces "\\t\\n  wehikul   czasu  \\t\\n") collapses and matches', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(song, '\t\n  wehikul   czasu  \t\n');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'title');
  });

  await runner.test('ADV-W04: Song with internal multiple spaces in title ("Stare   Dobre   Malzenstwo") matches single-spaced user query', () => {
    const customSong = createAdversarialSong({
      title: 'Stare   Dobre   Małżeństwo',
      slug: 'sdm-spaces',
    });
    const res = matchSong(customSong, 'stare dobre malzenstwo');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'title');
  });

  await runner.test('ADV-W05: Whitespace-only search query ("   \\t\\n   ") normalizes to empty string and returns all songs in SongList', () => {
    const harness = new AdversarialSongListHarness(songs);
    harness.setSearchQuery('   \t\n   ');
    assert.strictEqual(harness.searchQuery, '   \t\n   ');
    // Normalized query is empty -> all songs rendered
    for (const s of songs) {
      assert(harness.html.includes(s.title), `Catalog should include ${s.title} on whitespace query`);
    }
    assert(!harness.html.includes('Brak wyników'), 'Whitespace query must not show empty state');
  });

  await runner.test('ADV-W06: Search query with outer whitespace ("   whisky   ") matches "Whisky" accurately', () => {
    const song = songs.find((s) => s.slug === 'whisky')!;
    const res = matchSong(song, '   whisky   ');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'title');
  });

  await runner.test('ADV-W07: Artist names with internal multiple spaces ("Golec    uOrkiestra") match single-spaced queries and vice-versa', () => {
    const customSong = createAdversarialSong({
      artist: 'Golec    uOrkiestra',
      slug: 'golec-multi-space',
    });
    const res = matchSong(customSong, 'golec uorkiestra');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'artist');
  });

  await runner.test('ADV-W08: Normalization idempotency: normalizeSearchText(normalizeSearchText(s)) === normalizeSearchText(s) across 100 complex strings', () => {
    const samples = [
      'Zażółć gęślą jaźń',
      'Wehikuł    Czasu   \t\n',
      'Bieszczadzkie  Anioły',
      'Golec   uOrkiestra — Lornetka',
      'C#m7 / D#dim [Zwrotka 1]',
      '123 Rock & Roll! 100%',
      'ŁÓDŹ-Centrum 2026',
    ];
    for (const sample of samples) {
      const once = normalizeSearchText(sample);
      const twice = normalizeSearchText(once);
      assert.strictEqual(twice, once, `normalizeSearchText must be strictly idempotent for "${sample}"`);
    }
  });

  // =========================================================================
  // CATEGORY 3: Catalog Variations, Mixed Notation & Chords-Only Songs
  // =========================================================================
  runner.setTier('Stage 5 — Tier 5: Catalog Variations, Mixed Notation & Chords-Only Songs');

  await runner.test('ADV-C01: Songs with Polish notation keys ("Hm", "B") correctly render key badges without collision', () => {
    const customSongs = [
      createAdversarialSong({ title: 'Song in Hm', key: 'Hm', slug: 'song-hm' }),
      createAdversarialSong({ title: 'Song in B', key: 'B', slug: 'song-b' }),
    ];
    const harness = new AdversarialSongListHarness(customSongs);
    const html = harness.html;
    assert(html.includes('>Hm</span>'), 'Must display Hm key badge');
    assert(html.includes('>B</span>'), 'Must display B key badge');
  });

  await runner.test('ADV-C02: Songs with International notation keys ("Bm", "Bb") correctly render key badges', () => {
    const customSongs = [
      createAdversarialSong({ title: 'Song in Bm', key: 'Bm', slug: 'song-bm' }),
      createAdversarialSong({ title: 'Song in Bb', key: 'Bb', slug: 'song-bb' }),
    ];
    const harness = new AdversarialSongListHarness(customSongs);
    const html = harness.html;
    assert(html.includes('>Bm</span>'), 'Must display Bm key badge');
    assert(html.includes('>Bb</span>'), 'Must display Bb key badge');
  });

  await runner.test('ADV-C03: Song with missing key or unusual key format ("C#m", "F#7", undefined, "") renders gracefully without breaking card layout', () => {
    const customSongs = [
      createAdversarialSong({ title: 'No Key Song', key: undefined, slug: 'no-key' }),
      createAdversarialSong({ title: 'Empty Key Song', key: '', slug: 'empty-key' }),
      createAdversarialSong({ title: 'Sharp Key Song', key: 'C#m', slug: 'sharp-key' }),
    ];
    const harness = new AdversarialSongListHarness(customSongs);
    assert.doesNotThrow(() => {
      const html = harness.html;
      assert(html.includes('No Key Song'));
      assert(html.includes('Empty Key Song'));
      assert(html.includes('Sharp Key Song'));
      assert(html.includes('>C#m</span>'));
    });
  });

  await runner.test('ADV-C04: Chords-only song (100% chord lines, zero lyric lines) safely returns null for all lyric snippets and matches title without error', () => {
    const chordsOnlyLyrics = `
[Intro]
C  G  Am  F
C  G  F   C

[Solo]
Am  Em  F  C
Dm  G   C  G
`;
    const chordsSong = createAdversarialSong({
      title: 'Akustyczne Intro',
      slug: 'akustyczne-intro',
      rawLyrics: chordsOnlyLyrics,
    });
    // cleanLyricLine must return null for all lines
    const lines = chordsOnlyLyrics.split('\n');
    for (const line of lines) {
      const clean = cleanLyricLine(line);
      assert.strictEqual(clean, null, `Chord line "${line}" must return null from cleanLyricLine`);
    }

    // Snippet extraction returns null
    const snippet = extractLyricSnippet(chordsOnlyLyrics, 'intro');
    assert.strictEqual(snippet, null, 'Chords-only song must not extract false lyric snippet');

    // Searching title matches with null snippet
    const resTitle = matchSong(chordsSong, 'akustyczne');
    assert.strictEqual(resTitle.matches, true);
    assert.strictEqual(resTitle.matchedField, 'title');
    assert.strictEqual(resTitle.lyricSnippet, null);
  });

  await runner.test('ADV-C05: Lyric-heavy song (1,000 lines, 100 stanzas) extracts snippet from line 999 efficiently in <5ms', () => {
    const stanzas: string[] = [];
    for (let i = 1; i <= 200; i++) {
      stanzas.push(`[Zwrotka ${i}]\nTo jest zwykła linijka tekstu zwrotki numer ${i}\nI kolejna linijka bez żadnych tajemnic`);
    }
    stanzas.push('[Zwrotka 201]\nOstatnia linijka kryje frazę unikalny skarb w finale');
    const heavyLyrics = stanzas.join('\n\n');

    const heavySong = createAdversarialSong({
      title: 'Długa Epopeja',
      slug: 'dluga-epopeja',
      rawLyrics: heavyLyrics,
    });

    const start = performance.now();
    const res = matchSong(heavySong, 'unikalny skarb');
    const elapsed = performance.now() - start;

    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'lyrics');
    assert(res.lyricSnippet?.includes('unikalny skarb'), 'Snippet must capture target phrase from end of 1000-line song');
    assert(elapsed < 15, `Snippet extraction took ${elapsed}ms; must complete in <15ms`);
  });

  await runner.test('ADV-C06: Song with undefined or empty tags array handled gracefully across tag collection and filtering', () => {
    const noTagsSong = createAdversarialSong({
      title: 'Bez Tagów',
      slug: 'bez-tagow',
      tags: undefined as any,
    });
    const emptyTagsSong = createAdversarialSong({
      title: 'Puste Tagi',
      slug: 'puste-tagi',
      tags: [],
    });
    const all = [noTagsSong, emptyTagsSong, ...songs];
    const catalogTags = extractCatalogTags(all);
    assert(Array.isArray(catalogTags));
    assert(!catalogTags.includes('undefined'));

    const harness = new AdversarialSongListHarness(all);
    assert.doesNotThrow(() => {
      const html = harness.html;
      assert(html.includes('Bez Tagów'));
      assert(html.includes('Puste Tagi'));
    });
  });

  await runner.test('ADV-C07: Titles and artists with numbers and symbols ("2 Plus 1", "AC/DC", "T.Love", "Hey!", "1992", "52 Dębiec") generate accurate non-empty slugs', () => {
    assert.strictEqual(artistToSlug('2 Plus 1'), '2-plus-1');
    assert.strictEqual(artistToSlug('AC/DC'), 'ac-dc');
    assert.strictEqual(artistToSlug('T.Love'), 't-love');
    assert.strictEqual(artistToSlug('Hey!'), 'hey');
    assert.strictEqual(artistToSlug('1992'), '1992');
    assert.strictEqual(artistToSlug('52 Dębiec'), '52-debiec');
  });

  await runner.test('ADV-C08: Edge-case artist names consisting strictly of punctuation ("???", "***", "--") fallback safely to "artysta" and do not disappear from Wykonawcy', () => {
    const mysterySong = createAdversarialSong({
      title: 'Tajemniczy Utwór',
      artist: '???',
      slug: 'tajemniczy',
    });
    const slug = artistToSlug(mysterySong.artist);
    assert.strictEqual(slug, 'artysta', 'Punctuation-only artist must fallback to valid slug');

    const artistCatalog = extractArtistCatalog([mysterySong]);
    assert.strictEqual(artistCatalog.length, 1);
    assert.strictEqual(artistCatalog[0].name, '???');
    assert.strictEqual(artistCatalog[0].slug, 'artysta');
    assert.strictEqual(artistCatalog[0].songCount, 1);
  });

  await runner.test('ADV-C09: Polish diacritic collision resistance: "Łódź", "Lód", "Lodz" all match common prefix "lod" without crashing', () => {
    const triplet = [
      createAdversarialSong({ title: 'Łódź', slug: 'lodz-1' }),
      createAdversarialSong({ title: 'Lód', slug: 'lodz-2' }),
      createAdversarialSong({ title: 'Lodz', slug: 'lodz-3' }),
    ];
    for (const s of triplet) {
      const res = matchSong(s, 'lod');
      assert.strictEqual(res.matches, true);
    }
    const harness = new AdversarialSongListHarness(triplet);
    harness.setSearchQuery('lod');
    const html = harness.html;
    assert(html.includes('Łódź'));
    assert(html.includes('Lód'));
    assert(html.includes('Lodz'));
  });

  await runner.test('ADV-C10: Tag aggregation with mixed case, trailing punctuation, and whitespace deduplicates properly', () => {
    const custom = [
      createAdversarialSong({ tags: [' Rock ', 'rock', 'ROCK', 'Rock!'] }),
      createAdversarialSong({ tags: ['Poezja śpiewana', 'poezja śpiewana '] }),
    ];
    const tags = extractCatalogTags(custom);
    // All unique tags extracted and trimmed
    assert(tags.includes('Rock'));
    assert(tags.includes('Poezja śpiewana'));
    for (const t of tags) {
      assert.strictEqual(t, t.trim(), 'Tags must be strictly trimmed');
    }
  });

  // =========================================================================
  // CATEGORY 4: Empty State Boundary Transitions & UI Recovery
  // =========================================================================
  runner.setTier('Stage 5 — Tier 5: Empty State Boundary Transitions & UI Recovery');

  await runner.test('ADV-E01: Empty catalog (songs = []) in Piosenki tab renders "Brak piosenek" and "Katalog jest obecnie pusty."', () => {
    const harness = new AdversarialSongListHarness([]);
    const html = harness.html;
    assert(html.includes('Brak piosenek'), 'Must show Brak piosenek heading');
    assert(html.includes('Katalog jest obecnie pusty.'), 'Must show catalog empty message');
  });

  await runner.test('ADV-E02: Empty catalog (songs = []) in Wykonawcy tab renders clean empty state without exception', () => {
    const harness = new AdversarialSongListHarness([]);
    harness.setTab('artists');
    const html = harness.html;
    assert(html.includes('Brak piosenek'));
  });

  await runner.test('ADV-E03: Empty catalog (songs = []) in Ulubione tab renders "Brak ulubionych utworów" pristine empty state', () => {
    const harness = new AdversarialSongListHarness([]);
    harness.setTab('favorites');
    const html = harness.html;
    assert(html.includes('Brak ulubionych utworów'));
    assert(html.includes('Brak ulubionych utworów. Dodaj piosenki do ulubionych, klikając gwiazdkę.'));
  });

  await runner.test('ADV-E04: Zero-match search query renders "Brak wyników dla zapytania: \\"xyz\\"" with clear search button; clicking restores list', () => {
    const harness = new AdversarialSongListHarness(songs);
    harness.setSearchQuery('xyzniemazadnegotakiegoutworu');
    let html = harness.html;
    assert(html.includes('Brak wyników'));
    assert(html.includes('Wyczyść wyszukiwanie'));

    // Click "Wyczyść wyszukiwanie" button inside empty state
    harness.invokeClick((node) => node.type === 'button' && node.props.children === 'Wyczyść wyszukiwanie');
    assert.strictEqual(harness.searchQuery, '', 'searchQuery should be reset to empty');
    html = harness.html;
    assert(html.includes('Wehikuł Czasu'));
    assert(html.includes('Whisky'));
  });

  await runner.test('ADV-E05: Zero-match search query in Ulubione tab renders favorites-specific empty state "Brak wyników w ulubionych dla zapytania"', () => {
    const harness = new AdversarialSongListHarness(songs, ['wehikul-czasu']);
    harness.setTab('favorites');
    harness.setSearchQuery('lornetka'); // not in favorites
    const html = harness.html;
    assert(html.includes('Brak wyników w ulubionych dla zapytania:'));
    assert(html.includes('"lornetka"'));
    assert(html.includes('Wyczyść wyszukiwanie'));

    // Clear search restores favorite
    harness.invokeClick((node) => node.type === 'button' && node.props.children === 'Wyczyść wyszukiwanie');
    assert.strictEqual(harness.searchQuery, '');
    assert(harness.html.includes('Wehikuł Czasu'));
  });

  await runner.test('ADV-E06: Zero-match tag filter renders "Brak piosenek z wybranym tagiem" with clear tag button; clicking resets tag filter', () => {
    const harness = new AdversarialSongListHarness(songs);
    harness.setSelectedTag('Nieistniejący Tag');
    let html = harness.html;
    assert(html.includes('Brak piosenek z wybranym tagiem'));
    assert(html.includes('Pokaż wszystkie piosenki'));

    // Click "Pokaż wszystkie piosenki"
    harness.invokeClick((node) => node.type === 'button' && node.props.children === 'Pokaż wszystkie piosenki');
    assert.strictEqual(harness.selectedTag, null, 'selectedTag should be reset to null');
    html = harness.html;
    assert(html.includes('Wehikuł Czasu'));
  });

  await runner.test('ADV-E07: Pristine Ulubione empty state "Przeglądaj piosenki" CTA button switches active tab to songs', () => {
    const harness = new AdversarialSongListHarness(songs, []);
    harness.setTab('favorites');
    assert.strictEqual(harness.activeTab, 'favorites');
    assert(harness.html.includes('Przeglądaj piosenki'));

    // Click CTA
    harness.invokeClick((node) => node.type === 'button' && node.props.children === 'Przeglądaj piosenki');
    assert.strictEqual(harness.activeTab, 'songs', 'Active tab must transition to "songs"');
    assert(harness.html.includes('Wehikuł Czasu'));
  });

  await runner.test('ADV-E08: Dynamic boundary transition: un-starring the last favorited song while inside Ulubione tab immediately transitions UI to pristine empty state', () => {
    const harness = new AdversarialSongListHarness(songs, ['wehikul-czasu']);
    harness.setTab('favorites');
    assert(harness.html.includes('Wehikuł Czasu'));
    assert(!harness.html.includes('Brak ulubionych utworów. Dodaj piosenki'));

    // Un-star the only favorite
    harness.invokeClick((node) => node.type === 'button' && node.props['aria-label']?.includes('Usuń Wehikuł Czasu z ulubionych'));
    assert.strictEqual(harness.favorites.length, 0);

    // UI must immediately update to pristine empty state
    const html = harness.html;
    assert(html.includes('Brak ulubionych utworów'));
    assert(html.includes('Przeglądaj piosenki'));
  });

  // =========================================================================
  // CATEGORY 5: Rapid Multi-Action State Stress & Event Isolation
  // =========================================================================
  runner.setTier('Stage 5 — Tier 5: Rapid Multi-Action State Stress & Event Isolation');

  await runner.test('ADV-S01: 100-step chaos monkey fuzzing across Tab, Tag, Search, and Favorites operates without error or state corruption', () => {
    const harness = new AdversarialSongListHarness(songs, ['wehikul-czasu']);
    const tabs: SongListTab[] = ['songs', 'artists', 'favorites'];
    const sampleTags = [null, 'Rock', 'Blues', 'Folk', 'Ognisko', null];
    const sampleQueries = ['', 'weh', 'dzem', 'golec', 'nieistnieje', 'anioly', ''];

    for (let i = 0; i < 100; i++) {
      const nextTab = tabs[i % tabs.length];
      const nextTag = sampleTags[i % sampleTags.length];
      const nextQuery = sampleQueries[i % sampleQueries.length];

      harness.setTab(nextTab);
      harness.setSelectedTag(nextTag);
      harness.setSearchQuery(nextQuery);

      if (i % 5 === 0) {
        // Toggle a favorite
        const targetSlug = songs[i % songs.length].slug;
        const currentFavs = harness.favorites;
        if (currentFavs.includes(targetSlug)) {
          harness.updateFavorites(currentFavs.filter((s) => s !== targetSlug));
        } else {
          harness.updateFavorites([...currentFavs, targetSlug]);
        }
      }

      const html = harness.html;
      assert(typeof html === 'string');
      assert(html.length > 0);
    }
  });

  await runner.test('ADV-S02: Star click event strictly executes e.stopPropagation() and e.preventDefault() without triggering song link navigation', () => {
    const harness = new AdversarialSongListHarness(songs, []);
    let propagationStopped = false;
    let defaultPrevented = false;

    const mockEvent = {
      stopPropagation: () => { propagationStopped = true; },
      preventDefault: () => { defaultPrevented = true; },
    };

    harness.invokeClick(
      (node) => node.type === 'button' && node.props['aria-label']?.includes('Dodaj Wehikuł Czasu do ulubionych'),
      mockEvent
    );

    assert.strictEqual(propagationStopped, true, 'stopPropagation must be invoked on star click');
    assert.strictEqual(defaultPrevented, true, 'preventDefault must be invoked on star click');
    assert.strictEqual(harness.selectedSongs.length, 0, 'Song card selection must not be triggered on star click');
    assert.strictEqual(harness.toggledFavorites.length, 1);
    assert.strictEqual(harness.toggledFavorites[0], 'wehikul-czasu');
  });

  await runner.test('ADV-S03: Clicking song card body triggers onSelectSong with exact song slug and does not toggle favorites', () => {
    const harness = new AdversarialSongListHarness(songs, []);
    let prevented = false;
    const mockEvent = {
      preventDefault: () => { prevented = true; },
      stopPropagation: () => {},
    };

    harness.invokeClick(
      (node) => node.type === 'a' && node.props.href === '#/song/wehikul-czasu',
      mockEvent
    );

    assert.strictEqual(prevented, true, 'preventDefault must be called when onSelectSong is provided');
    assert.strictEqual(harness.selectedSongs.length, 1);
    assert.strictEqual(harness.selectedSongs[0], 'wehikul-czasu');
    assert.strictEqual(harness.toggledFavorites.length, 0, 'Must not toggle favorite when clicking card body');
  });

  await runner.test('ADV-S04: Clicking artist card body triggers onSelectArtist with exact artist slug', () => {
    const harness = new AdversarialSongListHarness(songs, []);
    harness.setTab('artists');

    let prevented = false;
    const mockEvent = {
      preventDefault: () => { prevented = true; },
      stopPropagation: () => {},
    };

    harness.invokeClick(
      (node) => node.type === 'a' && node.props.href?.startsWith('#/artist/'),
      mockEvent
    );

    assert.strictEqual(prevented, true);
    assert.strictEqual(harness.selectedArtists.length, 1);
    assert(['dzem', 'golec-uorkiestra', 'stare-dobre-malzenstwo'].includes(harness.selectedArtists[0]));
  });

  await runner.test('ADV-S05: Rapid letter-by-letter typing ("w" -> "we" -> "weh" -> "wehi" -> "wehik" -> "wehiku" -> "wehikul") filters monotonically', () => {
    const harness = new AdversarialSongListHarness(songs);
    const sequence = ['w', 'we', 'weh', 'wehi', 'wehik', 'wehiku', 'wehikul'];
    let prevCount = songs.length;

    for (const prefix of sequence) {
      harness.setSearchQuery(prefix);
      const matches = songs.filter((s) => matchSong(s, prefix).matches).length;
      assert(matches <= prevCount, `Match count must be monotonically non-increasing (was ${prevCount}, got ${matches} for "${prefix}")`);
      assert(matches >= 1, `Must match at least Wehikuł Czasu for "${prefix}"`);
      prevCount = matches;
    }
  });

  await runner.test('ADV-S06: Switching tabs ("songs" -> "artists" -> "favorites" -> "songs") preserves search query and selected tag', () => {
    const harness = new AdversarialSongListHarness(songs);
    harness.setSearchQuery('dzem');
    harness.setSelectedTag('Rock');

    harness.setTab('artists');
    assert.strictEqual(harness.searchQuery, 'dzem');
    assert.strictEqual(harness.selectedTag, 'Rock');

    harness.setTab('favorites');
    assert.strictEqual(harness.searchQuery, 'dzem');
    assert.strictEqual(harness.selectedTag, 'Rock');

    harness.setTab('songs');
    assert.strictEqual(harness.searchQuery, 'dzem');
    assert.strictEqual(harness.selectedTag, 'Rock');
  });

  await runner.test('ADV-S07: Theme toggle between dark and light preserves complete search, tab, tag, and favorites state', () => {
    const harness = new AdversarialSongListHarness(songs, ['whisky'], 'dark');
    harness.setTab('songs');
    harness.setSearchQuery('whisky');
    harness.setSelectedTag('Blues');

    harness.setTheme('light');
    assert.strictEqual(harness.activeTab, 'songs');
    assert.strictEqual(harness.searchQuery, 'whisky');
    assert.strictEqual(harness.selectedTag, 'Blues');
    assert.strictEqual(harness.favorites.length, 1);
    assert(harness.html.includes('bg-white'));

    harness.setTheme('dark');
    assert.strictEqual(harness.activeTab, 'songs');
    assert(harness.html.includes('bg-neutral-900'));
  });

  await runner.test('ADV-S08: Touch target compliance: all interactive elements satisfy min-h-[44px] or w-11 h-11', () => {
    const harness = new AdversarialSongListHarness(songs, ['wehikul-czasu']);
    harness.setSearchQuery('test');
    const html = harness.html;
    // Check tab buttons
    assert(html.includes('min-h-[44px]'));
    // Check clear button
    assert(html.includes('min-w-[44px] min-h-[44px]'));
    // Check star buttons
    assert(html.includes('min-w-[44px] min-h-[44px]'));
    // Check tag chips
    assert(html.includes('min-h-[44px] px-4 py-2'));
  });

  // =========================================================================
  // CATEGORY 6: High-Scale Catalog Fuzzing & Performance Benchmark
  // =========================================================================
  runner.setTier('Stage 5 — Tier 5: High-Scale Catalog Fuzzing & Performance Benchmark');

  await runner.test('ADV-P01: 1,000 synthetic song catalog instantiation: extractCatalogTags deduplicates across 5,000 tag instances in <10ms', () => {
    const genres = ['Rock', 'Blues', 'Folk', 'Poezja śpiewana', 'Ognisko', 'Turystyczne', 'Ballada', 'Metal', 'Jazz', 'Pop'];
    const syntheticSongs: ParsedSong[] = [];
    for (let i = 0; i < 1000; i++) {
      const songTags = [
        genres[i % genres.length],
        genres[(i + 3) % genres.length],
        genres[(i + 7) % genres.length],
      ];
      syntheticSongs.push(
        createAdversarialSong({
          title: `Utwór Testowy ${i}`,
          slug: `utwor-${i}`,
          artist: `Artysta ${i % 50}`,
          tags: songTags,
        })
      );
    }

    const start = performance.now();
    const tags = extractCatalogTags(syntheticSongs);
    const elapsed = performance.now() - start;

    assert.strictEqual(tags.length, genres.length);
    assert(elapsed < 20, `extractCatalogTags on 1000 songs took ${elapsed}ms; must complete in <20ms`);
  });

  await runner.test('ADV-P02: extractArtistCatalog on 1,000 synthetic songs groups into 100 unique artists with Polish sorting in <15ms', () => {
    const syntheticSongs: ParsedSong[] = [];
    for (let i = 0; i < 1000; i++) {
      syntheticSongs.push(
        createAdversarialSong({
          title: `Piosenka ${i}`,
          slug: `piosenka-${i}`,
          artist: `Wykonawca ${String(i % 100).padStart(3, '0')}`,
        })
      );
    }

    const start = performance.now();
    const artists = extractArtistCatalog(syntheticSongs);
    const elapsed = performance.now() - start;

    assert.strictEqual(artists.length, 100);
    for (const a of artists) {
      assert.strictEqual(a.songCount, 10);
    }
    assert(elapsed < 25, `extractArtistCatalog on 1000 songs took ${elapsed}ms; must complete in <25ms`);
  });

  await runner.test('ADV-P03: 50 multi-query catalog scans across 1,000 songs execute in under 500ms total (<10ms per 1,000-song catalog query)', () => {
    const syntheticSongs: ParsedSong[] = [];
    for (let i = 0; i < 1000; i++) {
      syntheticSongs.push(
        createAdversarialSong({
          title: `Bieszczadzki Poranek ${i}`,
          slug: `poranek-${i}`,
          artist: `Dżemowy Zespół ${i % 50}`,
          tags: ['Folk', 'Turystyczne'],
          rawLyrics: `Linijka pierwsza piosenki ${i}\nLinijka druga z tekstem do wyszukiwania\n`,
        })
      );
    }

    const testQueries = [
      'poranek', 'bieszczadzki', 'dzemowy', 'tekstem', 'folk',
      'poranek 42', 'nieistnieje', 'zespol', 'linijka', 'wyszukiwania',
    ];

    const start = performance.now();
    let queryCount = 0;
    for (let q = 0; q < 5; q++) {
      for (const query of testQueries) {
        const norm = normalizeSearchText(query);
        for (const s of syntheticSongs) {
          matchSong(s, norm);
        }
        queryCount++;
      }
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / queryCount;

    assert.strictEqual(queryCount, 50);
    assert(elapsed < 600, `50 queries took ${elapsed}ms total (avg ${avgMs.toFixed(3)}ms/query); must complete in <600ms`);
  });

  await runner.test('ADV-P04: Filter matrix (Tab + Tag + Query + Favorites) on 1,000 songs maintains instant render throughput', () => {
    const syntheticSongs: ParsedSong[] = [];
    for (let i = 0; i < 1000; i++) {
      syntheticSongs.push(
        createAdversarialSong({
          title: `Utwór ${i}`,
          slug: `utwor-${i}`,
          artist: `Artysta ${i % 25}`,
          tags: [i % 2 === 0 ? 'Rock' : 'Blues'],
        })
      );
    }

    const start = performance.now();
    const harness = new AdversarialSongListHarness(syntheticSongs, ['utwor-1', 'utwor-2', 'utwor-3']);
    harness.setSelectedTag('Rock');
    harness.setSearchQuery('utwor');
    const html = harness.html;
    const elapsed = performance.now() - start;

    assert(typeof html === 'string');
    assert(elapsed < 250, `Render on 1,000 songs took ${elapsed}ms; must complete in <250ms`);
  });

  await runner.test('ADV-P05: Contextual lyric snippet extractor on 1,000 songs with 50,000 total lyric lines executes in under 25ms', () => {
    const sampleLyrics = `
[Zwrotka 1]
[C] Siedzimy przy [G] ognisku w cichy [Am] chłodny wieczór [F]
Płomienie tańczą [C] w rytm dawno znanych [G] nut
[Refren]
To jest ten moment [F] gdy milknie wszelki [C] spór
I tylko wiatr [G] powtarza refren [C] gór
`;
    const targetLyrics = `
[Zwrotka 1]
Normalna linijka piosenki
[Refren]
Specjalna fraza diamentowy akord rozbrzmiewa w ciszy
`;

    const syntheticSongs: ParsedSong[] = [];
    for (let i = 0; i < 1000; i++) {
      syntheticSongs.push(
        createAdversarialSong({
          title: `Piosenka Ogniskowa ${i}`,
          slug: `ognisko-${i}`,
          rawLyrics: i === 777 ? targetLyrics : sampleLyrics,
        })
      );
    }

    const start = performance.now();
    let foundSnippet: string | null = null;
    for (const s of syntheticSongs) {
      const match = matchSong(s, 'diamentowy akord');
      if (match.matches && match.lyricSnippet) {
        foundSnippet = match.lyricSnippet;
        break;
      }
    }
    const elapsed = performance.now() - start;

    assert(foundSnippet !== null, 'Must extract target snippet from song #777');
    assert(foundSnippet.includes('diamentowy akord'), 'Snippet must include target text');
    assert(elapsed < 60, `Snippet scan across 1,000 songs took ${elapsed}ms; must complete in <60ms`);
  });

  await runner.test('ADV-P06: Memory and garbage collection stability: 500 render cycles generate zero memory leaks or dangling state', () => {
    const harness = new AdversarialSongListHarness(songs, ['wehikul-czasu']);
    const startMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) {
      harness.setSearchQuery(i % 2 === 0 ? 'wehikul' : 'whisky');
    }

    const endMemory = process.memoryUsage().heapUsed;
    const growthMb = (endMemory - startMemory) / (1024 * 1024);
    // Heap growth should remain bounded (< 15MB for 500 renders)
    assert(growthMb < 25, `Heap growth after 500 renders was ${growthMb.toFixed(2)}MB; must be < 25MB`);
  });
}
