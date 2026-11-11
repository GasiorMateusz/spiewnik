#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseWywrotaHtml, extractSongLinksFromHtml } from '../src/lib/wywrotaParser.ts';

interface ImportOptions {
  urls: string[];
  inputFile?: string;
  limit?: number;
  overwrite: boolean;
  outDir: string;
  delayMs: number;
  tags: string[];
}

function parseCliArgs(args: string[]): ImportOptions {
  const options: ImportOptions = {
    urls: [],
    overwrite: false,
    outDir: 'songs',
    delayMs: 800,
    tags: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--file' || arg === '-f') {
      options.inputFile = args[++i];
    } else if (arg === '--limit') {
      options.limit = Number.parseInt(args[++i], 10);
    } else if (arg === '--overwrite' || arg === '-w') {
      options.overwrite = true;
    } else if (arg === '--out' || arg === '-o') {
      options.outDir = args[++i];
    } else if (arg === '--delay') {
      options.delayMs = Number.parseInt(args[++i], 10) || 400;
    } else if (arg === '--tag' || arg === '--tags') {
      const tagsStr = args[++i] || '';
      options.tags = tagsStr
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
      options.urls.push(arg);
    }
    i++;
  }

  return options;
}

function printHelp() {
  console.log(`
Użycie:
  npm run import:wywrota -- [opcje] [adresy URL...]
  node --experimental-strip-types scripts/import_wywrota.ts [opcje] [adresy URL...]

Przykłady:
  # Import całej kolekcji ulubionych użytkownika (z paginacją 1..N):
  npm run import:wywrota -- https://spiewnik.wywrota.pl/@mateusz-gasior/favorites

  # Próbny import pierwszych 5 piosenek z ulubionych:
  npm run import:wywrota -- https://spiewnik.wywrota.pl/@mateusz-gasior/favorites --limit 5

  # Import pojedynczej piosenki:
  npm run import:wywrota -- https://spiewnik.wywrota.pl/zbigniew-wodecki/zacznij-od-bacha

  # Import listy piosenek z pliku:
  npm run import:wywrota -- --file favorites.txt

Opcje:
  --file, -f <plik>     Plik z adresami URL (jeden w wierszu)
  --limit <N>           Maksymalna liczba piosenek do pobrania
  --overwrite, -w       Nadpisuj istniejące pliki lokalne (domyślnie: pomija)
  --out, -o <katalog>   Katalog zapisu (domyślnie: songs)
  --delay <ms>          Opóźnienie między żądaniami w ms (domyślnie: 400)
  --tag <tagi>          Dodatkowe tagi rozdzielone przecinkami (np. --tag ulubione,klasyka)
  --help, -h            Wyświetla tę pomoc
`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url: string, retries = 4): Promise<string> {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pl,en-US;q=0.7,en;q=0.3',
        },
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitSec = retryAfter ? Math.max(Number(retryAfter), 3) : attempt * 3;
        console.log(
          `   ⏳ Ograniczenie serwera (HTTP 429 Rate Limit). Oczekiwanie ${waitSec}s przed ponowieniem (${attempt}/${retries})...`
        );
        await sleep(waitSec * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} (${url})`);
      }

      return await response.text();
    } catch (err: any) {
      if (err.message.includes('429') && attempt < retries) {
        await sleep(attempt * 3000);
        continue;
      }
      if (attempt >= retries) {
        throw err;
      }
    }
  }

  throw new Error(`Przekroczono limit prób pobrania (HTTP 429) dla: ${url}`);
}

/**
 * Checks if a URL represents a collection / profile / favorites page.
 */
function isCollectionUrl(url: string): boolean {
  return (
    url.includes('/@') ||
    url.includes('/favorites') ||
    url.includes('/my/') ||
    url.includes('/top/') ||
    url.endsWith('/piosenki-turystyczne') ||
    url.endsWith('/szanty')
  );
}

/**
 * Crawls all pages of a collection URL to gather individual song links.
 */
async function crawlCollection(
  startUrl: string,
  limit?: number,
  delayMs = 400
): Promise<string[]> {
  const collected = new Set<string>();
  let currentUrl: string | null = startUrl;
  let page = 1;

  console.log(`\n🔍 Zbieranie piosenek z kolekcji: ${startUrl}`);

  while (currentUrl) {
    if (limit && collected.size >= limit) {
      break;
    }

    try {
      console.log(`   📄 Pobieranie strony ${page}: ${currentUrl}`);
      const html = await fetchHtml(currentUrl);
      const { songUrls, nextPageUrl } = extractSongLinksFromHtml(html);

      let newCount = 0;
      for (const songUrl of songUrls) {
        if (!collected.has(songUrl)) {
          collected.add(songUrl);
          newCount++;
          if (limit && collected.size >= limit) {
            break;
          }
        }
      }

      console.log(
        `      Znaleziono ${songUrls.length} piosenek (nowych: ${newCount}, łącznie w kolejce: ${collected.size})`
      );

      if (limit && collected.size >= limit) {
        break;
      }

      if (nextPageUrl && nextPageUrl !== currentUrl) {
        currentUrl = nextPageUrl;
        page++;
        await sleep(delayMs);
      } else {
        currentUrl = null;
      }
    } catch (err: any) {
      console.warn(`      ⚠️ Ostrzeżenie przy pobieraniu strony ${page}: ${err.message}`);
      break;
    }
  }

  console.log(`✅ Zakończono zbieranie linków. Łącznie znaleziono: ${collected.size} utworów.\n`);
  return Array.from(collected);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  // Collect target URLs
  const candidateUrls: string[] = [...options.urls];

  if (options.inputFile) {
    const inputPath = path.resolve(process.cwd(), options.inputFile);
    if (!fs.existsSync(inputPath)) {
      console.error(`✖ BŁĄD: Plik z linkami nie istnieje: ${inputPath}`);
      process.exit(1);
    }
    const lines = fs
      .readFileSync(inputPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    candidateUrls.push(...lines);
  }

  if (candidateUrls.length === 0) {
    console.log('ℹ️ Nie podano żadnych adresów URL ani pliku wejściowego.');
    printHelp();
    process.exit(1);
  }

  // Resolve collection pages to direct song URLs
  const targetSongUrls: string[] = [];

  for (const url of candidateUrls) {
    if (isCollectionUrl(url)) {
      const crawled = await crawlCollection(url, options.limit, options.delayMs);
      targetSongUrls.push(...crawled);
    } else {
      targetSongUrls.push(url);
    }
  }

  // Apply limit if specified
  const finalUrls = options.limit ? targetSongUrls.slice(0, options.limit) : targetSongUrls;

  if (finalUrls.length === 0) {
    console.log('ℹ️ Brak piosenek do zaimportowania.');
    return;
  }

  const outDir = path.resolve(process.cwd(), options.outDir);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`🚀 Rozpoczynam import ${finalUrls.length} utworów do katalogu: ${options.outDir}`);
  if (options.overwrite) {
    console.log('⚠️ Flaga --overwrite włączona: istniejące pliki będą nadpisywane.');
  } else {
    console.log('🛡️ Bezpieczne pomijanie: istniejące pliki lokalne zostaną zachowane.');
  }
  console.log('----------------------------------------------------------------');

  let savedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < finalUrls.length; i++) {
    const songUrl = finalUrls[i];
    const indexLabel = `[${i + 1}/${finalUrls.length}]`;

    // Guess slug from URL path (e.g. https://spiewnik.wywrota.pl/zbigniew-wodecki/zacznij-od-bacha -> zacznij-od-bacha)
    const urlParts = songUrl.replace(/\/$/, '').split('/');
    const urlSongSlug = urlParts.pop() || 'song';
    const urlArtistSlug = urlParts.pop() || '';

    const targetFilename = `${urlSongSlug}.txt`;
    const targetFilePath = path.join(outDir, targetFilename);

    // Overwrite check before fetching to save network calls
    if (fs.existsSync(targetFilePath) && !options.overwrite) {
      console.log(`${indexLabel} ⏭ POMINIĘTO: ${targetFilename} (plik już istnieje)`);
      skippedCount++;
      continue;
    }

    try {
      const html = await fetchHtml(songUrl);
      const parsed = parseWywrotaHtml(html, {
        tags: options.tags,
        slug: urlSongSlug,
      });

      // Name collision check: if file exists and has different artist and not overwrite
      let actualFilename = targetFilename;
      let actualFilePath = targetFilePath;

      if (fs.existsSync(actualFilePath) && !options.overwrite) {
        // If titles/artists differ, resolve conflict by prepending artist
        const existingContent = fs.readFileSync(actualFilePath, 'utf8');
        if (
          !existingContent.toLowerCase().includes(parsed.artist.toLowerCase()) &&
          urlArtistSlug
        ) {
          actualFilename = `${urlArtistSlug}-${urlSongSlug}.txt`;
          actualFilePath = path.join(outDir, actualFilename);
        }
      }

      // Ensure clean ending with no trailing empty lines or whitespace
      const cleanedContent = parsed.fullContent.trimEnd() + '\n';
      fs.writeFileSync(actualFilePath, cleanedContent, 'utf8');
      console.log(
        `${indexLabel} ✓ ZAPISANO: ${actualFilename} (${parsed.title} — ${parsed.artist}, tonacja: ${parsed.key})`
      );
      savedCount++;
    } catch (err: any) {
      console.error(`${indexLabel} ✖ BŁĄD przy ${songUrl}: ${err.message}`);
      errorCount++;
    }

    // Polite delay between requests
    if (i < finalUrls.length - 1) {
      await sleep(options.delayMs);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('================================================================');
  console.log(`🎉 Podsumowanie importu (czas: ${durationSec}s):`);
  console.log(`   ✓ Zapisano pomyślnie : ${savedCount}`);
  console.log(`   ⏭ Pominięto         : ${skippedCount}`);
  console.log(`   ✖ Błędy             : ${errorCount}`);
  console.log(`   📁 Katalog docelowy : ${options.outDir}`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Błąd krytyczny wykonania skryptu:', err);
  process.exit(1);
});
