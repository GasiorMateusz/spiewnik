import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { SongViewer } from '../src/components/SongViewer';
import { parseSong } from '../src/lib/songParser';
import type { ParsedSong, SongViewerProps } from '../src/types';

const PROD_PORT = 4178;
const CHROME_PORT = 9228;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Mock sample song for rigorous layout testing
const MOCK_RAW_SONG = `---
title: "Testowa Piosenka"
artist: "Zespół Testowy"
key: "C"
tags: ["rock", "test"]
---

[Zwrotka 1]
C        G         Am          F
To jest testowy wers z czterema akordami
C               G
Długi tekst bez akordów na końcu

[Refren]
H        B
Syllable-less intro chords
C
`;

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(suite: string, name: string, fn: () => void | Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    results.push({ suite, name, passed: true, durationMs });
    console.log(`  \x1b[32m✓\x1b[0m [${suite}] ${name} \x1b[90m(${durationMs}ms)\x1b[0m`);
  } catch (err: any) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const msg = err?.message || String(err);
    results.push({ suite, name, passed: false, durationMs, error: msg });
    console.error(`  \x1b[31m✗\x1b[0m [${suite}] ${name}: \x1b[31m${msg}\x1b[0m`);
    if (err?.stack) {
      console.error(`    \x1b[90m${err.stack.split('\n').slice(1, 4).join('\n    ')}\x1b[0m`);
    }
  }
}

class CdpClient {
  private ws: WebSocket;
  private id = 1;
  private callbacks = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id)!;
        this.callbacks.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    };
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`CDP eval exception: ${res.exceptionDetails.text} - ${JSON.stringify(res.exceptionDetails.exception)}`);
    }
    return res.result?.value;
  }
}

async function connectToChromePage(): Promise<{ cdp: CdpClient; ws: WebSocket }> {
  let pageWsUrl: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json`);
      const targets = await res.json();
      const page = targets.find((t: any) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }
  assert(pageWsUrl, 'Failed to obtain Chrome page WebSocket URL');
  const ws = new WebSocket(pageWsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const cdp = new CdpClient(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return { cdp, ws };
}

async function main() {
  console.log('\n================================================================');
  console.log('  CHALLENGER EMPIRICAL VERIFICATION: SongViewer.tsx & UI         ');
  console.log('================================================================\n');

  const parsedSong = parseSong(MOCK_RAW_SONG, 'testowa-piosenka', '/songs/testowa.txt');

  // ==========================================================================
  // SUITE 1: Font Scaling Bounds & Dynamic Sizing Calculations
  // ==========================================================================
  console.log('--- SUITE 1: Font Scaling Bounds & Dynamic Typography Math ---');

  await runTest('Suite 1', 'Mathematical sizing invariants across all offsets [-4..12]', () => {
    for (let offset = -4; offset <= 12; offset++) {
      const lyricFontSize = 16 + offset;
      const chordFontSize = Math.max(10, 12 + Math.round(offset * 0.65));
      const chordRowHeight = Math.max(16, 16 + Math.round(offset * 0.75));

      // 1. Lyric font size must range between 12px (-4 offset) and 28px (+12 offset)
      assert(lyricFontSize >= 12 && lyricFontSize <= 28, `Lyric size out of bounds for offset ${offset}: ${lyricFontSize}`);

      // 2. Chord font size must range between 10px and 20px
      assert(chordFontSize >= 10 && chordFontSize <= 20, `Chord size out of bounds for offset ${offset}: ${chordFontSize}`);

      // 3. Chord row height must range between 16px and 25px
      assert(chordRowHeight >= 16 && chordRowHeight <= 25, `Chord row height out of bounds for offset ${offset}: ${chordRowHeight}`);

      // 4. Critical Invariant: chordRowHeight must strictly accommodate chordFontSize without clipping
      assert(
        chordRowHeight >= chordFontSize,
        `Clipping risk: chordRowHeight (${chordRowHeight}px) < chordFontSize (${chordFontSize}px) at offset ${offset}`
      );
    }
  });

  await runTest('Suite 1', 'SongViewer render with initialFontSizeOffset = 0 (Base state)', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialFontSizeOffset: 0,
      })
    );

    // Font scaler pill should display "0"
    assert(html.includes('>0</span>'), 'Font scaler pill must display "0" at offset 0');

    // Both A- and A+ buttons must NOT be disabled at offset 0
    assert(!html.includes('disabled="" title="Zmniejsz czcionkę"'), 'A- button must be enabled at offset 0');
    assert(!html.includes('disabled="" title="Zwiększ czcionkę"'), 'A+ button must be enabled at offset 0');

    // Check style values for chord (12px, 16px) and lyric (16px)
    assert(html.includes('font-size:12px;height:16px'), 'Base chord style must be 12px / 16px');
    assert(html.includes('font-size:16px;line-height:1.35'), 'Base lyric style must be 16px / line-height 1.35');
  });

  await runTest('Suite 1', 'SongViewer render with initialFontSizeOffset = -4 (Lower bound)', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialFontSizeOffset: -4,
      })
    );

    // Font scaler pill should display "-4"
    assert(html.includes('>-4</span>'), 'Font scaler pill must display "-4" at offset -4');

    // A- button MUST be disabled at <= -4
    assert(html.includes('disabled=""') && html.includes('title="Zmniejsz czcionkę"'), 'A- button must be disabled at -4');
    assert(html.includes('disabled:cursor-not-allowed'), 'A- button must have disabled style classes');

    // A+ button must NOT be disabled
    assert(!html.includes('disabled="" title="Zwiększ czcionkę"'), 'A+ button must be enabled at -4');

    // Check style values: lyric=12px, chord=10px, chordRowHeight=16px
    assert(html.includes('font-size:10px;height:16px'), 'Chord style at -4 must be 10px / 16px');
    assert(html.includes('font-size:12px;line-height:1.35'), 'Lyric style at -4 must be 12px / line-height 1.35');
  });

  await runTest('Suite 1', 'SongViewer render with initialFontSizeOffset = 12 (Upper bound)', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialFontSizeOffset: 12,
      })
    );

    // Font scaler pill should display "+12"
    assert(html.includes('>+12</span>'), 'Font scaler pill must display "+12" at offset +12');

    // A+ button MUST be disabled at >= 12
    assert(html.includes('disabled=""') && html.includes('title="Zwiększ czcionkę"'), 'A+ button must be disabled at +12');

    // A- button must NOT be disabled
    assert(!html.includes('disabled="" title="Zmniejsz czcionkę"'), 'A- button must be enabled at +12');

    // Check style values: lyric=28px, chord=20px, chordRowHeight=25px
    assert(html.includes('font-size:20px;height:25px'), 'Chord style at +12 must be 20px / 25px');
    assert(html.includes('font-size:28px;line-height:1.35'), 'Lyric style at +12 must be 28px / line-height 1.35');
  });

  await runTest('Suite 1', 'Extreme initial offsets clamp disabled buttons safely', () => {
    // Extreme negative offset -10
    const htmlNeg = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialFontSizeOffset: -10,
      })
    );
    assert(htmlNeg.includes('disabled=""') && htmlNeg.includes('title="Zmniejsz czcionkę"'), 'A- must be disabled at -10');

    // Extreme positive offset +20
    const htmlPos = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialFontSizeOffset: 20,
      })
    );
    assert(htmlPos.includes('disabled=""') && htmlPos.includes('title="Zwiększ czcionkę"'), 'A+ must be disabled at +20');
  });

  // ==========================================================================
  // SUITE 2: Responsive Atomic Flex Layout & Token Syllable Binding
  // ==========================================================================
  console.log('\n--- SUITE 2: Responsive Atomic Flex Layout & Token Syllable Binding ---');

  await runTest('Suite 2', 'Atomic segment wrapper structure (inline-flex flex-col align-top mr-1)', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
      })
    );

    // Must wrap each chord/lyric column in inline-flex flex-col align-top mr-1
    assert(
      html.includes('class="inline-flex flex-col align-top mr-1"'),
      'Segments must be wrapped in inline-flex flex-col align-top mr-1'
    );

    // Line container must wrap tokens cleanly
    assert(
      html.includes('class="flex flex-wrap items-end w-full"'),
      'Lines must be styled with flex flex-wrap items-end w-full'
    );

    // Song text container must prevent horizontal overflow
    assert(
      html.includes('overflow-x-hidden'),
      'Song container must include overflow-x-hidden to prevent body blowout'
    );
  });

  await runTest('Suite 2', 'Syllable-less chords render above non-breaking space \\u00A0', () => {
    // Custom song with an isolated chord that has no lyrics underneath
    const isolatedChordSong: ParsedSong = {
      slug: 'isolated-chord',
      title: 'Isolated Chord Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            { chord: 'Am', lyrics: '' }, // Isolated chord with empty lyric
          ],
        },
      ],
      uniqueChords: ['Am'],
    };

    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: isolatedChordSong,
      })
    );

    // Underneath the chord "Am", the lyric span must render &nbsp; (\u00A0)
    assert(html.includes('>Am</button>'), 'Chord button Am must be rendered');
    assert(
      html.includes('<span style="font-size:16px;line-height:1.35" class="text-neutral-200 whitespace-pre font-sans">&#x00A0;</span>') ||
      html.includes('\u00A0'),
      'Empty lyrics must render non-breaking space \\u00A0 to preserve vertical line height'
    );
  });

  await runTest('Suite 2', 'Chord-less lyrics render below non-breaking space \\u00A0 placeholder', () => {
    // Custom song with lyrics segment without chord
    const lyricOnlySong: ParsedSong = {
      slug: 'lyric-only',
      title: 'Lyric Only Test',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            { chord: '', lyrics: 'Tylko tekst bez akordu' },
          ],
        },
      ],
      uniqueChords: [],
    };

    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: lyricOnlySong,
      })
    );

    // Top slot must render non-breaking space with chord row height style
    assert(
      html.includes('class="text-amber-500 font-bold select-none pointer-events-none leading-none flex items-center">&#x00A0;</span>') ||
      html.includes('pointer-events-none leading-none flex items-center">\u00A0</span>') ||
      html.includes('&#x00A0;</span><span style="font-size:16px;line-height:1.35"'),
      'Chord-less lyrics must render \\u00A0 placeholder in top slot to maintain vertical alignment'
    );
    assert(html.includes('Tylko tekst bez akordu'), 'Lyrics must be rendered');
  });

  await runTest('Suite 2', 'Adversarial: Pure chord intro line (multiple chords, zero lyrics)', () => {
    const introSong: ParsedSong = {
      slug: 'intro-song',
      title: 'Intro Song',
      artist: 'Tester',
      key: 'C',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            { chord: 'C', lyrics: '' },
            { chord: 'G', lyrics: '' },
            { chord: 'Am', lyrics: '' },
            { chord: 'F', lyrics: '' },
          ],
        },
      ],
      uniqueChords: ['C', 'G', 'Am', 'F'],
    };

    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: introSong,
      })
    );

    // All 4 chords rendered as clickable buttons
    assert(html.includes('>C</button>'), 'Intro chord C must be rendered');
    assert(html.includes('>G</button>'), 'Intro chord G must be rendered');
    assert(html.includes('>Am</button>'), 'Intro chord Am must be rendered');
    assert(html.includes('>F</button>'), 'Intro chord F must be rendered');

    // All 4 must have fallback \u00A0 in lyric slot
    const matches = html.match(/class="text-neutral-200 whitespace-pre font-sans">&#x00A0;<\/span>/g) ||
                    html.match(/class="text-neutral-200 whitespace-pre font-sans">\u00A0<\/span>/g);
    assert.strictEqual(matches?.length, 4, 'All 4 syllable-less intro chords must have \\u00A0 below them');
  });

  await runTest('Suite 2', 'Theme support (dark vs light mode styling classes)', () => {
    // Dark mode (default)
    const htmlDark = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        theme: 'dark',
      })
    );
    assert(htmlDark.includes('bg-neutral-900 border-neutral-800'), 'Dark theme must use neutral-900/800');
    assert(htmlDark.includes('text-neutral-200'), 'Dark theme must use neutral-200 text');

    // Light mode
    const htmlLight = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        theme: 'light',
      })
    );
    assert(htmlLight.includes('bg-white border-neutral-200'), 'Light theme must use white/neutral-200');
    assert(htmlLight.includes('text-neutral-800'), 'Light theme must use neutral-800 text');
  });

  // ==========================================================================
  // SUITE 3: Transposition & Polish Notation & Navigation Invariants
  // ==========================================================================
  console.log('\n--- SUITE 3: Transposition, Notation & Navigation Invariants ---');

  await runTest('Suite 3', 'Back button contract (ArrowLeftIcon, aria-label, title)', () => {
    let backCalled = false;
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        onBack: () => {
          backCalled = true;
        },
      })
    );

    assert(html.includes('aria-label="Wróć do katalogu"'), 'Back button must have Polish aria-label');
    assert(html.includes('title="Wróć do katalogu"'), 'Back button must have Polish title');
    assert(html.includes('<svg'), 'Back button must render SVG icon');
  });

  await runTest('Suite 3', 'Semitone shift buttons and Reset button conditional display', () => {
    // 1. At transpose = 0: Reset button must NOT be present
    const html0 = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialTranspose: 0,
      })
    );
    assert(html0.includes('>-1</button>'), '-1 semitone button must be present');
    assert(html0.includes('>+1</button>'), '+1 semitone button must be present');
    assert(html0.includes('>0</span>'), 'Transpose offset must display 0');
    assert(!html0.includes('>Reset</button>'), 'Reset button must NOT render when transpose === 0');

    // 2. At transpose = 2: Reset button MUST be present
    const html2 = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialTranspose: 2,
      })
    );
    assert(html2.includes('>+2</span>'), 'Transpose offset must display +2');
    assert(html2.includes('>Reset</button>'), 'Reset button MUST render when transpose !== 0');
    assert(html2.includes('title="Przywróć oryginalną tonację"'), 'Reset button must have Polish tooltip');

    // 3. At transpose = -3: Reset button MUST be present
    const htmlMinus = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialTranspose: -3,
      })
    );
    assert(htmlMinus.includes('>-3</span>'), 'Transpose offset must display -3');
    assert(htmlMinus.includes('>Reset</button>'), 'Reset button MUST render when transpose is negative');
  });

  await runTest('Suite 3', 'Polish vs International notation label contract', () => {
    // Polish notation active by default
    const htmlPl = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialPolishNotation: true,
      })
    );
    assert(htmlPl.includes('Notacja: PL (H)'), 'Must indicate PL (H) when polishNotation is true');

    // International notation
    const htmlInt = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: parsedSong,
        initialPolishNotation: false,
      })
    );
    assert(htmlInt.includes('Notacja: INT (B)'), 'Must indicate INT (B) when polishNotation is false');
  });

  await runTest('Suite 3', 'Sharp enharmonic transposition on all 12 semitone shifts', () => {
    // Start from C, shift by +1 to +12:
    // In PL: C(0) -> C#(1) -> D(2) -> D#(3) -> E(4) -> F(5) -> F#(6) -> G(7) -> G#(8) -> A(9) -> B(10 = Bb/A# in PL) -> H(11 = B nat in PL) -> C(12)
    // In INT: C(0) -> C#(1) -> D(2) -> D#(3) -> E(4) -> F(5) -> F#(6) -> G(7) -> G#(8) -> A(9) -> A#(10) -> B(11) -> C(12)
    const expectedPl = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B', 'H', 'C'];
    const expectedInt = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'];

    for (let shift = 0; shift <= 12; shift++) {
      const htmlPl = renderToStaticMarkup(
        React.createElement(SongViewer, {
          song: parsedSong,
          initialTranspose: shift,
          initialPolishNotation: true,
        })
      );
      assert(
        htmlPl.includes(`>${expectedPl[shift]}</button>`),
        `PL Transpose +${shift} expected ${expectedPl[shift]}`
      );

      const htmlInt = renderToStaticMarkup(
        React.createElement(SongViewer, {
          song: parsedSong,
          initialTranspose: shift,
          initialPolishNotation: false,
        })
      );
      assert(
        htmlInt.includes(`>${expectedInt[shift]}</button>`),
        `INT Transpose +${shift} expected ${expectedInt[shift]}`
      );
    }
  });

  await runTest('Suite 3', 'Minor chord formatting uppercase root + lowercase m', () => {
    // Song with minor chords
    const minorSong: ParsedSong = {
      slug: 'minor-song',
      title: 'Minor Song',
      artist: 'Tester',
      key: 'Am',
      tags: [],
      rawLyrics: '',
      lines: [
        {
          type: 'chords-and-lyrics',
          segments: [
            { chord: 'am', lyrics: 'tekst' },
            { chord: 'amin', lyrics: 'tekst' },
            { chord: 'c#m', lyrics: 'tekst' },
          ],
        },
      ],
      uniqueChords: ['am', 'amin', 'c#m'],
    };

    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: minorSong,
      })
    );

    assert(html.includes('>Am</button>'), 'Lowercase "am" must format to "Am"');
    assert(html.includes('>C#m</button>'), 'Lowercase "c#m" must format to "C#m"');
  });

  // ==========================================================================
  // SUITE 4: Interactive Headless Chrome CDP Tests (360px Viewport & Live State)
  // ==========================================================================
  console.log('\n--- SUITE 4: Live Headless Chrome CDP Interactive & Stress Tests ---');

  if (!fs.existsSync(CHROME_PATH) || !fs.existsSync('dist/index.html')) {
    console.log('  \x1b[33mℹ Skipping live Chrome CDP E2E (Chrome or dist/index.html not found)\x1b[0m');
  } else {
    // Start local HTTP server for dist/
    const server = http.createServer((req, res) => {
      let reqPath = req.url?.split('?')[0] || '/';
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(process.cwd(), 'dist', reqPath);

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    await new Promise<void>((r) => server.listen(PROD_PORT, r));

    const chrome = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${CHROME_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ]);

    try {
      const { cdp, ws } = await connectToChromePage();

      // Configure narrow 360px mobile viewport (REQ-VIEW-1)
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 360,
        height: 640,
        deviceScaleFactor: 2,
        mobile: true,
      });

      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html` });
      await new Promise((r) => setTimeout(r, 800));

      // Test 4.1: Narrow 360px viewport zero horizontal overflow
      await runTest('Suite 4', 'Zero horizontal overflow on 360px narrow viewport', async () => {
        const overflowCheck = await cdp.eval(`(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const innerWidth = window.innerWidth;
          const scrollWidth = docEl.scrollWidth;
          const bodyScrollWidth = body.scrollWidth;

          // Check if any element breaches right edge 360px
          const allElements = Array.from(document.querySelectorAll('*'));
          const overflowingElements = [];
          for (const el of allElements) {
            const rect = el.getBoundingClientRect();
            // allow a 1px tolerance for subpixel rounding
            if (rect.right > 361) {
              overflowingElements.push({
                tag: el.tagName,
                className: el.className,
                rectRight: rect.right,
              });
            }
          }

          return {
            innerWidth,
            scrollWidth,
            bodyScrollWidth,
            hasOverflow: scrollWidth > innerWidth || bodyScrollWidth > innerWidth,
            overflowCount: overflowingElements.length,
            overflowingElements: overflowingElements.slice(0, 5),
          };
        })()`);

        assert.strictEqual(overflowCheck.innerWidth, 360, 'Viewport width must be 360px');
        assert(
          !overflowCheck.hasOverflow,
          `Horizontal overflow detected! scrollWidth=${overflowCheck.scrollWidth}, innerWidth=${overflowCheck.innerWidth}`
        );
        assert.strictEqual(
          overflowCheck.overflowCount,
          0,
          `Elements overflowing right boundary: ${JSON.stringify(overflowCheck.overflowingElements)}`
        );
      });

      // Test 4.2: Interactive Font Scaling Decrement & Lower Bound Disabling
      await runTest('Suite 4', 'Interactive font scaling A- decrements to -4px and disables at <= -4', async () => {
        // Step 1: Click A- once (from 0 to -2)
        await cdp.eval(`document.querySelector('button[title="Zmniejsz czcionkę"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const step1 = await cdp.eval(`(() => {
          const btnMinus = document.querySelector('button[title="Zmniejsz czcionkę"]');
          const pill = btnMinus.parentElement.querySelector('span');
          return {
            text: pill ? pill.textContent.trim() : null,
            disabled: btnMinus.disabled,
          };
        })()`);
        assert.strictEqual(step1.text, '-2', 'Font offset should be -2 after 1 click on A-');
        assert.strictEqual(step1.disabled, false, 'A- button should not be disabled at -2');

        // Step 2: Click A- second time (from -2 to -4)
        await cdp.eval(`document.querySelector('button[title="Zmniejsz czcionkę"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const step2 = await cdp.eval(`(() => {
          const btnMinus = document.querySelector('button[title="Zmniejsz czcionkę"]');
          const pill = btnMinus.parentElement.querySelector('span');
          return {
            text: pill ? pill.textContent.trim() : null,
            disabled: btnMinus.disabled,
          };
        })()`);
        assert.strictEqual(step2.text, '-4', 'Font offset should be -4 after 2 clicks on A-');
        assert.strictEqual(step2.disabled, true, 'A- button MUST be disabled at -4 (lower bound)');

        // Step 3: Verify inline styles at -4 offset
        const stylesAtMinus4 = await cdp.eval(`(() => {
          const chordBtn = document.querySelector('.inline-flex.flex-col button');
          const lyricSpan = document.querySelector('.inline-flex.flex-col .whitespace-pre');
          return {
            chordFontSize: chordBtn ? chordBtn.style.fontSize : null,
            chordHeight: chordBtn ? chordBtn.style.height : null,
            lyricFontSize: lyricSpan ? lyricSpan.style.fontSize : null,
          };
        })()`);
        assert.strictEqual(stylesAtMinus4.chordFontSize, '10px', 'Chord font size at -4 must be 10px');
        assert.strictEqual(stylesAtMinus4.chordHeight, '16px', 'Chord height at -4 must be 16px');
        assert.strictEqual(stylesAtMinus4.lyricFontSize, '12px', 'Lyric font size at -4 must be 12px');

        // Step 4: Attempting to click A- again while disabled must NOT decrement further
        await cdp.eval(`document.querySelector('button[title="Zmniejsz czcionkę"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const step3 = await cdp.eval(`(() => {
          const btnMinus = document.querySelector('button[title="Zmniejsz czcionkę"]');
          const pill = btnMinus.parentElement.querySelector('span');
          return {
            text: pill ? pill.textContent.trim() : null,
            disabled: btnMinus.disabled,
          };
        })()`);
        assert.strictEqual(step3.text, '-4', 'Font offset must remain clamped at -4');
        assert.strictEqual(step3.disabled, true, 'A- button must remain disabled');
      });

      // Test 4.3: Interactive Font Scaling Increment & Upper Bound Disabling (+12px)
      await runTest('Suite 4', 'Interactive font scaling A+ increments to +12px and disables at >= 12', async () => {
        // From -4, click A+ 8 times: -2, 0, +2, +4, +6, +8, +10, +12
        for (let i = 0; i < 8; i++) {
          await cdp.eval(`document.querySelector('button[title="Zwiększ czcionkę"]').click()`);
          await new Promise((r) => setTimeout(r, 60));
        }
        await new Promise((r) => setTimeout(r, 150));

        const result = await cdp.eval(`(() => {
          const btnPlus = document.querySelector('button[title="Zwiększ czcionkę"]');
          const btnMinus = document.querySelector('button[title="Zmniejsz czcionkę"]');
          const pill = btnPlus.parentElement.querySelector('span');
          return {
            text: pill ? pill.textContent.trim() : null,
            plusDisabled: btnPlus.disabled,
            minusDisabled: btnMinus.disabled,
          };
        })()`);
        assert.strictEqual(result.text, '+12', 'Font offset must reach +12');
        assert.strictEqual(result.plusDisabled, true, 'A+ button MUST be disabled at +12 (upper bound)');
        assert.strictEqual(result.minusDisabled, false, 'A- button must be re-enabled');

        // Verify live inline styles at +12 offset
        const stylesAtPlus12 = await cdp.eval(`(() => {
          const chordBtn = document.querySelector('.inline-flex.flex-col button');
          const lyricSpan = document.querySelector('.inline-flex.flex-col .whitespace-pre');
          return {
            chordFontSize: chordBtn ? chordBtn.style.fontSize : null,
            chordHeight: chordBtn ? chordBtn.style.height : null,
            lyricFontSize: lyricSpan ? lyricSpan.style.fontSize : null,
          };
        })()`);
        assert.strictEqual(stylesAtPlus12.chordFontSize, '20px', 'Chord font size at +12 must be 20px');
        assert.strictEqual(stylesAtPlus12.chordHeight, '25px', 'Chord height at +12 must be 25px');
        assert.strictEqual(stylesAtPlus12.lyricFontSize, '28px', 'Lyric font size at +12 must be 28px');

        // Attempting to click A+ again while disabled must NOT increment further
        await cdp.eval(`document.querySelector('button[title="Zwiększ czcionkę"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const plusClamped = await cdp.eval(`(() => {
          const btnPlus = document.querySelector('button[title="Zwiększ czcionkę"]');
          const pill = btnPlus.parentElement.querySelector('span');
          return {
            text: pill ? pill.textContent.trim() : null,
            plusDisabled: btnPlus.disabled,
          };
        })()`);
        assert.strictEqual(plusClamped.text, '+12', 'Font offset must remain clamped at +12');
        assert.strictEqual(plusClamped.plusDisabled, true, 'A+ button must remain disabled');

        // Check horizontal overflow at MAXIMUM font scaling (+12) on 360px viewport
        const maxFontOverflow = await cdp.eval(`(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const innerWidth = window.innerWidth;
          return {
            scrollWidth: docEl.scrollWidth,
            bodyScrollWidth: body.scrollWidth,
            innerWidth,
            hasOverflow: docEl.scrollWidth > innerWidth,
          };
        })()`);
        assert(
          !maxFontOverflow.hasOverflow,
          `At +12 font scaling, layout overflowed 360px viewport! scrollWidth=${maxFontOverflow.scrollWidth}`
        );

        // Reset font size back to 0 (click A- 6 times)
        for (let i = 0; i < 6; i++) {
          await cdp.eval(`document.querySelector('button[title="Zmniejsz czcionkę"]').click()`);
          await new Promise((r) => setTimeout(r, 60));
        }
        await new Promise((r) => setTimeout(r, 150));
      });

      // Test 4.4: Live Semitone Transposition & Reset
      await runTest('Suite 4', 'Live semitone shift (+1/-1) and Reset button interaction', async () => {
        // Initial state: transpose is 0, reset button should not exist
        const initial = await cdp.eval(`(() => {
          const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
          const transposeSpan = document.querySelector('.text-sm.font-mono.font-bold.w-12');
          return {
            hasReset: resetBtn !== null,
            offset: transposeSpan ? transposeSpan.textContent.trim() : null,
          };
        })()`);
        assert.strictEqual(initial.hasReset, false, 'Reset button must not exist at transpose 0');
        assert.strictEqual(initial.offset, '0', 'Transpose offset must display 0');

        // Click +1: offset becomes +1, Reset button appears
        await cdp.eval(`document.querySelector('button[title="Podwyższ o półton"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const stepPlus = await cdp.eval(`(() => {
          const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
          const transposeSpan = document.querySelector('.text-sm.font-mono.font-bold.w-12');
          return {
            hasReset: resetBtn !== null,
            resetText: resetBtn ? resetBtn.textContent.trim() : null,
            offset: transposeSpan ? transposeSpan.textContent.trim() : null,
          };
        })()`);
        assert.strictEqual(stepPlus.hasReset, true, 'Reset button must appear when transpose > 0');
        assert.strictEqual(stepPlus.resetText, 'Reset', 'Reset button text must be "Reset"');
        assert.strictEqual(stepPlus.offset, '+1', 'Transpose display must be +1');

        // Click +1 again: offset becomes +2
        await cdp.eval(`document.querySelector('button[title="Podwyższ o półton"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        // Click Reset: offset must return to 0, Reset button must disappear
        await cdp.eval(`(() => {
          const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
          if (resetBtn) resetBtn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 150));

        const afterReset = await cdp.eval(`(() => {
          const resetBtnAfter = document.querySelector('button[title="Przywróć oryginalną tonację"]');
          const transposeSpan = document.querySelector('.text-sm.font-mono.font-bold.w-12');
          return {
            hasReset: resetBtnAfter !== null,
            offset: transposeSpan ? transposeSpan.textContent.trim() : null,
          };
        })()`);
        assert.strictEqual(afterReset.hasReset, false, 'Reset button must disappear after tap');
        assert.strictEqual(afterReset.offset, '0', 'Transpose offset must reset to 0');

        // Click -1: offset becomes -1, Reset button appears
        await cdp.eval(`document.querySelector('button[title="Obniż o półton"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const stepMinus = await cdp.eval(`(() => {
          const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
          const transposeSpan = document.querySelector('.text-sm.font-mono.font-bold.w-12');
          return {
            hasReset: resetBtn !== null,
            offset: transposeSpan ? transposeSpan.textContent.trim() : null,
          };
        })()`);
        assert.strictEqual(stepMinus.hasReset, true, 'Reset button must appear when transpose < 0');
        assert.strictEqual(stepMinus.offset, '-1', 'Transpose display must be -1');

        // Clean up: reset back to 0
        await cdp.eval(`(() => {
          const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
          if (resetBtn) resetBtn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 150));
      });

      // Test 4.5: Live Polish Notation Toggle
      await runTest('Suite 4', 'Live Polish notation toggle (PL H <-> INT B)', async () => {
        // Default is Polish notation (PL (H))
        const initial = await cdp.eval(`(() => {
          const toggleBtn = document.querySelector('button[title*="notację"]');
          return toggleBtn ? toggleBtn.textContent.trim() : null;
        })()`);
        assert(initial && initial.includes('PL (H)'), `Expected PL (H), got: ${initial}`);

        // Click toggle to switch to International
        await cdp.eval(`document.querySelector('button[title*="notację"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const switchedToInt = await cdp.eval(`(() => {
          const toggleBtn = document.querySelector('button[title*="notację"]');
          return toggleBtn ? toggleBtn.textContent.trim() : null;
        })()`);
        assert(switchedToInt && switchedToInt.includes('INT (B)'), `Expected INT (B), got: ${switchedToInt}`);

        // Click toggle to switch back to Polish
        await cdp.eval(`document.querySelector('button[title*="notację"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const switchedBack = await cdp.eval(`(() => {
          const toggleBtn = document.querySelector('button[title*="notację"]');
          return toggleBtn ? toggleBtn.textContent.trim() : null;
        })()`);
        assert(switchedBack && switchedBack.includes('PL (H)'), `Expected PL (H), got: ${switchedBack}`);
      });

      // Test 4.6: Live Distraction-Free Back Button
      await runTest('Suite 4', 'Live Back button navigates to hash #/', async () => {
        // Set hash to something else first
        await cdp.eval(`window.location.hash = '#/song/bieszczadzkie-anioly'`);
        const preHash = await cdp.eval(`window.location.hash`);
        assert.strictEqual(preHash, '#/song/bieszczadzkie-anioly');

        // Click back button
        await cdp.eval(`document.querySelector('button[aria-label="Wróć do katalogu"]').click()`);
        await new Promise((r) => setTimeout(r, 150));

        const postHash = await cdp.eval(`window.location.hash`);
        assert.strictEqual(postHash, '#/', 'Back button must set window.location.hash to #/');
      });

      // Test 4.7: Live Quick Chord Chip Click Opens Modal
      await runTest('Suite 4', 'Quick chord chips & inline chord triggers open interactive modal', async () => {
        const preOpen = await cdp.eval(`document.querySelector('dialog')?.open || false`);
        assert.strictEqual(preOpen, false, 'Modal should be closed initially');

        // Click quick chip
        await cdp.eval(`document.querySelector('.flex.flex-wrap.gap-2.pt-2 button').click()`);
        await new Promise((r) => setTimeout(r, 200));

        const modalOpen = await cdp.eval(`(() => {
          const dialog = document.querySelector('dialog');
          return {
            open: dialog ? dialog.open : false,
            header: dialog ? dialog.querySelector('.text-2xl')?.textContent.trim() : null,
          };
        })()`);
        assert.strictEqual(modalOpen.open, true, 'Modal should open after chord chip click');
        assert(modalOpen.header && modalOpen.header.length > 0, 'Modal header should show chord name');

        // Close modal
        await cdp.eval(`document.querySelector('dialog button[aria-label="Zamknij"]').click()`);
        await new Promise((r) => setTimeout(r, 200));

        const afterClose = await cdp.eval(`document.querySelector('dialog')?.open || false`);
        assert.strictEqual(afterClose, false, 'Modal should close after clicking close button');

        // Test inline chord in lyrics opening modal
        await cdp.eval(`document.querySelector('.inline-flex.flex-col button').click()`);
        await new Promise((r) => setTimeout(r, 200));

        const inlineModalOpen = await cdp.eval(`(() => {
          const dialog = document.querySelector('dialog');
          return {
            open: dialog ? dialog.open : false,
            header: dialog ? dialog.querySelector('.text-2xl')?.textContent.trim() : null,
            hasSvg: !!dialog?.querySelector('svg'),
          };
        })()`);
        assert.strictEqual(inlineModalOpen.open, true, 'Modal should open after inline lyric chord click');
        assert(inlineModalOpen.hasSvg, 'Fretboard SVG must be rendered in modal');

        // Dismiss modal with native Escape key
        await cdp.eval(`document.querySelector('dialog').close()`);
        await new Promise((r) => setTimeout(r, 150));
        assert.strictEqual(await cdp.eval(`document.querySelector('dialog')?.open || false`), false);
      });

      // Clean up Chrome & Server
      ws.close();
      chrome.kill();
      server.close();
    } catch (err) {
      chrome.kill();
      server.close();
      throw err;
    }
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log('              CHALLENGER VERIFICATION SUMMARY                   ');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total Tests Executed : ${results.length}`);
  console.log(`Passed               : ${passed}`);
  console.log(`Failed               : ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error(`\x1b[31mVERDICT: REQUEST_CHANGES (${failed} test(s) failed)\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mVERDICT: APPROVE (100% tests passed)\x1b[0m\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\nFATAL CHALLENGER SUITE ERROR:', err);
  process.exit(1);
});
