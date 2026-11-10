export interface ParsedWywrotaSong {
  slug: string;
  title: string;
  artist: string;
  key: string;
  tags: string[];
  rawLyrics: string;
  fullContent: string;
}

export interface WywrotaParseOptions {
  tags?: string[];
  slug?: string;
  fallbackKey?: string;
}

/**
 * Decodes common HTML entities into plain text.
 */
export function cleanHtmlText(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

/**
 * Normalizes chord representation from Wywrota data attributes and local Polish notation.
 * e.g. chord='B' & local='H' -> 'H'
 *      chord='F#' & suffix='m' & local='fis' -> 'F#m'
 *      chord='A' & suffix='m' -> 'Am'
 */
export function normalizeWywrotaChord(
  chord: string,
  suffix: string,
  local: string,
  rawText: string
): string {
  let root = chord.trim();
  let sfx = suffix.trim();
  const loc = local.trim();

  // Handle Polish H (B natural)
  if (root.toUpperCase() === 'B' && (loc.startsWith('H') || loc.startsWith('h'))) {
    root = 'H';
  }

  // If suffix is empty but local or text is lowercase minor (e.g. 'a', 'e', 'd', 'h', 'c')
  if (!sfx && loc && /^[a-h]$/.test(loc)) {
    sfx = 'm';
  } else if (!sfx && rawText && /^[a-h]$/.test(rawText.trim())) {
    sfx = 'm';
  }

  // Standardize quality
  if (/^min/i.test(sfx)) {
    sfx = 'm' + sfx.slice(3);
  }

  return (root + sfx).trim();
}

/**
 * Reconstructs a chord line and lyric line with matching column indices
 * from an <span class='annotated-lyrics'> line.
 */
export function parseAnnotatedLine(htmlLine: string): { chordsLine: string; lyricsLine: string } {
  // Strip outer <span> wrappers but keep inline tags
  let inner = htmlLine.replace(/^<span[^>]*class=['"][^'"]*annotated-lyrics[^'"]*['"][^>]*>/i, '');
  inner = inner.replace(/<\/span>$/i, '');
  // Remove inner non-chord spans like <span class='text-nowrap'>
  inner = inner.replace(/<\/?span[^>]*>/gi, '');

  let chordsLine = '';
  let lyricsLine = '';

  const tokenRegex =
    /<code[^>]*data-chord=['"]([^'"]*)['"][^>]*data-suffix=['"]([^'"]*)['"][^>]*data-local=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/code>|<code[^>]*data-chord=['"]([^'"]*)['"][^>]*data-suffix=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/code>|([^<]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(inner)) !== null) {
    if (match[8]) {
      // Plain text segment
      const text = cleanHtmlText(match[8]);
      lyricsLine += text;
    } else {
      // Chord segment
      const chord = match[1] || match[5] || '';
      const suffix = match[2] || match[6] || '';
      const local = match[3] || '';
      const rawText = match[4] || match[7] || '';

      const normalizedChord = normalizeWywrotaChord(chord, suffix, local, rawText);
      const pos = lyricsLine.length;

      if (chordsLine.length < pos) {
        chordsLine = chordsLine.padEnd(pos, ' ');
      } else if (chordsLine.length > pos && chordsLine.length > 0) {
        chordsLine += ' ';
      }
      chordsLine += normalizedChord;
    }
  }

  return { chordsLine, lyricsLine };
}

/**
 * Extracts the inner HTML of the <div class="interpretation-content"> container
 * using balanced <div> tag counting to correctly support nested section <div>s.
 */
function extractInterpretationContent(html: string): string {
  const match = html.match(/class=['"][^'"]*interpretation-content[^'"]*['"][^>]*>/i);
  if (!match || match.index === undefined) return html;

  const contentStart = match.index + match[0].length;
  let depth = 1;
  let pos = contentStart;

  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);
    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, nextClose);
      }
      pos = nextClose + 6;
    }
  }

  return html.slice(contentStart);
}

/**
 * Parses full or partial HTML of a Wywrota song into frontmatter metadata and formatted lines.
 */
export function parseWywrotaHtml(
  html: string,
  options: WywrotaParseOptions = {}
): ParsedWywrotaSong {
  // 1. Title & Artist extraction from <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let title = '';
  let artist = '';

  if (h1Match) {
    const h1Content = h1Match[1];
    const strongMatch = h1Content.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    if (strongMatch) {
      title = cleanHtmlText(strongMatch[1].replace(/<[^>]+>/g, '')).trim();
      artist = cleanHtmlText(
        h1Content.replace(/<strong[^>]*>[\s\S]*?<\/strong>/i, '').replace(/<[^>]+>/g, '')
      ).trim();
    } else {
      const parts = cleanHtmlText(h1Content.replace(/<[^>]+>/g, '\n'))
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      title = parts[0] || '';
      artist = parts[1] || '';
    }
  }

  // 2. Tonacja (Key) extraction
  let key = options.fallbackKey || '';
  const keyMatch = html.match(/Tonacja:\s*([A-Ha-h][#b]?m?)/i);
  if (keyMatch) {
    key = keyMatch[1].trim();
  }

  // 3. Interpretation content isolation with balanced div handling
  const rawContent = extractInterpretationContent(html);

  // Extract section headers that might be formatted as <div class='song-section'>...</div>
  // Replace <div class='song-section'>...</div> with linebreaks to process line by line
  let normalizedContent = rawContent.replace(
    /<div[^>]*class=['"][^'"]*song-section[^'"]*['"][^>]*>([\s\S]*?)<\/div>/gi,
    '\n$1\n'
  );

  // Split by <br> or newlines
  const rawLines = normalizedContent.split(/<br\s*\/?>|\r?\n/i);
  const outputLines: string[] = [];
  const detectedChords: string[] = [];

  for (let rawLine of rawLines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      // Only keep single empty line separator
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      continue;
    }

    // Check if section header: e.g. [Zwrotka 1], [Refren], [Intro]
    const headerClean = cleanHtmlText(trimmed.replace(/<[^>]+>/g, '')).trim();
    if (headerClean.startsWith('[') && headerClean.endsWith(']')) {
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      outputLines.push(headerClean);
      continue;
    }

    // Check if annotated lyrics line: contains <code class='an'
    if (trimmed.includes("class='an'") || trimmed.includes('class="an"')) {
      const { chordsLine, lyricsLine } = parseAnnotatedLine(trimmed);
      if (chordsLine.trim()) {
        outputLines.push(chordsLine);
        // collect chords for key detection fallback
        chordsLine.split(/\s+/).filter(Boolean).forEach((c) => detectedChords.push(c));
      }
      if (lyricsLine.trim() || !chordsLine.trim()) {
        outputLines.push(lyricsLine);
      }
      continue;
    }

    // Check if chords-only line (intro, riff, solo)
    if (trimmed.includes('<code')) {
      const chordMatches = [
        ...trimmed.matchAll(
          /<code[^>]*data-chord=['"]([^'"]*)['"][^>]*data-suffix=['"]([^'"]*)['"][^>]*data-local=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/code>|<code[^>]*data-chord=['"]([^'"]*)['"][^>]*data-suffix=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/code>/gi
        ),
      ];

      if (chordMatches.length > 0) {
        const lineChords = chordMatches.map((m) => {
          const chord = m[1] || m[5] || '';
          const suffix = m[2] || m[6] || '';
          const local = m[3] || '';
          const rawText = m[4] || m[7] || '';
          const norm = normalizeWywrotaChord(chord, suffix, local, rawText);
          detectedChords.push(norm);
          return norm;
        });
        outputLines.push(lineChords.join('   '));
        continue;
      }
    }

    // Plain text line
    const plainText = cleanHtmlText(trimmed.replace(/<[^>]+>/g, '')).trim();
    if (plainText) {
      outputLines.push(plainText);
    }
  }

  // Fallback key: if key was not found in metadata, use first detected chord root, or 'C'
  if (!key) {
    if (detectedChords.length > 0) {
      key = detectedChords[0];
    } else {
      key = 'C';
    }
  }

  // Clean title & artist defaults if missing
  if (!title) title = 'Nieznana piosenka';
  if (!artist) artist = 'Nieznany wykonawca';

  const tags = options.tags || [];
  const tagsFormatted = tags.length > 0 ? `[${tags.join(', ')}]` : '[]';

  const slug =
    options.slug ||
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    'song';

  const body = outputLines.join('\n').trim();

  const frontmatter = [
    '---',
    `title: ${title}`,
    `artist: ${artist}`,
    `key: ${key}`,
    `tags: ${tagsFormatted}`,
    '---',
    '',
  ].join('\n');

  const fullContent = `${frontmatter}\n${body}\n`;

  return {
    slug,
    title,
    artist,
    key,
    tags,
    rawLyrics: body,
    fullContent,
  };
}

/**
 * Extracts all song URLs and next page link from Wywrota HTML (e.g. user favorites or catalog).
 */
export function extractSongLinksFromHtml(html: string): {
  songUrls: string[];
  nextPageUrl: string | null;
} {
  const songUrls = new Set<string>();

  // Song links match https://spiewnik.wywrota.pl/<artist-slug>/<song-slug>
  const regex = /href=["'](https:\/\/spiewnik\.wywrota\.pl\/([^/"'\s]+)\/([^/"'\s]+))["']/g;
  let match: RegExpExecArray | null;

  const excludedSlugs = new Set([
    'top',
    'assets',
    'blog',
    'content',
    'language',
    'uzytkownicy',
    'decisions',
    'fonts',
    'songbook',
    'my',
    'login',
    'register',
  ]);

  while ((match = regex.exec(html)) !== null) {
    const url = match[1];
    const artist = match[2];
    const song = match[3];

    if (!artist.startsWith('@') && !excludedSlugs.has(artist.toLowerCase())) {
      // Exclude secondary sub-pages of a song like /44864 or /video
      if (!/^\d+$/.test(song) && !song.includes('.')) {
        songUrls.add(url);
      }
    }
  }

  // Check for next page in pagination
  let nextPageUrl: string | null = null;
  const nextMatch = html.match(/<a[^>]*href=["']([^"']*[?&]page=(\d+)[^"']*)["'][^>]*rel=["']next["']/i)
    || html.match(/<li[^>]*class=['"][^'"]*page-item[^'"]*['"][^>]*>\s*<a[^>]*href=['"]([^'"]*[?&]page=(\d+)[^'"]*)['"][^>]*>(?:&rsaquo;|›|>|Dalej)<\/a>/i);

  if (nextMatch) {
    nextPageUrl = nextMatch[1];
  } else {
    // Look for any page item with page=N greater than current
    const pageMatches = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
    if (pageMatches.length > 0) {
      const maxPage = Math.max(...pageMatches);
      const currentPageMatch = html.match(/<li[^>]*class=['"][^'"]*active[^'"]*['"][^>]*>[\s\S]*?(\d+)/i);
      const currentPage = currentPageMatch ? Number(currentPageMatch[1]) : 1;
      if (maxPage > currentPage) {
        // Construct next page link
        const currentUrlBase = html.match(/<link[^>]*rel=['"]canonical['"][^>]*href=['"]([^"'?]+)['"]/i)?.[1];
        if (currentUrlBase) {
          nextPageUrl = `${currentUrlBase}?page=${currentPage + 1}`;
        }
      }
    }
  }

  return {
    songUrls: Array.from(songUrls),
    nextPageUrl,
  };
}
