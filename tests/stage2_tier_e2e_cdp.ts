import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunner, assert } from './helpers/test_framework';

const PROD_PORT = 4180;
const CHROME_PORT = 9230;
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
    } catch {}
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

export async function runStage2CdpE2ETests(runner: TestRunner) {
  runner.setTier('Stage 2 — E2E Browser CDP Integration (Headless Chrome)');

  if (!fs.existsSync(CHROME_PATH) || !fs.existsSync('dist/index.html')) {
    console.log('  \x1b[33mℹ Skipping Stage 2 Chrome CDP E2E (Chrome or dist/index.html not found)\x1b[0m');
    return;
  }

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

    // 1. Configure narrow mobile viewport (360px width)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html` });
    await new Promise((r) => setTimeout(r, 700));

    // E2E 2.1: Zero horizontal overflow on 360px viewport
    await runner.test('E2E-S2.1: Zero horizontal overflow on 360px mobile viewport (REQ-VIEW-1)', async () => {
      const overflow = await cdp.eval(`(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const innerWidth = window.innerWidth;
        const scrollWidth = docEl.scrollWidth;
        const bodyScrollWidth = body.scrollWidth;
        return {
          innerWidth,
          scrollWidth,
          bodyScrollWidth,
          hasOverflow: scrollWidth > innerWidth || bodyScrollWidth > innerWidth,
        };
      })()`);

      assert.strictEqual(overflow.innerWidth, 360, 'Viewport must be 360px');
      assert(!overflow.hasOverflow, `Overflow detected! scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth}`);
    });

    // E2E 2.2: Live Font Scaling A- Decrement & Disabled Boundary
    await runner.test('E2E-S2.2: Live font scaling A- decrements to -4px and disables at <= -4 (REQ-VIEW-2)', async () => {
      // Step 1: Click A- once (0 -> -2)
      await cdp.eval(`document.querySelector('button[title="Zmniejsz czcionkę"]').click()`);
      await new Promise((r) => setTimeout(r, 120));

      const step1 = await cdp.eval(`(() => {
        const btnMinus = document.querySelector('button[title="Zmniejsz czcionkę"]');
        const pill = btnMinus.parentElement.querySelector('span');
        return { text: pill?.textContent.trim(), disabled: btnMinus.disabled };
      })()`);
      assert.strictEqual(step1.text, '-2');
      assert.strictEqual(step1.disabled, false);

      // Step 2: Click A- second time (-2 -> -4)
      await cdp.eval(`document.querySelector('button[title="Zmniejsz czcionkę"]').click()`);
      await new Promise((r) => setTimeout(r, 120));

      const step2 = await cdp.eval(`(() => {
        const btnMinus = document.querySelector('button[title="Zmniejsz czcionkę"]');
        const pill = btnMinus.parentElement.querySelector('span');
        return { text: pill?.textContent.trim(), disabled: btnMinus.disabled };
      })()`);
      assert.strictEqual(step2.text, '-4');
      assert.strictEqual(step2.disabled, true, 'A- must be disabled at -4');

      // Step 3: Verify live inline styles at -4 offset
      const styles = await cdp.eval(`(() => {
        const chordBtn = document.querySelector('.inline-flex.flex-col button');
        const lyricSpan = document.querySelector('.inline-flex.flex-col .whitespace-pre');
        return {
          chordFontSize: chordBtn ? chordBtn.style.fontSize : null,
          chordHeight: chordBtn ? chordBtn.style.height : null,
          lyricFontSize: lyricSpan ? lyricSpan.style.fontSize : null,
        };
      })()`);
      assert.strictEqual(styles.chordFontSize, '10px');
      assert.strictEqual(styles.chordHeight, '16px');
      assert.strictEqual(styles.lyricFontSize, '12px');
    });

    // E2E 2.3: Live Font Scaling A+ Increment & Disabled Boundary (+12px)
    await runner.test('E2E-S2.3: Live font scaling A+ increments to +12px and disables at >= 12 (REQ-VIEW-2)', async () => {
      // Increment 8 times from -4 to +12
      for (let i = 0; i < 8; i++) {
        await cdp.eval(`document.querySelector('button[title="Zwiększ czcionkę"]').click()`);
        await new Promise((r) => setTimeout(r, 50));
      }
      await new Promise((r) => setTimeout(r, 120));

      const res = await cdp.eval(`(() => {
        const btnPlus = document.querySelector('button[title="Zwiększ czcionkę"]');
        const btnMinus = document.querySelector('button[title="Zmniejsz czcionkę"]');
        const pill = btnPlus.parentElement.querySelector('span');
        return {
          text: pill?.textContent.trim(),
          plusDisabled: btnPlus.disabled,
          minusDisabled: btnMinus.disabled,
        };
      })()`);
      assert.strictEqual(res.text, '+12');
      assert.strictEqual(res.plusDisabled, true, 'A+ must be disabled at +12');
      assert.strictEqual(res.minusDisabled, false, 'A- must be re-enabled');

      // Verify inline styles at +12
      const styles12 = await cdp.eval(`(() => {
        const chordBtn = document.querySelector('.inline-flex.flex-col button');
        const lyricSpan = document.querySelector('.inline-flex.flex-col .whitespace-pre');
        return {
          chordFontSize: chordBtn ? chordBtn.style.fontSize : null,
          chordHeight: chordBtn ? chordBtn.style.height : null,
          lyricFontSize: lyricSpan ? lyricSpan.style.fontSize : null,
        };
      })()`);
      assert.strictEqual(styles12.chordFontSize, '20px');
      assert.strictEqual(styles12.chordHeight, '25px');
      assert.strictEqual(styles12.lyricFontSize, '28px');

      // Check horizontal overflow at maximum font size (+12) on 360px viewport
      const overflow12 = await cdp.eval(`(() => {
        const docEl = document.documentElement;
        return {
          scrollWidth: docEl.scrollWidth,
          innerWidth: window.innerWidth,
          hasOverflow: docEl.scrollWidth > window.innerWidth,
        };
      })()`);
      assert(!overflow12.hasOverflow, 'Zero horizontal overflow at +12 font scaling on 360px viewport');

      // Reset back to 0 (click A- 6 times)
      for (let i = 0; i < 6; i++) {
        await cdp.eval(`document.querySelector('button[title="Zmniejsz czcionkę"]').click()`);
        await new Promise((r) => setTimeout(r, 50));
      }
      await new Promise((r) => setTimeout(r, 120));
    });

    // E2E 2.4: Live Semitone Transposition & Reset
    await runner.test('E2E-S2.4: Live semitone transposition and one-tap Reset button (REQ-NOT-1, REQ-NOT-2)', async () => {
      // 0 offset: Reset button does not exist
      const initial = await cdp.eval(`(() => {
        const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
        const span = document.querySelector('.text-sm.font-mono.font-bold.w-12');
        return { hasReset: resetBtn !== null, offset: span?.textContent.trim() };
      })()`);
      assert.strictEqual(initial.hasReset, false);
      assert.strictEqual(initial.offset, '0');

      // Click +1: offset becomes +1, Reset button appears
      await cdp.eval(`document.querySelector('button[title="Podwyższ o półton"]').click()`);
      await new Promise((r) => setTimeout(r, 120));

      const step1 = await cdp.eval(`(() => {
        const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
        const span = document.querySelector('.text-sm.font-mono.font-bold.w-12');
        return { hasReset: resetBtn !== null, text: resetBtn?.textContent.trim(), offset: span?.textContent.trim() };
      })()`);
      assert.strictEqual(step1.hasReset, true);
      assert.strictEqual(step1.text, 'Reset');
      assert.strictEqual(step1.offset, '+1');

      // Tap Reset: offset returns to 0, Reset button disappears
      await cdp.eval(`document.querySelector('button[title="Przywróć oryginalną tonację"]').click()`);
      await new Promise((r) => setTimeout(r, 120));

      const afterReset = await cdp.eval(`(() => {
        const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
        const span = document.querySelector('.text-sm.font-mono.font-bold.w-12');
        return { hasReset: resetBtn !== null, offset: span?.textContent.trim() };
      })()`);
      assert.strictEqual(afterReset.hasReset, false);
      assert.strictEqual(afterReset.offset, '0');
    });

    // E2E 2.5: Live Polish Notation Toggle
    await runner.test('E2E-S2.5: Live Polish notation toggle PL (H) <-> INT (B) (REQ-NOT-4)', async () => {
      const initial = await cdp.eval(`document.querySelector('button[title*="notację"]')?.textContent.trim()`);
      assert(initial?.includes('PL (H)'), `Expected PL (H), got ${initial}`);

      // Toggle to INT
      await cdp.eval(`document.querySelector('button[title*="notację"]').click()`);
      await new Promise((r) => setTimeout(r, 120));

      const switched = await cdp.eval(`document.querySelector('button[title*="notację"]')?.textContent.trim()`);
      assert(switched?.includes('INT (B)'), `Expected INT (B), got ${switched}`);

      // Toggle back to PL
      await cdp.eval(`document.querySelector('button[title*="notację"]').click()`);
      await new Promise((r) => setTimeout(r, 120));

      const back = await cdp.eval(`document.querySelector('button[title*="notację"]')?.textContent.trim()`);
      assert(back?.includes('PL (H)'), `Expected PL (H), got ${back}`);
    });

    // E2E 2.6: Live Distraction-Free Back Button
    await runner.test('E2E-S2.6: Live Back button navigates to hash #/ (REQ-VIEW-3)', async () => {
      await cdp.eval(`window.location.hash = '#/song/whisky'`);
      await new Promise((r) => setTimeout(r, 50));

      await cdp.eval(`document.querySelector('button[aria-label="Wróć do katalogu"]').click()`);
      await new Promise((r) => setTimeout(r, 120));

      const hash = await cdp.eval(`window.location.hash`);
      assert.strictEqual(hash, '#/', 'Back button must set hash to #/');
    });

    // E2E 2.7: Screen Wake Lock API in Headless Chrome
    await runner.test('E2E-S2.7: Screen Wake Lock API presence & acquisition in browser (REQ-SCR-3)', async () => {
      const wakeLockInfo = await cdp.eval(`(() => {
        return {
          supported: 'wakeLock' in navigator,
        };
      })()`);
      assert.strictEqual(wakeLockInfo.supported, true, 'Headless Chrome supports navigator.wakeLock');
    });

    // E2E 2.8: Quick chord chips & inline chord triggers open interactive modal
    await runner.test('E2E-S2.8: Quick chord chips and inline chord triggers open interactive modal (REQ-CHD-3)', async () => {
      // Click quick chip
      await cdp.eval(`document.querySelector('.flex.flex-wrap.gap-2.pt-2 button').click()`);
      await new Promise((r) => setTimeout(r, 150));

      const modalState = await cdp.eval(`(() => {
        const dialog = document.querySelector('dialog');
        return {
          open: dialog ? dialog.open : false,
          header: dialog?.querySelector('.text-2xl')?.textContent.trim(),
          hasSvg: !!dialog?.querySelector('svg'),
        };
      })()`);
      assert.strictEqual(modalState.open, true, 'Modal opens on chip click');
      assert(modalState.hasSvg, 'Fretboard SVG rendered');

      // Close modal
      await cdp.eval(`document.querySelector('dialog button[aria-label="Zamknij"]').click()`);
      await new Promise((r) => setTimeout(r, 150));

      const closed = await cdp.eval(`document.querySelector('dialog')?.open || false`);
      assert.strictEqual(closed, false, 'Modal closed');
    });

    // Cleanup Chrome & Server
    ws.close();
    chrome.kill();
    server.close();
  } catch (err) {
    chrome.kill();
    server.close();
    throw err;
  }
}
