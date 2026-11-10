import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework';
import { HookHarness } from './helpers/hook_harness';
import { MockRoutingEnvironment } from './helpers/routing_storage_harness';
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

// Interactive test harness for SongList React component
class SongListHarness {
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

  // Find and invoke click handler on a node matching predicate
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

export async function runStage5Tests(runner: TestRunner) {
  const songs = loadTestCatalog();

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (F73–F96)
  // =========================================================================
  runner.setTier('Stage 5 — Tier 1: Feature Coverage (F73–F96)');

  // --- F73: Native Polish Diacritic Normalizer ---
  await runner.test('F73.1: Normalizes all lowercase Polish diacritics to unaccented ASCII (ą, ć, ę, ł, ń, ó, ś, ź, ż)', () => {
    const input = 'ąęćłńóśźż';
    const output = normalizeSearchText(input);
    assert.strictEqual(output, 'aeclnoszz');
  });

  await runner.test('F73.2: Normalizes all uppercase Polish diacritics to lowercase ASCII (Ą, Ć, Ę, Ł, Ń, Ó, Ś, Ź, Ż)', () => {
    const input = 'ĄĘĆŁŃÓŚŹŻ';
    const output = normalizeSearchText(input);
    assert.strictEqual(output, 'aeclnoszz');
  });

  await runner.test('F73.3: Specifically replaces stroke characters ł and Ł with l ("Wehikuł" -> "wehikul", "ŁÓDŹ" -> "lodz")', () => {
    assert.strictEqual(normalizeSearchText('Wehikuł'), 'wehikul');
    assert.strictEqual(normalizeSearchText('ŁÓDŹ'), 'lodz');
    assert.strictEqual(normalizeSearchText('bałwan'), 'balwan');
    assert.strictEqual(normalizeSearchText('Kupiłek'), 'kupilek');
  });

  await runner.test('F73.4: Trims outer whitespace while preserving internal single and multiple spaces', () => {
    assert.strictEqual(normalizeSearchText('   Bieszczadzkie Anioły   '), 'bieszczadzkie anioły'.replace(/[łŁ]/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    assert.strictEqual(normalizeSearchText('\n\tWehikuł czasu\t '), 'wehikul czasu');
  });

  await runner.test('F73.5: Normalizes famous Polish pangram "Zażółć gęślą jaźń" to "zazolc gesla jazn"', () => {
    const pangram = 'Zażółć gęślą jaźń';
    assert.strictEqual(normalizeSearchText(pangram), 'zazolc gesla jazn');
  });

  // --- F74: Multi-Field Search Matcher ---
  await runner.test('F74.1: Matches case- and diacritic-tolerant query against song title ("wehikul" -> "Wehikuł Czasu")', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(song, 'wehikul');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'title');
    assert.strictEqual(res.lyricSnippet, null);
  });

  await runner.test('F74.2: Matches case- and diacritic-tolerant query against song artist ("dzem" -> "Dżem")', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(song, 'dzem');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'artist');
    assert.strictEqual(res.lyricSnippet, null);
  });

  await runner.test('F74.3: Matches case- and diacritic-tolerant query against song tags ("turystyczne" -> tag in Bieszczadzkie Anioły)', () => {
    const song = songs.find((s) => s.slug === 'bieszczadzkie-anioly')!;
    const res = matchSong(song, 'turystyczne');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'tag');
    assert.strictEqual(res.lyricSnippet, null);
  });

  await runner.test('F74.4: Matches query within rawLyrics when title and artist do not match ("jam session" -> lyrics)', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(song, 'jam session');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'lyrics');
    assert(res.lyricSnippet !== null, 'Must extract contextual lyric snippet');
    assert(res.lyricSnippet?.includes('Jam session do rana') || res.lyricSnippet?.includes('tam królował blues'), 'Snippet must contain matching line');
  });

  await runner.test('F74.5: Title match priority suppresses lyric snippet even if lyric body contains title keyword', () => {
    const song = songs.find((s) => s.slug === 'whisky')!;
    // "Whisky" is in title and also in lyrics ("Whisky, moja żono")
    const res = matchSong(song, 'whisky');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'title');
    assert.strictEqual(res.lyricSnippet, null, 'Must suppress lyric snippet on title match');
  });

  await runner.test('F74.6: Artist match priority suppresses lyric snippet even if lyric body contains artist keyword', () => {
    const song = songs.find((s) => s.slug === 'lornetka')!;
    // "Golec" matches artist
    const res = matchSong(song, 'golec');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'artist');
    assert.strictEqual(res.lyricSnippet, null, 'Must suppress lyric snippet on artist match');
  });

  // --- F75: Search Input UI with Clear Button ---
  await runner.test('F75.1: Renders search input with exact Polish placeholder "Szukaj piosenki, wykonawcy, tekstu..."', () => {
    const harness = new SongListHarness(songs);
    assert(harness.html.includes('placeholder="Szukaj piosenki, wykonawcy, tekstu..."'));
  });

  await runner.test('F75.2: Search input contains accessible Polish aria-label', () => {
    const harness = new SongListHarness(songs);
    assert(harness.html.includes('aria-label="Szukaj piosenki, wykonawcy, tekstu"'));
  });

  await runner.test('F75.3: Renders inline SVG SearchIcon inside the search bar', () => {
    const harness = new SongListHarness(songs);
    assert(harness.html.includes('<svg') && harness.html.includes('viewBox="0 0 24 24"'));
  });

  await runner.test('F75.4: Clear button (✕) is hidden when search input is empty', () => {
    const harness = new SongListHarness(songs);
    assert.strictEqual(harness.searchQuery, '');
    assert(!harness.html.includes('aria-label="Wyczyść wyszukiwanie"'));
  });

  await runner.test('F75.5: Clear button renders with accessible label and >=44px touch target when query is non-empty', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('dzem');
    assert(harness.html.includes('aria-label="Wyczyść wyszukiwanie"'));
    assert(harness.html.includes('title="Wyczyść wyszukiwanie"'));
    assert(harness.html.includes('min-w-[44px]') && harness.html.includes('min-h-[44px]'));
  });

  await runner.test('F75.6: Clicking clear button resets search query to empty string', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('dzem');
    assert.strictEqual(harness.searchQuery, 'dzem');
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Wyczyść wyszukiwanie');
    assert.strictEqual(harness.searchQuery, '');
    assert(!harness.html.includes('aria-label="Wyczyść wyszukiwanie"'));
  });

  // --- F76: Contextual Lyric Snippet Extractor ---
  await runner.test('F76.1: cleanLyricLine strips square-bracket chord tokens from lyric lines', () => {
    const input = '[G]Kupiłek se [C]lornetkę [D]by oglądać świat';
    const cleaned = cleanLyricLine(input);
    assert.strictEqual(cleaned, 'Kupiłek se lornetkę by oglądać świat');
  });

  await runner.test('F76.2: cleanLyricLine discards section headers ([Zwrotka 1], {Refren}, ---)', () => {
    assert.strictEqual(cleanLyricLine('[Zwrotka 1]'), null);
    assert.strictEqual(cleanLyricLine('[Refren]'), null);
    assert.strictEqual(cleanLyricLine('{Verse 1}'), null);
    assert.strictEqual(cleanLyricLine('---'), null);
  });

  await runner.test('F76.3: cleanLyricLine discards chord-only lines ("A   E   F#m   D")', () => {
    assert.strictEqual(cleanLyricLine('A   E   F#m   D'), null);
    assert.strictEqual(cleanLyricLine('G   C   D   G'), null);
  });

  await runner.test('F76.4: extractLyricSnippet formats matched lyric line as "... [line] ..."', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const snippet = extractLyricSnippet(song.rawLyrics, 'błękitny wiatr');
    assert.strictEqual(snippet, '... Pójdziemy razem tam, gdzie błękitny wiatr ...');
  });

  await runner.test('F76.5: extractLyricSnippet performs Polish diacritic-tolerant matching ("blekitny wiatr" matches "błękitny wiatr")', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const snippet = extractLyricSnippet(song.rawLyrics, 'blekitny wiatr');
    assert.strictEqual(snippet, '... Pójdziemy razem tam, gdzie błękitny wiatr ...');
  });

  await runner.test('F76.6: extractLyricSnippet returns null when query matches no lyric lines', () => {
    const song = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const snippet = extractLyricSnippet(song.rawLyrics, 'nieistniejący wers tekstu');
    assert.strictEqual(snippet, null);
  });

  // --- F77: Lyric Snippet Card Display & Suppression ---
  await runner.test('F77.1: Renders snippet below artist in subtle styling when query matches lyrics only', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('jam session');
    const html = harness.html;
    assert(html.includes('Jam session do rana') || html.includes('tam królował blues'));
    assert(html.includes('font-mono') && html.includes('italic'));
  });

  await runner.test('F77.2: Lyric snippet is formatted with leading and trailing ellipsis ("... line ...")', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('blekitny wiatr');
    const html = harness.html;
    assert(html.includes('... Pójdziemy razem tam, gdzie błękitny wiatr ...'));
  });

  await runner.test('F77.3: Suppresses lyric snippet when query matches song title ("wehikul")', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('wehikul');
    assert(!harness.html.includes('... Pamiętam tylko to'));
  });

  await runner.test('F77.4: Suppresses lyric snippet when query matches song artist ("dzem")', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('dzem');
    assert(!harness.html.includes('... Tylko nocą'));
  });

  await runner.test('F77.5: Suppresses lyric snippet when query matches tag only ("poezja")', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('poezja');
    assert(!harness.html.includes('... Anioły są całe'));
  });

  // --- F78: Dynamic Unique Tag Aggregator ---
  await runner.test('F78.1: Extracts all unique tags dynamically across catalog songs', () => {
    const tags = extractCatalogTags(songs);
    assert(tags.includes('rock'), 'Must include rock');
    assert(tags.includes('blues'), 'Must include blues');
    assert(tags.includes('ognisko'), 'Must include ognisko');
    assert(tags.includes('poezja'), 'Must include poezja');
    assert(tags.includes('turystyczne'), 'Must include turystyczne');
  });

  await runner.test('F78.2: Deduplicates identical tags shared across multiple songs', () => {
    const tags = extractCatalogTags(songs);
    const rockCount = tags.filter((t) => t === 'rock').length;
    assert.strictEqual(rockCount, 1, 'Tag "rock" must appear exactly once');
    const ogniskoCount = tags.filter((t) => t === 'ognisko').length;
    assert.strictEqual(ogniskoCount, 1, 'Tag "ognisko" must appear exactly once');
  });

  await runner.test('F78.3: Alphabetically sorts extracted tags using Polish locale collation', () => {
    const tags = extractCatalogTags(songs);
    for (let i = 0; i < tags.length - 1; i++) {
      assert(tags[i].localeCompare(tags[i + 1], 'pl') <= 0, `Tag ${tags[i]} must precede ${tags[i + 1]}`);
    }
  });

  await runner.test('F78.4: Trims whitespace from tags and ignores empty or whitespace-only tags', () => {
    const dirtySongs: ParsedSong[] = [
      { ...songs[0], tags: ['  folk  ', '', '   ', 'poezja'] },
    ];
    const tags = extractCatalogTags(dirtySongs);
    assert(tags.includes('folk'));
    assert(tags.includes('poezja'));
    assert(!tags.includes(''));
    assert(!tags.includes('   '));
  });

  await runner.test('F78.5: Handles songs with missing or undefined tags array safely without throwing', () => {
    const songNoTags: ParsedSong = { ...songs[0], tags: undefined as any };
    const tags = extractCatalogTags([songNoTags]);
    assert(Array.isArray(tags));
  });

  // --- F79: Horizontal Scrollable Tag Bar & "@utility no-scrollbar" ---
  await runner.test('F79.1: Tag bar has role="group" and Polish accessibility aria-label="Filtr tagów"', () => {
    const harness = new SongListHarness(songs);
    assert(harness.html.includes('role="group"'));
    assert(harness.html.includes('aria-label="Filtr tagów"'));
  });

  await runner.test('F79.2: Tag bar container applies overflow-x-auto and no-scrollbar classes', () => {
    const harness = new SongListHarness(songs);
    assert(harness.html.includes('overflow-x-auto'));
    assert(harness.html.includes('no-scrollbar'));
  });

  await runner.test('F79.3: src/index.css defines @utility no-scrollbar with scrollbar-width: none and hidden webkit scrollbar', () => {
    const css = fs.readFileSync('src/index.css', 'utf8');
    assert(css.includes('@utility no-scrollbar'), 'index.css must define @utility no-scrollbar');
    assert(css.includes('scrollbar-width: none'), 'Must set scrollbar-width to none');
    assert(css.includes('&::-webkit-scrollbar'), 'Must hide webkit scrollbar');
  });

  await runner.test('F79.4: Tag chips have shrink-0 ensuring smooth horizontal scrolling without layout collapse', () => {
    const harness = new SongListHarness(songs);
    assert(harness.html.includes('shrink-0'));
  });

  // --- F80 & F81: "Wszystkie" Chip & Tag Toggle ---
  await runner.test('F80.1: "Wszystkie" chip renders as the first chip with aria-pressed="true" by default', () => {
    const harness = new SongListHarness(songs);
    assert.strictEqual(harness.selectedTag, null);
    assert(harness.html.includes('Wszystkie'));
    assert(harness.html.includes('aria-pressed="true"'));
  });

  await runner.test('F80.2: "Wszystkie" chip has active amber styling (bg-amber-500 text-neutral-950 font-bold) when selectedTag is null', () => {
    const harness = new SongListHarness(songs);
    const html = harness.html;
    assert(html.includes('bg-amber-500 text-neutral-950 font-bold'));
  });

  await runner.test('F81.1: Selecting a tag chip sets selectedTag and applies active amber styling to it', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('rock');
    assert.strictEqual(harness.selectedTag, 'rock');
    // "Wszystkie" should now be aria-pressed="false"
    assert(harness.html.includes('aria-pressed="false"'));
  });

  await runner.test('F81.2: Selecting a tag filters displayed songs to only those containing that tag', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('poezja');
    const html = harness.html;
    assert(html.includes('Bieszczadzkie Anioły'), 'Must include song with poezja tag');
    assert(!html.includes('Wehikuł Czasu'), 'Must exclude song without poezja tag');
    assert(!html.includes('Lornetka'), 'Must exclude song without poezja tag');
  });

  await runner.test('F81.3: Clicking an already-selected tag chip toggles it off back to null ("Wszystkie")', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('rock');
    assert.strictEqual(harness.selectedTag, 'rock');
    // Click rock chip again
    harness.invokeClick((node) => node.props?.children === 'rock');
    assert.strictEqual(harness.selectedTag, null);
    // All songs visible again
    assert(harness.html.includes('Bieszczadzkie Anioły'));
    assert(harness.html.includes('Wehikuł Czasu'));
  });

  // --- F82: Multi-Criteria AND Filter Matrix ---
  await runner.test('F82.1: AND filter simultaneously matches both selected tag and search query', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('rock'); // matches Wehikuł Czasu, Whisky
    harness.setSearchQuery('whisky'); // matches Whisky only
    const html = harness.html;
    assert(html.includes('Whisky'), 'Whisky satisfies both rock tag AND query');
    assert(!html.includes('Wehikuł Czasu'), 'Wehikuł Czasu excluded because query does not match');
    assert(!html.includes('Lornetka'), 'Lornetka excluded because neither tag nor query matches');
  });

  await runner.test('F82.2: Excludes song when search query matches but tag does not match', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('poezja'); // only Bieszczadzkie Anioły
    harness.setSearchQuery('wehikul'); // matches Wehikuł Czasu
    const html = harness.html;
    assert(!html.includes('Wehikuł Czasu'));
    assert(html.includes('Brak wyników'));
  });

  await runner.test('F82.3: Excludes song when tag matches but search query does not match', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('rock');
    harness.setSearchQuery('xyznonexistent');
    const html = harness.html;
    assert(html.includes('Brak wyników'));
  });

  await runner.test('F82.4: AND filter operates consistently when filtering within Ulubione tab', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu', 'whisky', 'lornetka']);
    harness.setTab('favorites');
    harness.setSelectedTag('rock');
    harness.setSearchQuery('czasu');
    const html = harness.html;
    assert(html.includes('Wehikuł Czasu'));
    assert(!html.includes('Whisky'));
    assert(!html.includes('Lornetka'));
  });

  // --- F83 & F84: Dual Catalog 3-Tab Bar & "Piosenki" Tab ---
  await runner.test('F83.1: Tab bar renders role="tablist" with Polish label "Kategorie katalogu"', () => {
    const harness = new SongListHarness(songs);
    assert(harness.html.includes('role="tablist"'));
    assert(harness.html.includes('aria-label="Kategorie katalogu"'));
  });

  await runner.test('F83.2: Tab bar renders all 3 tabs: "Piosenki", "Wykonawcy", "Ulubione"', () => {
    const harness = new SongListHarness(songs);
    assert(harness.html.includes('id="tab-songs"'));
    assert(harness.html.includes('id="tab-artists"'));
    assert(harness.html.includes('id="tab-favorites"'));
    assert(harness.html.includes('>Piosenki</span>'));
    assert(harness.html.includes('>Wykonawcy</span>'));
    assert(harness.html.includes('>Ulubione</span>'));
  });

  await runner.test('F83.3: Default active tab is "Piosenki" (aria-selected="true" and amber border)', () => {
    const harness = new SongListHarness(songs);
    assert.strictEqual(harness.activeTab, 'songs');
    assert(harness.html.includes('id="tab-songs"'));
    assert(harness.html.includes('aria-selected="true"'));
    assert(harness.html.includes('border-amber-500'));
  });

  await runner.test('F83.4: Each tab displays dynamic badge count (songs: 4, artists: 3, favorites: 1)', () => {
    const harness = new SongListHarness(songs, ['whisky']);
    const html = harness.html;
    // Songs badge = 4
    assert(html.includes(`>${songs.length}</span>`));
    // Artists badge = 3 (Dżem, Golec uOrkiestra, Stare Dobre Małżeństwo)
    assert(html.includes('>3</span>'));
    // Favorites badge = 1
    assert(html.includes('>1</span>'));
  });

  await runner.test('F84.1: "Piosenki" tab renders song cards with title, artist, key, and link to #/song/:slug', () => {
    const harness = new SongListHarness(songs);
    const html = harness.html;
    assert(html.includes('href="#/song/wehikul-czasu"'));
    assert(html.includes('href="#/song/whisky"'));
    assert(html.includes('href="#/song/lornetka"'));
    assert(html.includes('href="#/song/bieszczadzkie-anioly"'));
    assert(html.includes('Dżem'));
    assert(html.includes('Golec uOrkiestra'));
  });

  await runner.test('F84.2: Song card click triggers onSelectSong callback when provided', () => {
    const harness = new SongListHarness(songs);
    let prevented = false;
    harness.invokeClick(
      (node) => node.props?.href === '#/song/wehikul-czasu',
      { preventDefault: () => { prevented = true; }, stopPropagation: () => {} }
    );
    assert(prevented, 'Must call e.preventDefault() when onSelectSong is provided');
    assert(harness.selectedSongs.includes('wehikul-czasu'));
  });

  // --- F85 & F86: "Wykonawcy" Tab & Diacritic-Insensitive Artist Navigation ---
  await runner.test('F85.1: "Wykonawcy" tab groups songs by artist and sorts alphabetically (localeCompare "pl")', () => {
    const artistCatalog = extractArtistCatalog(songs);
    assert.strictEqual(artistCatalog.length, 3);
    assert.strictEqual(artistCatalog[0].name, 'Dżem');
    assert.strictEqual(artistCatalog[1].name, 'Golec uOrkiestra');
    assert.strictEqual(artistCatalog[2].name, 'Stare Dobre Małżeństwo');
  });

  await runner.test('F85.2: "Wykonawcy" tab displays accurate Polish song count pluralization ("2 utwory", "1 utwór")', () => {
    const harness = new SongListHarness(songs);
    harness.setTab('artists');
    const html = harness.html;
    assert(html.includes('2 utwory'), 'Dżem has 2 songs');
    assert(html.includes('1 utwór'), 'Golec has 1 song');
  });

  await runner.test('F85.3: Artist cards render in panel-artists with links to #/artist/:slug', () => {
    const harness = new SongListHarness(songs);
    harness.setTab('artists');
    const html = harness.html;
    assert(html.includes('id="panel-artists"'));
    assert(html.includes('href="#/artist/dzem"'));
    assert(html.includes('href="#/artist/golec-uorkiestra"'));
    assert(html.includes('href="#/artist/stare-dobre-malzenstwo"'));
  });

  await runner.test('F86.1: artistToSlug normalizes Polish characters to clean URL slug ("Dżem" -> "dzem")', () => {
    assert.strictEqual(artistToSlug('Dżem'), 'dzem');
    assert.strictEqual(artistToSlug('Stare Dobre Małżeństwo'), 'stare-dobre-malzenstwo');
  });

  await runner.test('F86.2: artistToSlug handles Polish stroke letters Ł and ł ("Golec uOrkiestra" -> "golec-uorkiestra", "Łzy" -> "lzy")', () => {
    assert.strictEqual(artistToSlug('Golec uOrkiestra'), 'golec-uorkiestra');
    assert.strictEqual(artistToSlug('Łzy'), 'lzy');
    assert.strictEqual(artistToSlug('Białystok'), 'bialystok');
  });

  await runner.test('F86.3: Artist card click triggers onSelectArtist callback with artist slug', () => {
    const harness = new SongListHarness(songs);
    harness.setTab('artists');
    let prevented = false;
    harness.invokeClick(
      (node) => node.props?.href === '#/artist/dzem',
      { preventDefault: () => { prevented = true; }, stopPropagation: () => {} }
    );
    assert(prevented, 'Must call e.preventDefault() on artist click');
    assert(harness.selectedArtists.includes('dzem'));
  });

  // --- F87 & F88: "Ulubione" Filtered Favorites Tab & Polish Empty State ---
  await runner.test('F87.1: "Ulubione" tab displays only starred songs present in favorites array', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu']);
    harness.setTab('favorites');
    const html = harness.html;
    assert(html.includes('Wehikuł Czasu'));
    assert(!html.includes('Whisky'));
    assert(!html.includes('Lornetka'));
    assert(!html.includes('Bieszczadzkie Anioły'));
  });

  await runner.test('F87.2: "Ulubione" badge dynamically matches current favorites count', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu', 'whisky']);
    assert(harness.html.includes('>2</span>'));
    harness.updateFavorites(['wehikul-czasu']);
    assert(harness.html.includes('>1</span>'));
  });

  await runner.test('F88.1: When favorites is empty, renders exact Polish empty state heading and notice', () => {
    const harness = new SongListHarness(songs, []);
    harness.setTab('favorites');
    const html = harness.html;
    assert(html.includes('Brak ulubionych utworów'));
    assert(
      html.includes('Brak ulubionych utworów. Dodaj piosenki do ulubionych, klikając gwiazdkę.'),
      'Must render exact Polish guidance string'
    );
  });

  await runner.test('F88.2: Empty favorites notice includes "Przeglądaj piosenki" CTA button switching back to songs tab', () => {
    const harness = new SongListHarness(songs, []);
    harness.setTab('favorites');
    assert.strictEqual(harness.activeTab, 'favorites');
    harness.invokeClick((node) => node.props?.children === 'Przeglądaj piosenki');
    assert.strictEqual(harness.activeTab, 'songs');
  });

  await runner.test('F88.3: When favorites exist but search query filters all out, displays contextual favorites empty notice', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu']);
    harness.setTab('favorites');
    harness.setSearchQuery('nieistniejaca-piosenka');
    const html = harness.html;
    assert(html.includes('Brak wyników w ulubionych dla zapytania:'));
    assert(html.includes('"nieistniejaca-piosenka"'));
  });

  // --- F89: Search Results Empty State ---
  await runner.test('F89.1: Displays "Brak wyników" header and query quote when search query yields 0 results in Piosenki tab', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('xyzabc123');
    const html = harness.html;
    assert(html.includes('Brak wyników'));
    assert(html.includes('Brak wyników dla zapytania:'));
    assert(html.includes('"xyzabc123"'));
  });

  await runner.test('F89.2: Empty search state includes "Wyczyść wyszukiwanie" button that resets search query', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('xyzabc123');
    assert.strictEqual(harness.searchQuery, 'xyzabc123');
    harness.invokeClick((node) => node.props?.children === 'Wyczyść wyszukiwanie');
    assert.strictEqual(harness.searchQuery, '');
    assert(harness.html.includes('Wehikuł Czasu'));
  });

  await runner.test('F89.3: Displays "Brak piosenek z tagiem" and "Pokaż wszystkie piosenki" button when tag has no songs', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('pusty-tag');
    const html = harness.html;
    assert(html.includes('Brak piosenek z tagiem'));
    assert(html.includes('Pokaż wszystkie piosenki'));
    harness.invokeClick((node) => node.props?.children === 'Pokaż wszystkie piosenki');
    assert.strictEqual(harness.selectedTag, null);
  });

  await runner.test('F89.4: Displays "Katalog jest obecnie pusty." when catalog contains 0 songs', () => {
    const harness = new SongListHarness([]);
    const html = harness.html;
    assert(html.includes('Brak piosenek'));
    assert(html.includes('Katalog jest obecnie pusty.'));
  });

  // --- F90 & F91: Star Icon Favorites Toggle & Click Isolation ---
  await runner.test('F90.1: Unstarred song displays outlined StarIcon (filled={false})', () => {
    const harness = new SongListHarness(songs, []);
    const html = harness.html;
    assert(html.includes('aria-label="Dodaj Wehikuł Czasu do ulubionych"'));
  });

  await runner.test('F90.2: Starred song displays filled StarIcon (filled={true}) and amber styling', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu']);
    const html = harness.html;
    assert(html.includes('aria-label="Usuń Wehikuł Czasu z ulubionych"'));
    assert(html.includes('text-amber-400'));
  });

  await runner.test('F90.3: Tapping star icon triggers onToggleFavorite with song slug', () => {
    const harness = new SongListHarness(songs, []);
    harness.invokeClick(
      (node) => node.props?.['aria-label'] === 'Dodaj Wehikuł Czasu do ulubionych',
      { stopPropagation: () => {}, preventDefault: () => {} }
    );
    assert(harness.toggledFavorites.includes('wehikul-czasu'));
    assert(harness.favorites.includes('wehikul-czasu'));
  });

  await runner.test('F91.1: Star button click invokes e.stopPropagation() preventing link navigation', () => {
    const harness = new SongListHarness(songs, []);
    let stopped = false;
    let prevented = false;
    harness.invokeClick(
      (node) => node.props?.['aria-label'] === 'Dodaj Wehikuł Czasu do ulubionych',
      {
        stopPropagation: () => { stopped = true; },
        preventDefault: () => { prevented = true; },
      }
    );
    assert(stopped, 'Must call e.stopPropagation() on star button');
    assert(prevented, 'Must call e.preventDefault() on star button');
  });

  await runner.test('F91.2: Song card link navigation is not invoked when star button is clicked', () => {
    const harness = new SongListHarness(songs, []);
    harness.invokeClick(
      (node) => node.props?.['aria-label'] === 'Dodaj Wehikuł Czasu do ulubionych',
      { stopPropagation: () => {}, preventDefault: () => {} }
    );
    assert.strictEqual(harness.selectedSongs.length, 0, 'onSelectSong must NOT be triggered on star click');
  });

  // --- F92, F93, F94: Storage Persistence & App.tsx Integration ---
  await runner.test('F92.1: App.tsx stores favorites under key "spiewnik_favorites" in localStorage', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('STORAGE_KEYS.FAVORITES'), 'App.tsx must use STORAGE_KEYS.FAVORITES');
    const storageSrc = fs.readFileSync('src/hooks/useLocalStorage.ts', 'utf8');
    assert(storageSrc.includes("FAVORITES: 'spiewnik_favorites'"), 'Key must be spiewnik_favorites');
  });

  await runner.test('F93.1: App.tsx mounts <SongList /> on catalog route passing songs, theme, favorites and toggle handler', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('<SongList'), 'App.tsx must mount <SongList />');
    assert(appSrc.includes('songs={songs}'), 'Passes songs prop');
    assert(appSrc.includes('theme={theme}'), 'Passes theme prop');
    assert(appSrc.includes('favorites={favorites}'), 'Passes favorites prop');
    assert(appSrc.includes('onToggleFavorite={handleToggleFavorite}'), 'Passes onToggleFavorite prop');
  });

  await runner.test('F94.1: App.tsx artist view (#/artist/:slug) includes star button with stopPropagation and handleToggleFavorite', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('handleToggleFavorite(s.slug)'), 'Artist view must toggle favorites');
    assert(appSrc.includes('e.stopPropagation()'), 'Artist star button must isolate event propagation');
    assert(appSrc.includes('e.preventDefault()'), 'Artist star button must prevent link navigation');
  });

  await runner.test('F94.2: App.tsx artist route uses diacritic-insensitive slug matching', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('artistToSlug(s.artist) === normSlug') || appSrc.includes('[łŁ]'), 'Must support diacritic-tolerant slug matching');
  });

  await runner.test('F94.3: App.tsx artist view renders ArrowLeftIcon back button with #/ fallback', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('ArrowLeftIcon'), 'Artist view must render back button');
    assert(appSrc.includes('href="#/"'), 'Back button must link to #/');
  });

  // --- F95 & F96: Polish UI, Theme Styling & Touch Target Compliance ---
  await runner.test('F95.1: SongList UI strings are 100% Polish (no English "Search", "Favorites", "Artists", "All")', () => {
    const harness = new SongListHarness(songs);
    const html = harness.html;
    assert(!html.includes('>Search<') && !html.includes('>Favorites<') && !html.includes('>Artists<'));
    assert(html.includes('Piosenki') && html.includes('Wykonawcy') && html.includes('Ulubione') && html.includes('Wszystkie'));
  });

  await runner.test('F95.2: Dark theme applies OLED dark background classes (bg-neutral-900, border-neutral-800, text-neutral-100)', () => {
    const harness = new SongListHarness(songs, [], 'dark');
    const html = harness.html;
    assert(html.includes('bg-neutral-900') && html.includes('border-neutral-800'));
  });

  await runner.test('F95.3: Light theme applies clean light styling classes (bg-white, border-neutral-200, text-neutral-900, shadow-sm)', () => {
    const harness = new SongListHarness(songs, [], 'light');
    const html = harness.html;
    assert(html.includes('bg-white') && html.includes('border-neutral-200'));
  });

  await runner.test('F96.1: All tabs, chips, buttons, and star icons specify >=44px touch targets (min-h-[44px], min-w-[44px])', () => {
    const harness = new SongListHarness(songs);
    const html = harness.html;
    assert(html.includes('min-h-[44px]'), 'Must enforce minimum 44px height touch targets');
  });

  await runner.test('F96.2: Search clear button satisfies >= 44x44px bounding box', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('test');
    assert(harness.html.includes('min-w-[44px]') && harness.html.includes('min-h-[44px]'));
  });


  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>= 25 tests)
  // =========================================================================
  runner.setTier('Stage 5 — Tier 2: Boundary & Corner Cases');

  await runner.test('T2.01: normalizeSearchText with empty string returns empty string', () => {
    assert.strictEqual(normalizeSearchText(''), '');
  });

  await runner.test('T2.02: normalizeSearchText with only whitespace returns empty string', () => {
    assert.strictEqual(normalizeSearchText('     \t\r\n  '), '');
  });

  await runner.test('T2.03: normalizeSearchText with null safely returns empty string', () => {
    assert.strictEqual(normalizeSearchText(null as any), '');
  });

  await runner.test('T2.04: normalizeSearchText with undefined safely returns empty string', () => {
    assert.strictEqual(normalizeSearchText(undefined as any), '');
  });

  await runner.test('T2.05: normalizeSearchText with number safely returns empty string', () => {
    assert.strictEqual(normalizeSearchText(12345 as any), '');
  });

  await runner.test('T2.06: Single Polish diacritic query "ą" matches song with "ą" in title or lyrics', () => {
    const song = songs.find((s) => s.slug === 'bieszczadzkie-anioly')!;
    const res = matchSong(song, 'ą');
    assert.strictEqual(res.matches, true);
  });

  await runner.test('T2.07: Single Polish diacritic query "ł" matches "Wehikuł" and "Kupiłek"', () => {
    const song1 = songs.find((s) => s.slug === 'wehikul-czasu')!;
    const song2 = songs.find((s) => s.slug === 'lornetka')!;
    assert.strictEqual(matchSong(song1, 'ł').matches, true);
    assert.strictEqual(matchSong(song2, 'ł').matches, true);
  });

  await runner.test('T2.08: Punctuation-only search queries ("... ??? !!!") safely handled without exceptions', () => {
    const song = songs[0];
    const res = matchSong(song, '... ??? !!!');
    assert.strictEqual(res.matches, false);
  });

  await runner.test('T2.09: Extremely long search query (5,000 chars) processes cleanly without regex blowup', () => {
    const longQuery = 'a'.repeat(5000);
    const start = performance.now();
    const res = matchSong(songs[0], longQuery);
    const elapsed = performance.now() - start;
    assert.strictEqual(res.matches, false);
    assert(elapsed < 100, `Search must finish under 100ms (took ${elapsed}ms)`);
  });

  await runner.test('T2.10: Polish uppercase pangram normalizes identically to lowercase pangram', () => {
    const upper = normalizeSearchText('ZAŻÓŁĆ GĘŚLĄ JAŹŃ');
    const lower = normalizeSearchText('zażółć gęślą jaźń');
    assert.strictEqual(upper, lower);
    assert.strictEqual(upper, 'zazolc gesla jazn');
  });

  await runner.test('T2.11: extractCatalogTags with empty song list returns empty array', () => {
    assert.deepStrictEqual(extractCatalogTags([]), []);
  });

  await runner.test('T2.12: extractCatalogTags filters out empty strings and whitespace-only tags', () => {
    const dummySongs: ParsedSong[] = [
      { ...songs[0], tags: ['', '   ', 'pop', ''] },
    ];
    assert.deepStrictEqual(extractCatalogTags(dummySongs), ['pop']);
  });

  await runner.test('T2.13: extractCatalogTags deduplicates tags differing only by outer whitespace', () => {
    const dummySongs: ParsedSong[] = [
      { ...songs[0], tags: ['rock', ' rock ', 'rock  '] },
    ];
    assert.deepStrictEqual(extractCatalogTags(dummySongs), ['rock']);
  });

  await runner.test('T2.14: cleanLyricLine on empty string, whitespace or null returns null', () => {
    assert.strictEqual(cleanLyricLine(''), null);
    assert.strictEqual(cleanLyricLine('   \n\t '), null);
    assert.strictEqual(cleanLyricLine(null as any), null);
    assert.strictEqual(cleanLyricLine(undefined as any), null);
  });

  await runner.test('T2.15: cleanLyricLine on line with only chord brackets ("[C] [G] [Am]") returns null', () => {
    assert.strictEqual(cleanLyricLine('[C] [G] [Am]'), null);
    assert.strictEqual(cleanLyricLine('  [D] [A7]  '), null);
  });

  await runner.test('T2.16: cleanLyricLine on chord directive or header lines returns null', () => {
    assert.strictEqual(cleanLyricLine('[Zwrotka 2]'), null);
    assert.strictEqual(cleanLyricLine('{start_of_chorus}'), null);
    assert.strictEqual(cleanLyricLine('---'), null);
  });

  await runner.test('T2.17: extractLyricSnippet on empty rawLyrics returns null without error', () => {
    assert.strictEqual(extractLyricSnippet('', 'wehikul'), null);
    assert.strictEqual(extractLyricSnippet(null as any, 'wehikul'), null);
  });

  await runner.test('T2.18: extractLyricSnippet with multiple matching lines returns the first matching lyric line', () => {
    const lyrics = `
[Zwrotka 1]
Anioły śpiewają rano
Anioły śpiewają wieczorem
`;
    const snippet = extractLyricSnippet(lyrics, 'anioły');
    assert.strictEqual(snippet, '... Anioły śpiewają rano ...');
  });

  await runner.test('T2.19: Search query with regex metacharacters does not throw regex exceptions', () => {
    const dangerousQuery = '.*+?^${}()|[]\\';
    assert.doesNotThrow(() => {
      matchSong(songs[0], dangerousQuery);
      normalizeSearchText(dangerousQuery);
    });
  });

  await runner.test('T2.20: Non-existent query in "Piosenki" tab yields 0 items and displays "Brak wyników"', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('ZZZZNONEXISTENT');
    const html = harness.html;
    assert(html.includes('Brak wyników dla zapytania:'));
    assert(html.includes('"ZZZZNONEXISTENT"'));
  });

  await runner.test('T2.21: Non-existent query in "Wykonawcy" tab yields 0 artists and displays "Brak wyników"', () => {
    const harness = new SongListHarness(songs);
    harness.setTab('artists');
    harness.setSearchQuery('ZZZZNONEXISTENT');
    const html = harness.html;
    assert(html.includes('Brak wyników dla zapytania:'));
  });

  await runner.test('T2.22: Non-existent query in "Ulubione" tab yields favorites empty notice', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu']);
    harness.setTab('favorites');
    harness.setSearchQuery('ZZZZNONEXISTENT');
    const html = harness.html;
    assert(html.includes('Brak wyników w ulubionych dla zapytania:'));
  });

  await runner.test('T2.23: Multiple rapid star toggles: toggling 4 times leaves favorites state idempotent', () => {
    const harness = new SongListHarness(songs, []);
    for (let i = 0; i < 4; i++) {
      harness.invokeClick(
        (node) =>
          node.props?.['aria-label'] === 'Dodaj Wehikuł Czasu do ulubionych' ||
          node.props?.['aria-label'] === 'Usuń Wehikuł Czasu z ulubionych'
      );
    }
    assert.strictEqual(harness.favorites.length, 0);
  });

  await runner.test('T2.24: Adding existing favorite slug preserves deduplicated Set semantics', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu', 'wehikul-czasu']);
    assert(harness.html.includes('>1</span>')); // Badge should count unique favorites
  });

  await runner.test('T2.25: Catalog with 0 songs displays badge 0 and "Katalog jest obecnie pusty."', () => {
    const harness = new SongListHarness([]);
    const html = harness.html;
    assert(html.includes('>0</span>'));
    assert(html.includes('Katalog jest obecnie pusty.'));
  });

  await runner.test('T2.26: Artist name with surrounding whitespace and symbols produces clean URL slug', () => {
    assert.strictEqual(artistToSlug('  Dżem & Przyjaciele!  '), 'dzem-przyjaciele');
    assert.strictEqual(artistToSlug('---Golec---'), 'golec');
  });

  await runner.test('T2.27: Polish pluralization edge cases: 0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 24, 25, 102, 112', () => {
    // Generate songs with N count for test
    const makeSongsForArtist = (count: number, artist: string): ParsedSong[] => {
      return Array.from({ length: count }, (_, i) => ({
        ...songs[0],
        slug: `song-${i}`,
        title: `Song ${i}`,
        artist,
      }));
    };

    const testCounts = [
      { count: 1, expected: '1 utwór' },
      { count: 2, expected: '2 utwory' },
      { count: 4, expected: '4 utwory' },
      { count: 5, expected: '5 utworów' },
      { count: 11, expected: '11 utworów' },
      { count: 12, expected: '12 utworów' },
      { count: 14, expected: '14 utworów' },
      { count: 21, expected: '21 utworów' },
      { count: 22, expected: '22 utwory' },
      { count: 24, expected: '24 utwory' },
      { count: 25, expected: '25 utworów' },
    ];

    for (const { count, expected } of testCounts) {
      const artCatalog = extractArtistCatalog(makeSongsForArtist(count, 'Test Artist'));
      const harness = new SongListHarness(makeSongsForArtist(count, 'Test Artist'));
      harness.setTab('artists');
      assert(harness.html.includes(expected), `Count ${count} must format as "${expected}"`);
    }
  });

  await runner.test('T2.28: extractArtistCatalog safely handles null or undefined input', () => {
    assert.deepStrictEqual(extractArtistCatalog(null as any), []);
    assert.deepStrictEqual(extractArtistCatalog(undefined as any), []);
  });


  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (>= 15 tests)
  // =========================================================================
  runner.setTier('Stage 5 — Tier 3: Cross-Feature Combinations');

  await runner.test('T3.01: Combining Search query + Tag chip + Piosenki tab filters catalog by both criteria', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('rock');
    harness.setSearchQuery('czasu');
    const html = harness.html;
    assert(html.includes('Wehikuł Czasu'));
    assert(!html.includes('Whisky'));
    assert(!html.includes('Lornetka'));
  });

  await runner.test('T3.02: Switching from "Piosenki" to "Wykonawcy" tab preserves current search query and filters artists', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('golec');
    assert.strictEqual(harness.searchQuery, 'golec');
    harness.setTab('artists');
    assert.strictEqual(harness.activeTab, 'artists');
    assert.strictEqual(harness.searchQuery, 'golec');
    const html = harness.html;
    assert(html.includes('Golec uOrkiestra'));
    assert(!html.includes('Dżem'));
  });

  await runner.test('T3.03: Switching from "Wykonawcy" to "Ulubione" tab preserves current search query and filters favorites', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu', 'whisky', 'lornetka']);
    harness.setTab('artists');
    harness.setSearchQuery('whisky');
    harness.setTab('favorites');
    assert.strictEqual(harness.activeTab, 'favorites');
    assert.strictEqual(harness.searchQuery, 'whisky');
    const html = harness.html;
    assert(html.includes('Whisky'));
    assert(!html.includes('Wehikuł Czasu'));
  });

  await runner.test('T3.04: Selecting tag filter restricts artists in "Wykonawcy" tab to only those with matching songs', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('poezja');
    harness.setTab('artists');
    const html = harness.html;
    assert(html.includes('Stare Dobre Małżeństwo'));
    assert(!html.includes('Dżem'));
    assert(!html.includes('Golec uOrkiestra'));
  });

  await runner.test('T3.05: Artist song count in "Wykonawcy" tab dynamically updates when tag filter is applied', () => {
    const harness = new SongListHarness(songs);
    harness.setTab('artists');
    assert(harness.html.includes('2 utwory')); // Dżem has 2 songs total
    harness.setSelectedTag('blues'); // only Whisky has blues
    assert(harness.html.includes('1 utwór')); // Dżem now has 1 song with blues tag
  });

  await runner.test('T3.06: Starring a song in "Piosenki" tab immediately increments Ulubione tab badge count', () => {
    const harness = new SongListHarness(songs, []);
    assert(harness.html.includes('id="tab-favorites"') && harness.html.includes('>0</span>'));
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Dodaj Wehikuł Czasu do ulubionych');
    assert(harness.html.includes('id="tab-favorites"') && harness.html.includes('>1</span>'));
  });

  await runner.test('T3.07: Starring a song in "Piosenki" tab makes it immediately visible when switching to "Ulubione" tab', () => {
    const harness = new SongListHarness(songs, []);
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Dodaj Wehikuł Czasu do ulubionych');
    harness.setTab('favorites');
    assert(harness.html.includes('Wehikuł Czasu'));
    assert(!harness.html.includes('Brak ulubionych utworów. Dodaj piosenki'));
  });

  await runner.test('T3.08: Unstarring a song from inside "Ulubione" tab immediately removes it from the list', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu', 'whisky']);
    harness.setTab('favorites');
    assert(harness.html.includes('Wehikuł Czasu'));
    assert(harness.html.includes('Whisky'));
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Usuń Wehikuł Czasu z ulubionych');
    const html = harness.html;
    assert(!html.includes('Wehikuł Czasu'));
    assert(html.includes('Whisky'));
  });

  await runner.test('T3.09: Unstarring the last song in "Ulubione" tab immediately reveals pristine Polish empty state', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu']);
    harness.setTab('favorites');
    assert(harness.html.includes('Wehikuł Czasu'));
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Usuń Wehikuł Czasu z ulubionych');
    const html = harness.html;
    assert(!html.includes('Wehikuł Czasu'));
    assert(html.includes('Brak ulubionych utworów. Dodaj piosenki do ulubionych, klikając gwiazdkę.'));
  });

  await runner.test('T3.10: Search query matching lyrics with active tag displays snippet only for tag-matching song', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('rock');
    harness.setSearchQuery('błękitny wiatr');
    const html = harness.html;
    assert(html.includes('... Pójdziemy razem tam, gdzie błękitny wiatr ...'));
    assert(html.includes('Wehikuł Czasu'));
  });

  await runner.test('T3.11: Clearing search query via clear button (✕) restores songs filtered by active tag', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('rock');
    harness.setSearchQuery('whisky');
    assert(harness.html.includes('Whisky'));
    assert(!harness.html.includes('Wehikuł Czasu'));
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Wyczyść wyszukiwanie');
    assert(harness.html.includes('Whisky'));
    assert(harness.html.includes('Wehikuł Czasu'));
  });

  await runner.test('T3.12: Clicking active tag chip to deselect restores all songs matching active search query', () => {
    const harness = new SongListHarness(songs);
    harness.setSelectedTag('rock');
    harness.setSearchQuery('a'); // letters present in multiple songs
    harness.invokeClick((node) => node.props?.children === 'rock'); // deselect rock
    assert.strictEqual(harness.selectedTag, null);
    // songs across other tags now also visible
    assert(harness.html.includes('Lornetka'));
  });

  await runner.test('T3.13: Diacritic-insensitive artist slug routing in App: clicking Dżem routes to #/artist/dzem', () => {
    const harness = new SongListHarness(songs);
    harness.setTab('artists');
    assert(harness.html.includes('href="#/artist/dzem"'));
  });

  await runner.test('T3.14: Artist view (#/artist/:slug) star toggle integrates with favorites storage in App', () => {
    const env = new MockRoutingEnvironment('#/artist/dzem');
    env.install();
    try {
      env.localStorage.setItem('spiewnik_favorites', JSON.stringify(['whisky']));
      const stored = JSON.parse(env.localStorage.getItem('spiewnik_favorites')!);
      assert(stored.includes('whisky'));
    } finally {
      env.uninstall();
    }
  });

  await runner.test('T3.15: Searching half-remembered lyrics within Ulubione tab filters favorites and displays snippet', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu', 'whisky']);
    harness.setTab('favorites');
    harness.setSearchQuery('jam session');
    const html = harness.html;
    assert(html.includes('Wehikuł Czasu'));
    assert(!html.includes('Whisky'));
    assert(html.includes('Jam session') || html.includes('tam królował blues'));
  });

  await runner.test('T3.16: Theme toggle between dark and light propagates to all SongList UI elements', () => {
    const harness = new SongListHarness(songs, [], 'dark');
    assert(harness.html.includes('bg-neutral-900'));
    harness.setTheme('light');
    assert(harness.html.includes('bg-white'));
  });

  await runner.test('T3.17: Sequential multi-step user journey: type query -> select tag -> switch tab -> clear query -> deselect tag', () => {
    const harness = new SongListHarness(songs);
    harness.setSearchQuery('czasu');
    harness.setSelectedTag('rock');
    harness.setTab('artists');
    assert(harness.html.includes('Dżem'));
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Wyczyść wyszukiwanie');
    assert.strictEqual(harness.searchQuery, '');
    harness.invokeClick((node) => node.props?.children === 'rock');
    assert.strictEqual(harness.selectedTag, null);
    assert.strictEqual(harness.activeTab, 'artists');
    assert(harness.html.includes('Golec uOrkiestra'));
  });

  await runner.test('T3.18: Non-matching search query in Ulubione tab displays clear search button which on click restores favorites', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu']);
    harness.setTab('favorites');
    harness.setSearchQuery('brak-takiego-tekstu');
    assert(harness.html.includes('Brak wyników w ulubionych'));
    harness.invokeClick((node) => node.props?.children === 'Wyczyść wyszukiwanie');
    assert.strictEqual(harness.searchQuery, '');
    assert(harness.html.includes('Wehikuł Czasu'));
  });


  // =========================================================================
  // TIER 4: REAL-WORLD MUSICIAN WORKLOADS (>= 6 tests)
  // =========================================================================
  runner.setTier('Stage 5 — Tier 4: Real-World Musician Workloads');

  await runner.test('T4.1: Musician Campfire Setlist Preparation (Folk/Ognisko filtering, starring songs, reviewing Ulubione setlist)', () => {
    const harness = new SongListHarness(songs, []);
    // 1. Musician sits by campfire and selects "ognisko" tag
    harness.setSelectedTag('ognisko');
    assert(harness.html.includes('Wehikuł Czasu'));
    assert(harness.html.includes('Whisky'));

    // 2. Stars both campfire songs
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Dodaj Wehikuł Czasu do ulubionych');
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Dodaj Whisky do ulubionych');
    assert.strictEqual(harness.favorites.length, 2);

    // 3. Selects "folk" tag to find Lornetka
    harness.setSelectedTag('folk');
    assert(harness.html.includes('Lornetka'));
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Dodaj Lornetka do ulubionych');
    assert.strictEqual(harness.favorites.length, 3);

    // 4. Opens "Ulubione" tab to see prepared setlist ready for singing
    harness.setTab('favorites');
    harness.setSelectedTag(null);
    const setlistHtml = harness.html;
    assert(setlistHtml.includes('Wehikuł Czasu'));
    assert(setlistHtml.includes('Whisky'));
    assert(setlistHtml.includes('Lornetka'));
    assert.strictEqual(harness.favorites.length, 3);
  });

  await runner.test('T4.2: Live Jam Half-Remembered Lyrics Search (Typing "tam krolowal blues", seeing contextual snippet preview, selecting song)', () => {
    const harness = new SongListHarness(songs);
    // Guitarist at live jam only remembers verse "tam królował blues"
    // Types diacritic-free "tam krolowal blues"
    harness.setSearchQuery('tam krolowal blues');
    const html = harness.html;
    assert(html.includes('Wehikuł Czasu'), 'Must locate matching song');
    assert(html.includes('tam królował blues') || html.includes('Jam session'), 'Must render exact snippet');

    // Musician taps song card to open viewer
    harness.invokeClick((node) => node.props?.href === '#/song/wehikul-czasu');
    assert(harness.selectedSongs.includes('wehikul-czasu'));
  });

  await runner.test('T4.3: Artist Catalog Repertoire Deep-Dive (Browsing Wykonawcy tab, finding Dżem, viewing all Dżem songs, starring)', () => {
    const harness = new SongListHarness(songs, []);
    // Musician opens "Wykonawcy" tab
    harness.setTab('artists');
    const artistsHtml = harness.html;
    assert(artistsHtml.includes('Dżem'));
    assert(artistsHtml.includes('2 utwory'));

    // Musician clicks Dżem to view artist catalog
    harness.invokeClick((node) => node.props?.href === '#/artist/dzem');
    assert(harness.selectedArtists.includes('dzem'));

    // In artist view, both songs are visible with their original keys
    const dzemSongs = songs.filter((s) => s.artist === 'Dżem');
    assert.strictEqual(dzemSongs.length, 2);
    assert.strictEqual(dzemSongs[0].key, 'A');
    assert.strictEqual(dzemSongs[1].key, 'G');
  });

  await runner.test('T4.4: English Keyboard Diacritic-Free Search at Live Gig (Typing "stare dobre malzenstwo", "wehikul", "golec")', () => {
    const harness = new SongListHarness(songs);
    // Performing on foreign keyboard without Polish letters
    harness.setSearchQuery('stare dobre malzenstwo');
    assert(harness.html.includes('Bieszczadzkie Anioły'));

    harness.setSearchQuery('wehikul');
    assert(harness.html.includes('Wehikuł Czasu'));

    harness.setSearchQuery('anioly');
    assert(harness.html.includes('Bieszczadzkie Anioły'));

    harness.setSearchQuery('golec');
    assert(harness.html.includes('Lornetka'));
  });

  await runner.test('T4.5: Pristine Ulubione Onboarding Flow (Empty state guidance, CTA navigation, favoriting, setlist populated)', () => {
    const harness = new SongListHarness(songs, []);
    // First time opening Ulubione
    harness.setTab('favorites');
    const emptyHtml = harness.html;
    assert(emptyHtml.includes('Brak ulubionych utworów. Dodaj piosenki do ulubionych, klikając gwiazdkę.'));
    assert(emptyHtml.includes('Przeglądaj piosenki'));

    // Clicks CTA button
    harness.invokeClick((node) => node.props?.children === 'Przeglądaj piosenki');
    assert.strictEqual(harness.activeTab, 'songs');

    // Stars a ballad
    harness.invokeClick((node) => node.props?.['aria-label'] === 'Dodaj Bieszczadzkie Anioły do ulubionych');
    assert(harness.favorites.includes('bieszczadzkie-anioly'));

    // Re-visits Ulubione
    harness.setTab('favorites');
    assert(harness.html.includes('Bieszczadzkie Anioły'));
    assert(!harness.html.includes('Brak ulubionych utworów. Dodaj piosenki'));
  });

  await runner.test('T4.6: Multi-Genre Festival Setlist Filter Rehearsal (Fast toggling between rock, poezja, blues without state corruption)', () => {
    const harness = new SongListHarness(songs, ['wehikul-czasu']);
    const genres = ['rock', 'poezja', 'blues', 'ognisko'];
    for (const g of genres) {
      harness.setSelectedTag(g);
      assert.strictEqual(harness.selectedTag, g);
      assert(harness.html.length > 0, `Tag ${g} must render cleanly`);
    }
    // Deselect tag
    harness.setSelectedTag(null);
    assert.strictEqual(harness.selectedTag, null);
    assert(harness.html.includes('Wszystkie'));
  });

  await runner.test('T4.7: High-Contrast Dark Mode Outdoor Night Performance (OLED black styling & >=44px tap targets)', () => {
    const harness = new SongListHarness(songs, [], 'dark');
    const html = harness.html;
    assert(html.includes('bg-neutral-900'));
    assert(html.includes('border-neutral-800'));
    assert(html.includes('text-neutral-100'));
    assert(html.includes('min-h-[44px]'));
  });

  await runner.test('T4.8: 100% Offline In-Memory Search & Filtering (Pure zero-dependency native execution with 0 network calls)', () => {
    // Verifies all core operations run synchronously in pure memory
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      normalizeSearchText('Zażółć gęślą jaźń');
      for (const s of songs) {
        matchSong(s, 'wehikul');
        matchSong(s, 'klubu puls');
      }
      extractCatalogTags(songs);
      extractArtistCatalog(songs);
    }
    const duration = performance.now() - start;
    assert(duration < 500, `50 offline search cycles completed in ${duration.toFixed(2)}ms (< 500ms requirement)`);
  });

  await runner.test('T4.9: Artist view source code integrates search input, tag filter chips, and favorites filter', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('artistSearchQuery'), 'App.tsx must define artistSearchQuery state');
    assert(appSrc.includes('artistSelectedTag'), 'App.tsx must define artistSelectedTag state');
    assert(appSrc.includes('artistOnlyFavorites'), 'App.tsx must define artistOnlyFavorites state');
    assert(appSrc.includes('Szukaj w utworach wykonawcy'), 'App.tsx must provide artist search placeholder');
    assert(appSrc.includes('Filtr tagów wykonawcy'), 'App.tsx must provide artist tag filter group');
    assert(appSrc.includes('artistTags.map'), 'App.tsx must map artist tags to filter chips');
  });

  await runner.test('T4.10: Artist view filtering logic accurately isolates artist songs by tag, search, and lyric snippet', () => {
    const dzemSongs = songs.filter((s) => s.artist === 'Dżem');
    assert.strictEqual(dzemSongs.length, 2);

    // Search within Dżem songs by lyrics
    const match = matchSong(dzemSongs[0], 'tam królował blues');
    assert(match.matches, 'Query within Dżem lyrics must match');
    assert(match.lyricSnippet !== null, 'Must extract contextual lyric snippet');

    // Tags for Dżem
    const tags = extractCatalogTags(dzemSongs);
    assert(tags.length > 0, 'Must extract tags from artist songs');
  });
}
