import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework.ts';
import {
  parseWywrotaHtml,
  normalizeWywrotaChord,
  parseAnnotatedLine,
  extractSongLinksFromHtml,
  cleanHtmlText,
} from '../src/lib/wywrotaParser.ts';

export async function runImportWywrotaTests(runner: TestRunner) {
  runner.setTier('Stage 8 — Wywrota.pl Song Importer & CLI Tool');

  // =========================================================================
  // Test 1: cleanHtmlText decoding
  // =========================================================================
  await runner.test('IW01: cleanHtmlText decodes HTML entities properly', () => {
    assert.strictEqual(cleanHtmlText('A &amp; B'), 'A & B');
    assert.strictEqual(cleanHtmlText('&quot;Tekst&quot; &#39;test&#39;'), '"Tekst" \'test\'');
    assert.strictEqual(cleanHtmlText('Witaj&nbsp;świecie'), 'Witaj świecie');
    assert.strictEqual(cleanHtmlText('&lt;div&gt;'), '<div>');
  });

  // =========================================================================
  // Test 2: normalizeWywrotaChord notation
  // =========================================================================
  await runner.test('IW02: normalizeWywrotaChord normalizes Polish minor and H notation', () => {
    // Polish H (B natural)
    assert.strictEqual(normalizeWywrotaChord('B', '', 'H', 'H'), 'H');
    assert.strictEqual(normalizeWywrotaChord('B', 'm', 'h', 'h'), 'Hm');
    assert.strictEqual(normalizeWywrotaChord('B', '7', 'H7', 'H7'), 'H7');

    // Sharps & Flats
    assert.strictEqual(normalizeWywrotaChord('F#', 'm', 'fis', 'fis'), 'F#m');
    assert.strictEqual(normalizeWywrotaChord('C#', 'm', 'cis', 'cis'), 'C#m');
    assert.strictEqual(normalizeWywrotaChord('G#', 'm', 'gis', 'gis'), 'G#m');

    // Lowercase local minor shorthand
    assert.strictEqual(normalizeWywrotaChord('A', '', 'a', 'a'), 'Am');
    assert.strictEqual(normalizeWywrotaChord('E', '', 'e', 'e'), 'Em');
    assert.strictEqual(normalizeWywrotaChord('D', '', 'd', 'd'), 'Dm');

    // Standard major / complex chords
    assert.strictEqual(normalizeWywrotaChord('C', '', 'C', 'C'), 'C');
    assert.strictEqual(normalizeWywrotaChord('G', '7', 'G7', 'G7'), 'G7');
    assert.strictEqual(normalizeWywrotaChord('C', 'maj7', 'C7+', 'C7+'), 'Cmaj7');
  });

  // =========================================================================
  // Test 3: parseAnnotatedLine column alignment
  // =========================================================================
  await runner.test('IW03: parseAnnotatedLine aligns chords with exact character offset above lyrics', () => {
    const htmlLine =
      "<span class='annotated-lyrics'><code class='an' data-chord='C' data-suffix='' data-local='C'>C</code> Kiedy ci na głowę <code class='an' data-chord='G' data-suffix='' data-local='G'>G</code>wali się ten świat</span>";

    const { chordsLine, lyricsLine } = parseAnnotatedLine(htmlLine);

    assert.strictEqual(lyricsLine, ' Kiedy ci na głowę wali się ten świat');
    assert(chordsLine.startsWith('C'), 'Chord C should be at the start index');
    const gIndex = chordsLine.indexOf('G');
    const waliIndex = lyricsLine.indexOf('wali');
    assert.strictEqual(gIndex, waliIndex, 'Chord G must align directly over "wali" in the lyrics');
  });

  // =========================================================================
  // Test 4: parseWywrotaHtml metadata and structure
  // =========================================================================
  await runner.test('IW04: parseWywrotaHtml extracts title, artist, key, tags and sections', () => {
    const sampleHtml = `
      <html>
      <body>
        <h1>
          <strong>Zacznij od Bacha</strong>
          Zbigniew Wodecki
        </h1>
        <div class="song-metadata">
          Tonacja: C
        </div>
        <div class="interpretation-content">
          <div class='song-section'>[Intro]</div>
          <code data-chord='C' data-suffix='' data-local='C'>C</code> <code data-chord='G' data-suffix='' data-local='G'>G</code> <code data-chord='A' data-suffix='m' data-local='a'>a</code> <code data-chord='F' data-suffix='' data-local='F'>F</code><br>
          <div class='song-section'>[Zwrotka 1]</div>
          <span class='annotated-lyrics'><code class='an' data-chord='C' data-suffix='' data-local='C'>C</code> Kiedy ci na głowę <code class='an' data-chord='G' data-suffix='' data-local='G'>G</code>wali się ten świat</span><br>
          <span class='annotated-lyrics'><code class='an' data-chord='A' data-suffix='m' data-local='a'>a</code> Nie trać sił, zacznij od <code class='an' data-chord='F' data-suffix='' data-local='F'>F</code>Bacha</span>
        </div>
      </body>
      </html>
    `;

    const res = parseWywrotaHtml(sampleHtml, { tags: ['klasyka', 'wodecki'] });

    assert.strictEqual(res.title, 'Zacznij od Bacha');
    assert.strictEqual(res.artist, 'Zbigniew Wodecki');
    assert.strictEqual(res.key, 'C');
    assert.deepStrictEqual(res.tags, ['klasyka', 'wodecki']);
    assert(res.fullContent.includes('title: Zacznij od Bacha'));
    assert(res.fullContent.includes('artist: Zbigniew Wodecki'));
    assert(res.fullContent.includes('tags: [klasyka, wodecki]'));
    assert(res.fullContent.includes('[Intro]'));
    assert(res.fullContent.includes('[Zwrotka 1]'));
    assert(res.fullContent.includes('C   G   Am   F'));

    // Check that there are no empty lines in the body and right below frontmatter
    const linesAfterFrontmatter = res.fullContent.split('---')[2].trim().split('\n');
    assert(linesAfterFrontmatter.every((l) => l.trim() !== ''), 'No empty lines should be present in song body');
  });

  // =========================================================================
  // Test 5: Fallback key detection from chords when metadata is missing
  // =========================================================================
  await runner.test('IW05: parseWywrotaHtml infers key from first chord when Tonacja is omitted', () => {
    const htmlNoKey = `
      <h1><strong>Test Song</strong> Artist</h1>
      <div class="interpretation-content">
        <code data-chord='D' data-suffix='' data-local='D'>D</code> <code data-chord='A' data-suffix='' data-local='A'>A</code><br>
        <span class='annotated-lyrics'><code class='an' data-chord='D' data-suffix='' data-local='D'>D</code> Tekst</span>
      </div>
    `;

    const res = parseWywrotaHtml(htmlNoKey);
    assert.strictEqual(res.key, 'D', 'Should infer D from the first detected chord');
  });

  // =========================================================================
  // Test 6: extractSongLinksFromHtml and pagination
  // =========================================================================
  await runner.test('IW06: extractSongLinksFromHtml extracts song URLs and pagination next link', () => {
    const catalogHtml = `
      <div>
        <a href="https://spiewnik.wywrota.pl/kury/szatan">Szatan</a>
        <a href="https://spiewnik.wywrota.pl/zbigniew-wodecki/zacznij-od-bacha">Zacznij</a>
        <a href="https://spiewnik.wywrota.pl/top/liked">Ranking</a>
        <a href="https://spiewnik.wywrota.pl/blog/jak-grac">Blog</a>
        <a href="https://spiewnik.wywrota.pl/@mateusz-gasior/favorites?page=2" rel="next">Następna</a>
      </div>
    `;

    const { songUrls, nextPageUrl } = extractSongLinksFromHtml(catalogHtml);

    assert(songUrls.includes('https://spiewnik.wywrota.pl/kury/szatan'), 'Must include Kury song');
    assert(songUrls.includes('https://spiewnik.wywrota.pl/zbigniew-wodecki/zacznij-od-bacha'), 'Must include Wodecki song');
    assert(!songUrls.includes('https://spiewnik.wywrota.pl/top/liked'), 'Must exclude non-song routes');
    assert(!songUrls.includes('https://spiewnik.wywrota.pl/blog/jak-grac'), 'Must exclude blog routes');
    assert.strictEqual(nextPageUrl, 'https://spiewnik.wywrota.pl/@mateusz-gasior/favorites?page=2');
  });

  // =========================================================================
  // Test 7: CLI script and package.json integration
  // =========================================================================
  await runner.test('IW07: CLI script exists and is registered in package.json', () => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'import_wywrota.ts');
    assert(fs.existsSync(scriptPath), 'scripts/import_wywrota.ts must exist');

    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert(pkg.scripts['import:wywrota'], 'package.json must declare "import:wywrota" script');
    assert(
      pkg.scripts['import:wywrota'].includes('scripts/import_wywrota.ts'),
      'package.json script must invoke scripts/import_wywrota.ts'
    );
  });
}

// Standalone execution support
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const runner = new TestRunner();
  runImportWywrotaTests(runner).then(() => {
    const summary = runner.getSummary?.() || 'Tests finished';
    console.log(summary);
  });
}
