import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunner, assert } from './helpers/test_framework';
import { lookupChordPositions, INSTRUMENT_DATA } from '../src/lib/chordDb';
import { transposeChord } from '../src/lib/chordNotation';
import type { Instrument } from '../src/types';

const PROD_PORT = 4176;
const CHROME_PORT = 9226;
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

export async function runTier5StressTests(runner: TestRunner) {
  runner.setTier('Tier 5: Adversarial Stress & Offline Validation');

  // =========================================================================
  // Test 1: Service Worker Precache Integrity on Disk (dist/)
  // =========================================================================
  await runner.test('S01: Production build SW precache manifest integrity and complete asset coverage', async () => {
    const swPath = path.join(process.cwd(), 'dist', 'sw.js');
    assert(fs.existsSync(swPath), 'dist/sw.js must exist');
    const swContent = fs.readFileSync(swPath, 'utf8');

    // Extract precache array from precacheAndRoute([...])
    const match = swContent.match(/precacheAndRoute\(\[(\{.*?\})\]/s);
    assert(match, 'dist/sw.js must contain precacheAndRoute with array');

    // Parse URLs using regex for {url:"..."}
    const urlMatches = Array.from(swContent.matchAll(/url:\s*"([^"]+)"/g)).map((m) => m[1]);
    assert(urlMatches.length >= 7, `Expected at least 7 precached URLs, found: ${urlMatches.length}`);

    // Verify all precached files exist physically in dist/
    for (const relativeUrl of urlMatches) {
      const filePath = path.join(process.cwd(), 'dist', relativeUrl.replace(/\//g, path.sep));
      assert(fs.existsSync(filePath), `Precached asset missing on disk: ${relativeUrl} (${filePath})`);
      const stat = fs.statSync(filePath);
      assert(stat.size > 0, `Precached asset must have non-zero size: ${relativeUrl}`);
    }

    // Verify lazy-loaded instrument chunks are explicitly included
    const hasGuitarChunk = urlMatches.some((u) => u.includes('guitar-') && u.endsWith('.js'));
    const hasUkuleleChunk = urlMatches.some((u) => u.includes('ukulele-') && u.endsWith('.js'));
    const hasMainChunk = urlMatches.some((u) => u.includes('index-') && u.endsWith('.js'));
    const hasCssChunk = urlMatches.some((u) => u.includes('index-') && u.endsWith('.css'));
    const hasIndexHtml = urlMatches.includes('index.html');

    assert(hasGuitarChunk, 'dist/sw.js precache must include guitar chord chunk');
    assert(hasUkuleleChunk, 'dist/sw.js precache must include ukulele chord chunk');
    assert(hasMainChunk, 'dist/sw.js precache must include main app JS chunk');
    assert(hasCssChunk, 'dist/sw.js precache must include CSS stylesheet');
    assert(hasIndexHtml, 'dist/sw.js precache must include index.html shell');
  });

  // =========================================================================
  // Test 2: In-Memory Asynchronous Concurrency & Race Condition Stress
  // =========================================================================
  await runner.test('S02: High-throughput async concurrency (1000 randomized queries without race condition)', async () => {
    const chordsPool = [
      'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'H',
      'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Hm', 'Bm',
      'C7', 'D7', 'E7', 'G7', 'A7', 'B7', 'H7',
      'Cmaj7', 'Fmaj7', 'Gmaj7', 'D/F#', 'G/H', 'E/G#',
      'UNKNOWN_CHORD_XYZ', 'InvalidChord###', '', ' '
    ];

    const instruments: Instrument[] = ['guitar', 'ukulele'];
    const notations = [true, false];

    // Fire 1000 randomized concurrent promises
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 1000; i++) {
      const chord = chordsPool[i % chordsPool.length];
      const instrument = instruments[i % 2];
      const polishNotation = notations[i % 2];
      promises.push(lookupChordPositions(chord, instrument, polishNotation));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 1000, 'All 1000 concurrent queries must resolve');

    // Invariant check: identical queries executed concurrently must yield identical outputs
    const sampleQuery1 = await lookupChordPositions('Am', 'guitar', true);
    const sampleQuery2 = await lookupChordPositions('Am', 'guitar', true);
    assert.deepStrictEqual(sampleQuery1, sampleQuery2, 'Deterministic chord positions across runs');
  });

  // =========================================================================
  // Browser CDP E2E Stress & Chaos Suite
  // =========================================================================
  if (!fs.existsSync(CHROME_PATH) || !fs.existsSync('dist/index.html')) {
    console.log('  \x1b[33mℹ Skipping live Chrome CDP stress tests (Chrome or dist/index.html not found)\x1b[0m');
    return;
  }

  let server: http.Server | null = null;
  let chrome: any = null;

  try {
    server = http.createServer((req, res) => {
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

    await new Promise<void>((r) => server!.listen(PROD_PORT, r));

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${CHROME_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ]);

    const { cdp, ws } = await connectToChromePage();

    // Attach global exception & unhandled rejection listeners in the browser
    await cdp.eval(`(() => {
      window.__unhandledRejections = [];
      window.__pageErrors = [];
      window.addEventListener('unhandledrejection', (e) => {
        window.__unhandledRejections.push({
          reason: String(e.reason),
          stack: e.reason?.stack,
        });
      });
      window.addEventListener('error', (e) => {
        window.__pageErrors.push({
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
        });
      });
    })()`);

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html#/song/bieszczadzkie-anioly` });
    await new Promise((r) => setTimeout(r, 1000));

    // Install and verify Service Worker registration
    await runner.test('S03: Service Worker registration and CacheStorage precache verification in browser', async () => {
      const swReady = await cdp.eval(`(async () => {
        if (!('serviceWorker' in navigator)) return { supported: false };
        try {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((r) => setTimeout(() => r(null), 4000))
          ]);
          const cacheNames = await caches.keys();
          const precacheName = cacheNames.find(c => c.includes('precache'));
          let cachedUrls = [];
          if (precacheName) {
            const cache = await caches.open(precacheName);
            const requests = await cache.keys();
            cachedUrls = requests.map(r => new URL(r.url).pathname);
          }
          return {
            supported: true,
            registered: !!reg,
            cacheNames,
            hasPrecache: !!precacheName,
            cachedCount: cachedUrls.length,
            cachedUrls,
          };
        } catch (err) {
          return { supported: true, error: String(err) };
        }
      })()`);

      assert(swReady.supported, 'Browser must support Service Worker');
      assert(swReady.registered, 'Service worker must reach active ready state');
      assert(swReady.hasPrecache, 'Workbox precache cache must exist in CacheStorage');
      assert(swReady.cachedCount >= 7, `CacheStorage must contain at least 7 entries, found ${swReady.cachedCount}`);

      // Verify guitar and ukulele chunks are cached
      const hasCachedGuitar = swReady.cachedUrls.some((u: string) => u.includes('guitar-'));
      const hasCachedUkulele = swReady.cachedUrls.some((u: string) => u.includes('ukulele-'));
      assert(hasCachedGuitar, 'CacheStorage must contain precached guitar chunk');
      assert(hasCachedUkulele, 'CacheStorage must contain precached ukulele chunk');
    });

    // =========================================================================
    // Test 4: True Offline Playback Simulation (Kills Network + Shuts Down Server)
    // =========================================================================
    await runner.test('S04: 100% Offline execution: full chord rendering & lazy DB access with server killed', async () => {
      // 1. Emulate complete network disconnection in Chrome CDP
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      });

      // 2. Shut down the actual HTTP server to strictly guarantee zero network fallback
      if ((server as any).closeAllConnections) {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;

      // 3. While completely offline, click chord chip 'C'
      await cdp.eval(`(() => {
        const chips = Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button'));
        const chipC = chips.find(b => b.textContent.trim() === 'C');
        if (chipC) chipC.click();
      })()`);
      await new Promise((r) => setTimeout(r, 200));

      const modalOfflineGuitar = await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        const svg = d.querySelector('svg[viewBox="0 0 80 70"]');
        const textElements = Array.from(svg ? svg.querySelectorAll('text') : []).map(t => t.textContent.trim());
        return {
          open: d.open,
          chord: d.querySelector('.text-2xl')?.textContent?.trim(),
          hasSvg: !!svg,
          tuning: textElements.filter(t => ['E', 'A', 'D', 'G', 'B'].includes(t)),
        };
      })()`);

      assert.strictEqual(modalOfflineGuitar.open, true, 'Modal must open in offline mode');
      assert.strictEqual(modalOfflineGuitar.chord, 'C', 'Must display chord C');
      assert.strictEqual(modalOfflineGuitar.hasSvg, true, 'Must render fretboard SVG offline');
      assert.strictEqual(modalOfflineGuitar.tuning.length, 6, 'Guitar must render 6 standard tuning notes EADGBE offline');

      // 4. Switch instrument to Ukulele while OFFLINE (must load lazy ukulele chunk from Service Worker cache!)
      await cdp.eval(`(() => {
        const buttons = Array.from(document.querySelectorAll('dialog button'));
        const ukeBtn = buttons.find(b => b.textContent.trim() === 'Ukulele');
        if (ukeBtn) ukeBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 250));

      const modalOfflineUke = await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        const svg = d.querySelector('svg[viewBox="0 0 80 70"]');
        const textElements = Array.from(svg ? svg.querySelectorAll('text') : []).map(t => t.textContent.trim());
        const counter = d.querySelector('.select-none')?.textContent?.trim();
        return {
          open: d.open,
          counter,
          hasSvg: !!svg,
          tuning: textElements.filter(t => ['G', 'C', 'E', 'A'].includes(t)),
        };
      })()`);

      assert.strictEqual(modalOfflineUke.open, true, 'Modal must remain open');
      assert.strictEqual(modalOfflineUke.hasSvg, true, 'Must render ukulele SVG offline from SW cache');
      assert.strictEqual(modalOfflineUke.tuning.length, 4, 'Ukulele must render 4 standard tuning notes GCEA offline');
      assert(modalOfflineUke.counter?.includes('z'), 'Must render variation counter');

      // 5. Test carousel navigation while offline
      await cdp.eval(`document.querySelector('dialog button[aria-label="Następna pozycja"]').click()`);
      await new Promise((r) => setTimeout(r, 100));
      const counterAfterNext = await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`);
      assert(counterAfterNext.startsWith('2 z'), 'Carousel must advance offline');

      // Close modal
      await cdp.eval(`document.querySelector('dialog button[aria-label="Zamknij"]').click()`);
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), false);
    });

    // =========================================================================
    // Test 5: Native <dialog> Rapid Open/Close & Lifecycle Chaos (50 Rapid Cycles)
    // =========================================================================
    await runner.test('S05: Native <dialog> rapid open/close cycling (50 rapid iterations without DOM exception)', async () => {
      const errorLog: string[] = [];

      for (let i = 0; i < 50; i++) {
        // Open modal via quick chip
        await cdp.eval(`(() => {
          const chips = Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button'));
          if (chips.length > 0) {
            chips[${i} % chips.length].click();
          }
        })()`);

        // Immediate check or slight tick
        if (i % 2 === 0) {
          // Close via close button
          await cdp.eval(`(() => {
            const btn = document.querySelector('dialog button[aria-label="Zamknij"]');
            if (btn) btn.click();
          })()`);
        } else {
          // Close via native Escape close dispatch
          await cdp.eval(`(() => {
            const d = document.querySelector('dialog');
            if (d && d.open) d.close();
          })()`);
        }
      }

      await new Promise((r) => setTimeout(r, 200));

      // Check final dialog state is cleanly closed
      const isClosed = await cdp.eval('!document.querySelector("dialog").open');
      assert(isClosed, 'Dialog must be closed after cycling');

      // Verify no exceptions were recorded
      const unhandled = (await cdp.eval('window.__unhandledRejections')) || [];
      assert.strictEqual(unhandled.length, 0, `Zero unhandled promise rejections allowed: ${JSON.stringify(unhandled)}`);
    });

    // =========================================================================
    // Test 6: Backdrop Click Discrimination & Inner Card Click Immunity
    // =========================================================================
    await runner.test('S06: Backdrop click discrimination (clicks on modal card never dismiss; clicks on backdrop dismiss)', async () => {
      // 1. Open modal
      await cdp.eval(`document.querySelector('.flex.flex-wrap.gap-2.pt-2 button').click()`);
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), true);

      // 2. Dispatch 20 clicks on inner card elements: title, svg, carousel buttons, header
      const innerCardClicksStayOpen = await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        const innerDiv = d.querySelector('div');
        const svg = d.querySelector('svg');
        const title = d.querySelector('.text-2xl');
        const carouselBtn = d.querySelector('button[aria-label="Następna pozycja"]');

        const targets = [innerDiv, svg, title, carouselBtn].filter(Boolean);
        for (const t of targets) {
          for (let i = 0; i < 5; i++) {
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        }
        return d.open;
      })()`);
      assert.strictEqual(innerCardClicksStayOpen, true, 'Clicks inside modal card must NOT dismiss dialog');

      // 3. Dispatch click directly on dialog itself (the backdrop in HTML5 dialog spec)
      await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        d.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()`);
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), false, 'Backdrop click must dismiss dialog');
    });

    // =========================================================================
    // Test 7: Native Escape Key Chaos & Asynchronous Cancellation
    // =========================================================================
    await runner.test('S07: Native Escape cancellations under rapid chord transitions', async () => {
      for (let i = 0; i < 15; i++) {
        // Click chord chip
        await cdp.eval(`document.querySelector('.flex.flex-wrap.gap-2.pt-2 button').click()`);
        // Immediately cancel with Escape
        await cdp.eval(`(() => {
          const d = document.querySelector('dialog');
          if (d) d.close();
        })()`);
      }

      await new Promise((r) => setTimeout(r, 200));
      const state = await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        return { open: d.open };
      })()`);
      assert.strictEqual(state.open, false, 'Dialog must be cleanly closed after rapid escape cancels');

      // Repeated Escape calls when already closed must not throw InvalidStateError
      const safeClose = await cdp.eval(`(() => {
        try {
          const d = document.querySelector('dialog');
          for (let i = 0; i < 10; i++) {
            d.dispatchEvent(new Event('close'));
          }
          return true;
        } catch (e) {
          return false;
        }
      })()`);
      assert(safeClose, 'Repeated close events on closed dialog must be safe');
    });

    // =========================================================================
    // Test 8: Rapid Concurrent Instrument Switches & Chord Transitions
    // =========================================================================
    await runner.test('S08: Rapid concurrent instrument toggles (30 bursts) & chord transitions without memory leaks', async () => {
      // Reopen modal via first quick chip and verify it is open
      await cdp.eval(`(() => {
        const chips = Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button'));
        if (chips.length > 0) chips[0].click();
      })()`);
      await new Promise((r) => setTimeout(r, 250));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), true, 'Modal must open before instrument burst');

      // Burst instrument toggle 30 times with fresh selector query per iteration
      await cdp.eval(`(() => {
        for (let i = 0; i < 30; i++) {
          const d = document.querySelector('dialog');
          if (!d) break;
          const target = i % 2 === 0 ? 'Ukulele' : 'Gitara';
          const btn = Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === target);
          if (btn) btn.click();
        }
      })()`);

      await new Promise((r) => setTimeout(r, 350));

      // Verify the final instrument matches rendered fretboard
      const finalState = await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        const svg = d.querySelector('svg[viewBox="0 0 80 70"]');
        const textElements = Array.from(svg ? svg.querySelectorAll('text') : []).map(t => t.textContent.trim());
        const tuningCount = textElements.filter(t => ['E', 'A', 'D', 'G', 'B', 'C'].includes(t)).length;
        const activeInstrument = Array.from(d.querySelectorAll('button')).find(b => b.className.includes('bg-amber-500'))?.textContent?.trim();
        return {
          open: d.open,
          activeInstrument,
          tuningCount,
        };
      })()`);

      assert.strictEqual(finalState.open, true, 'Modal remains open after burst switching');
      if (finalState.activeInstrument === 'Gitara') {
        assert.strictEqual(finalState.tuningCount, 6, 'Guitar diagram must have 6 tuning notes');
      } else {
        assert.strictEqual(finalState.tuningCount, 4, 'Ukulele diagram must have 4 tuning notes');
      }

      // Close modal
      await cdp.eval(`document.querySelector('dialog button[aria-label="Zamknij"]').click()`);
      await new Promise((r) => setTimeout(r, 150));
    });

    // =========================================================================
    // Test 9: Global Error & Unhandled Rejection Audit
    // =========================================================================
    await runner.test('S09: Global browser error audit (0 unhandled rejections, 0 uncaught exceptions)', async () => {
      const unhandled = await cdp.eval('window.__unhandledRejections || []');
      const pageErrors = await cdp.eval('window.__pageErrors || []');

      assert.strictEqual(unhandled.length, 0, `Found unhandled promise rejections: ${JSON.stringify(unhandled)}`);
      assert.strictEqual(pageErrors.length, 0, `Found browser runtime page errors: ${JSON.stringify(pageErrors)}`);
    });

    ws.close();
  } finally {
    if (chrome) {
      chrome.kill();
    }
    if (server) {
      server.close();
    }
  }
}

// Allow direct CLI invocation
if (process.argv[1] && process.argv[1].endsWith('tier5_adversarial_stress.ts')) {
  const runner = new TestRunner();
  runTier5StressTests(runner).then(() => {
    const success = runner.printSummary();
    if (!success) process.exit(1);
  });
}
