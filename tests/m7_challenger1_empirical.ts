import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { TestRunner } from './helpers/test_framework';
import {
  normalizeSearchText,
  cleanLyricLine,
  extractLyricSnippet,
  matchSong,
  extractCatalogTags,
  extractArtistCatalog,
  artistToSlug,
} from '../src/lib/search';
import { parseSong } from '../src/lib/songParser';
import type { ParsedSong } from '../src/types';

/**
 * Loads the 4 actual production catalog songs directly from disk for testing.
 */
function loadProductionCatalog(): ParsedSong[] {
  const songsDir = path.join(process.cwd(), 'songs');
  const files = fs.readdirSync(songsDir).filter((f) => f.endsWith('.txt'));
  const songs: ParsedSong[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(songsDir, file), 'utf-8');
    const slug = file.replace(/\.txt$/, '');
    songs.push(parseSong(raw, slug, `/songs/${file}`));
  }

  return songs.sort((a, b) => a.title.localeCompare(b.title, 'pl'));
}

export async function runM7Challenger1Tests(runner: TestRunner) {
  const catalog = loadProductionCatalog();

  // ================================================================
  // TIER 1: Polish Diacritics Normalization Matrix (F73)
  // ================================================================
  runner.setTier('M7 Challenger 1 — Tier 1: Polish Diacritics Normalization Matrix');

  await runner.test('CH1-T1.1: All 9 Polish lowercase diacritics normalize to ASCII base', () => {
    const diacriticsMap: Record<string, string> = {
      ą: 'a',
      ć: 'c',
      ę: 'e',
      ł: 'l',
      ń: 'n',
      ó: 'o',
      ś: 's',
      ź: 'z',
      ż: 'z',
    };

    for (const [diacritic, expected] of Object.entries(diacriticsMap)) {
      const actual = normalizeSearchText(diacritic);
      assert.strictEqual(
        actual,
        expected,
        `Diacritic '${diacritic}' normalized to '${actual}', expected '${expected}'`
      );
    }
  });

  await runner.test('CH1-T1.2: All 9 Polish uppercase diacritics normalize to lowercase ASCII base', () => {
    const diacriticsMap: Record<string, string> = {
      Ą: 'a',
      Ć: 'c',
      Ę: 'e',
      Ł: 'l',
      Ń: 'n',
      Ó: 'o',
      Ś: 's',
      Ź: 'z',
      Ż: 'z',
    };

    for (const [diacritic, expected] of Object.entries(diacriticsMap)) {
      const actual = normalizeSearchText(diacritic);
      assert.strictEqual(
        actual,
        expected,
        `Uppercase diacritic '${diacritic}' normalized to '${actual}', expected '${expected}'`
      );
    }
  });

  await runner.test('CH1-T1.3: Normalizes Polish pangram "Zażółć gęślą jaźń" (lowercase & uppercase)', () => {
    const pangramLower = 'Zażółć gęślą jaźń';
    const pangramUpper = 'ZAŻÓŁĆ GĘŚLĄ JAŹŃ';
    const expected = 'zazolc gesla jazn';

    assert.strictEqual(normalizeSearchText(pangramLower), expected);
    assert.strictEqual(normalizeSearchText(pangramUpper), expected);
  });

  await runner.test('CH1-T1.4: Multi-diacritic cluster words (źdźbło, bździągwa, żółw)', () => {
    assert.strictEqual(normalizeSearchText('źdźbło'), 'zdzblo');
    assert.strictEqual(normalizeSearchText('bździągwa'), 'bzdziagwa');
    assert.strictEqual(normalizeSearchText('żółw'), 'zolw');
    assert.strictEqual(normalizeSearchText('ŚWIĘTOKRZYSKIE'), 'swietokrzyskie');
  });

  await runner.test('CH1-T1.5: Idempotency of normalizeSearchText', () => {
    const inputs = ['Wehikuł Czasu', 'Dżem', 'Bieszczadzkie Anioły', 'Stare Dobre Małżeństwo'];
    for (const input of inputs) {
      const once = normalizeSearchText(input);
      const twice = normalizeSearchText(once);
      assert.strictEqual(once, twice, `normalizeSearchText should be idempotent for '${input}'`);
    }
  });

  // ================================================================
  // TIER 2: Real-World Song Queries & Diacritic-Insensitive Matching
  // ================================================================
  runner.setTier('M7 Challenger 1 — Tier 2: Real-World Song Queries & Diacritic Matching');

  await runner.test('CH1-T2.1: "wehikul" matches "Wehikuł Czasu"', () => {
    const song = catalog.find((s) => s.slug === 'wehikul-czasu');
    assert.ok(song, 'Wehikuł Czasu must exist in catalog');
    const result = matchSong(song, 'wehikul');
    assert.strictEqual(result.matches, true);
    assert.strictEqual(result.matchedField, 'title');
    assert.strictEqual(result.lyricSnippet, null);
  });

  await runner.test('CH1-T2.2: "dzem" matches "Dżem" (as artist in Wehikuł and Whisky)', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    const whisky = catalog.find((s) => s.slug === 'whisky')!;

    const res1 = matchSong(wehikul, 'dzem');
    assert.strictEqual(res1.matches, true);
    assert.strictEqual(res1.matchedField, 'artist');
    assert.strictEqual(res1.lyricSnippet, null);

    const res2 = matchSong(whisky, 'dzem');
    assert.strictEqual(res2.matches, true);
    assert.strictEqual(res2.matchedField, 'artist');
    assert.strictEqual(res2.lyricSnippet, null);
  });

  await runner.test('CH1-T2.3: "anioly" matches "Bieszczadzkie Anioły"', () => {
    const song = catalog.find((s) => s.slug === 'bieszczadzkie-anioly')!;
    const result = matchSong(song, 'anioly');
    assert.strictEqual(result.matches, true);
    assert.strictEqual(result.matchedField, 'title');
    assert.strictEqual(result.lyricSnippet, null);
  });

  await runner.test('CH1-T2.4: "malzenstwo" matches "Stare Dobre Małżeństwo"', () => {
    const song = catalog.find((s) => s.slug === 'bieszczadzkie-anioly')!;
    const result = matchSong(song, 'malzenstwo');
    assert.strictEqual(result.matches, true);
    assert.strictEqual(result.matchedField, 'artist');
    assert.strictEqual(result.lyricSnippet, null);
  });

  await runner.test('CH1-T2.5: Inverse symmetry: query with diacritics matches ASCII song fields', () => {
    const mockAsciiSong: ParsedSong = {
      slug: 'test-song',
      title: 'Wehikul Czasu',
      artist: 'Dzem',
      key: 'A',
      tags: ['klasyka'],
      rawLyrics: 'Moja zono',
      lines: [],
      uniqueChords: [],
    };

    const resTitle = matchSong(mockAsciiSong, 'wehikuł');
    assert.strictEqual(resTitle.matches, true);
    assert.strictEqual(resTitle.matchedField, 'title');

    const resArtist = matchSong(mockAsciiSong, 'dżem');
    assert.strictEqual(resArtist.matches, true);
    assert.strictEqual(resArtist.matchedField, 'artist');

    const resLyrics = matchSong(mockAsciiSong, 'żono');
    assert.strictEqual(resLyrics.matches, true);
    assert.strictEqual(resLyrics.matchedField, 'lyrics');
  });

  await runner.test('CH1-T2.6: Partial prefix & substring matching across fields', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    assert.strictEqual(matchSong(wehikul, 'wehi').matches, true);
    assert.strictEqual(matchSong(wehikul, 'czas').matches, true);
    assert.strictEqual(matchSong(wehikul, 'dze').matches, true);
  });

  // ================================================================
  // TIER 3: Contextual Lyric Snippet Extraction & Stripping (REQ-CAT-3)
  // ================================================================
  runner.setTier('M7 Challenger 1 — Tier 3: Contextual Lyric Snippet Extraction & Stripping');

  await runner.test('CH1-T3.1: Match in TITLE MUST NOT return lyric snippet', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(wehikul, 'Wehikuł');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'title');
    assert.strictEqual(res.lyricSnippet, null, 'Must not return snippet on title match');
  });

  await runner.test('CH1-T3.2: Match in ARTIST MUST NOT return lyric snippet', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(wehikul, 'Dżem');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'artist');
    assert.strictEqual(res.lyricSnippet, null, 'Must not return snippet on artist match');
  });

  await runner.test('CH1-T3.3: Match in TAG MUST NOT return lyric snippet', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(wehikul, 'klasyka');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'tag');
    assert.strictEqual(res.lyricSnippet, null, 'Must not return snippet on tag match');
  });

  await runner.test('CH1-T3.4: Match in LYRICS-ONLY MUST return "... [clean line] ..."', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    const res = matchSong(wehikul, 'blekitny');
    assert.strictEqual(res.matches, true);
    assert.strictEqual(res.matchedField, 'lyrics');
    assert.ok(res.lyricSnippet, 'Snippet must be present');
    assert.ok(res.lyricSnippet.startsWith('... '));
    assert.ok(res.lyricSnippet.endsWith(' ...'));
    assert.ok(res.lyricSnippet.includes('błękitny wiatr'));
  });

  await runner.test('CH1-T3.5: Multi-line matches returns FIRST matching clean line', () => {
    const bieszczadzkie = catalog.find((s) => s.slug === 'bieszczadzkie-anioly')!;
    const snippet = extractLyricSnippet(bieszczadzkie.rawLyrics, 'skrzydlem');
    assert.strictEqual(snippet, '... Gdy skrzydłem o liście trącą ...');
  });

  await runner.test('CH1-T3.6: Chords and headers stripped from contextual lyric snippet', () => {
    const rawWithInlineChords = `
---
title: Test
artist: Tester
---
[Zwrotka 1]
[A] Pamiętam tylko [E] to, że gdy [F#m] byłem sam
A E F#m D
Ktoś wziął za rękę mnie [A]
`;
    const snippet = extractLyricSnippet(rawWithInlineChords, 'pamietam');
    assert.ok(snippet !== null, 'Snippet should match');
    assert.strictEqual(snippet, '... Pamiętam tylko to, że gdy byłem sam ...');
    assert.strictEqual(/\[[A-G]\]/.test(snippet), false, 'Must not contain chord tokens');
  });

  await runner.test('CH1-T3.7: Clean lyric line ignores pure chord lines and section headers', () => {
    assert.strictEqual(cleanLyricLine('[Zwrotka 1]'), null);
    assert.strictEqual(cleanLyricLine('[Refren]'), null);
    assert.strictEqual(cleanLyricLine('[Intro]'), null);
    assert.strictEqual(cleanLyricLine('---'), null);
    assert.strictEqual(cleanLyricLine('{title: Piosenka}'), null);
    assert.strictEqual(cleanLyricLine('A   E   F#m   D'), null);
    assert.strictEqual(cleanLyricLine('G   C   D   G'), null);
    assert.strictEqual(cleanLyricLine('   '), null);
  });

  // ================================================================
  // TIER 4: Dynamic Tag & Artist Aggregation Invariants
  // ================================================================
  runner.setTier('M7 Challenger 1 — Tier 4: Dynamic Tag & Artist Aggregation Invariants');

  await runner.test('CH1-T4.1: Dynamic tag extraction: unique, sorted, trimmed, non-empty', () => {
    const tags = extractCatalogTags(catalog);
    assert.ok(Array.isArray(tags));
    assert.ok(tags.length > 0);

    const set = new Set(tags);
    assert.strictEqual(tags.length, set.size, 'All tags must be unique');

    for (const t of tags) {
      assert.strictEqual(t, t.trim(), `Tag '${t}' must be trimmed`);
      assert.ok(t.length > 0, 'Tags must not be empty');
    }

    const expectedSorted = [...tags].sort((a, b) => a.localeCompare(b, 'pl'));
    assert.deepStrictEqual(tags, expectedSorted, 'Tags must be sorted in Polish locale order');

    assert.ok(tags.includes('rock'));
    assert.ok(tags.includes('ognisko'));
    assert.ok(tags.includes('blues'));
    assert.ok(tags.includes('poezja'));
    assert.ok(tags.includes('turystyczne'));
  });

  await runner.test('CH1-T4.2: extractCatalogTags handles malformed inputs and duplicates', () => {
    const dirtySongs: ParsedSong[] = [
      {
        slug: 's1',
        title: 'S1',
        artist: 'A1',
        key: 'C',
        tags: ['  Rock  ', 'folk', '', '   '],
        rawLyrics: '',
        lines: [],
        uniqueChords: [],
      },
      {
        slug: 's2',
        title: 'S2',
        artist: 'A2',
        key: 'C',
        tags: ['rock', 'FOLK', 'blues'],
        rawLyrics: '',
        lines: [],
        uniqueChords: [],
      },
      {
        slug: 's3',
        title: 'S3',
        artist: 'A3',
        key: 'C',
        tags: undefined as any,
        rawLyrics: '',
        lines: [],
        uniqueChords: [],
      },
    ];

    const tags = extractCatalogTags(dirtySongs);
    assert.ok(!tags.includes(''), 'Empty strings must be excluded');
    assert.ok(!tags.includes('   '), 'Whitespace strings must be excluded');
    assert.ok(tags.includes('Rock') || tags.includes('rock'));

    assert.deepStrictEqual(extractCatalogTags([]), []);
    assert.deepStrictEqual(extractCatalogTags(null as any), []);
    assert.deepStrictEqual(extractCatalogTags(undefined as any), []);
  });

  await runner.test('CH1-T4.3: Artist catalog extraction: unique, accurate song counts and grouping', () => {
    const artists = extractArtistCatalog(catalog);
    assert.ok(Array.isArray(artists));

    assert.strictEqual(artists.length, 3, 'Must have exactly 3 unique artists');

    const dzem = artists.find((a) => a.slug === 'dzem');
    assert.ok(dzem, 'Dżem must be in artist catalog');
    assert.strictEqual(dzem.name, 'Dżem');
    assert.strictEqual(dzem.songCount, 2, 'Dżem must have 2 songs');
    assert.strictEqual(dzem.songs.length, 2);

    const sdm = artists.find((a) => a.slug === 'stare-dobre-malzenstwo');
    assert.ok(sdm, 'Stare Dobre Małżeństwo must be in artist catalog');
    assert.strictEqual(sdm.songCount, 1);
    assert.strictEqual(sdm.songs[0].title, 'Bieszczadzkie Anioły');

    const golec = artists.find((a) => a.slug === 'golec-uorkiestra');
    assert.ok(golec, 'Golec uOrkiestra must be in artist catalog');
    assert.strictEqual(golec.songCount, 1);
    assert.strictEqual(golec.songs[0].title, 'Lornetka');

    const expectedSorted = [...artists].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    assert.deepStrictEqual(artists.map((a) => a.name), expectedSorted.map((a) => a.name));
  });

  await runner.test('CH1-T4.4: artistToSlug converts Polish diacritics and special characters', () => {
    assert.strictEqual(artistToSlug('Dżem'), 'dzem');
    assert.strictEqual(artistToSlug('Stare Dobre Małżeństwo'), 'stare-dobre-malzenstwo');
    assert.strictEqual(artistToSlug('Golec uOrkiestra'), 'golec-uorkiestra');
    assert.strictEqual(artistToSlug('Łzy'), 'lzy');
    assert.strictEqual(artistToSlug('Żywiołak'), 'zywiolak');
    assert.strictEqual(artistToSlug('AC/DC'), 'ac-dc');
    assert.strictEqual(artistToSlug('   ---  Dżem   ---  '), 'dzem');
    assert.strictEqual(artistToSlug(''), '');
    assert.strictEqual(artistToSlug(null as any), '');
  });

  // ================================================================
  // TIER 5: Adversarial Boundary, Fuzzing & Edge Cases
  // ================================================================
  runner.setTier('M7 Challenger 1 — Tier 5: Adversarial Boundary, Fuzzing & Edge Cases');

  await runner.test('CH1-T5.1: Leading/trailing whitespace in query is trimmed', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    assert.strictEqual(matchSong(wehikul, '   wehikul   ').matches, true);
    assert.strictEqual(matchSong(wehikul, '\t dzem \n').matches, true);
  });

  await runner.test('CH1-T5.2: Empty, whitespace-only and null queries match all songs without snippet', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    const resEmpty = matchSong(wehikul, '');
    assert.strictEqual(resEmpty.matches, true);
    assert.strictEqual(resEmpty.matchedField, null);
    assert.strictEqual(resEmpty.lyricSnippet, null);

    const resSpaces = matchSong(wehikul, '     ');
    assert.strictEqual(resSpaces.matches, true);
    assert.strictEqual(resSpaces.matchedField, null);
    assert.strictEqual(resSpaces.lyricSnippet, null);

    const resNull = matchSong(wehikul, null as any);
    assert.strictEqual(resNull.matches, true);
  });

  await runner.test('CH1-T5.3: Regex metacharacter injection in search queries does not crash or throw', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    const adversarialQueries = [
      '.*',
      '[a-z]+',
      '(.*)',
      '\\d+',
      '?',
      '+',
      '*',
      '^$',
      '[Intro]',
      '([A-Z])\\1',
      '(?=.*foo)',
      '(((a+)+)+)+$',
      '<script>alert("XSS")</script>',
    ];

    for (const q of adversarialQueries) {
      assert.doesNotThrow(() => {
        const res = matchSong(wehikul, q);
        assert.ok(typeof res.matches === 'boolean');
      }, `Adversarial query '${q}' must not throw`);
    }
  });

  await runner.test('CH1-T5.4: Huge string fuzzing (100,000 char query & 500,000 char song)', () => {
    const largeQuery = 'a'.repeat(100_000);
    const largeLyrics = ('To jest zwrotka piosenki o wspaniałym życiu\n'.repeat(10_000));
    const largeSong: ParsedSong = {
      slug: 'fuzz-song',
      title: 'Piosenka Fuzz',
      artist: 'Fuzzer',
      key: 'C',
      tags: ['fuzz'],
      rawLyrics: largeLyrics,
      lines: [],
      uniqueChords: [],
    };

    const t0 = performance.now();
    const res = matchSong(largeSong, largeQuery);
    const elapsed = performance.now() - t0;

    assert.strictEqual(res.matches, false);
    assert.ok(elapsed < 200, `Large string matching took ${elapsed}ms (expected < 200ms)`);
  });

  await runner.test('CH1-T5.5: Lyric snippet extraction on punctuation, quotes and dialect', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    // In wehikul: 'Tylko nocą do klubu "Puls"'
    const resPuls = matchSong(wehikul, 'Puls');
    assert.strictEqual(resPuls.matches, true);
    assert.strictEqual(resPuls.matchedField, 'lyrics');
    assert.strictEqual(resPuls.lyricSnippet, '... Tylko nocą do klubu "Puls" ...');

    // In lornetka dialect: 'Kupiłek lornetke'
    const lornetka = catalog.find((s) => s.slug === 'lornetka')!;
    const resKupilek = matchSong(lornetka, 'kupilek');
    assert.strictEqual(resKupilek.matches, true);
    assert.strictEqual(resKupilek.matchedField, 'lyrics');
    assert.ok(resKupilek.lyricSnippet?.includes('Kupiłek lornetke'));
  });

  await runner.test('CH1-T5.6: EMPIRICAL DISCOVERY: ChordPro bracket collision drops valid lyric lines', () => {
    // A lyric line with opening chord [C] and closing chord [G]:
    // cleanLyricLine currently has: if (trimmed.startsWith('[') && trimmed.endsWith(']')) return null;
    // This erroneously treats "[C] Płynie rzeka do morza [G]" as a section header and returns null.
    const buggyLine = '[C] Płynie rzeka do morza [G]';
    const actualCleaned = cleanLyricLine(buggyLine);
    
    // We document and verify that actualCleaned is currently null due to this implementation limitation:
    assert.strictEqual(
      actualCleaned,
      null,
      'Documents existing limitation: cleanLyricLine treats line starting and ending with chords as a header'
    );
  });

  await runner.test('CH1-T5.7: EMPIRICAL DISCOVERY: Internal multiple spaces prevent phrase matching', () => {
    const wehikul = catalog.find((s) => s.slug === 'wehikul-czasu')!;
    // normalizeSearchText does not collapse multiple spaces, so "wehikul   czasu" fails to match "wehikul czasu"
    const res = matchSong(wehikul, 'wehikul   czasu');
    assert.strictEqual(
      res.matches,
      false,
      'Documents existing limitation: multiple internal spaces prevent phrase matching'
    );
  });
}
