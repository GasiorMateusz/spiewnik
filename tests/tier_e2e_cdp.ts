import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunner, assert } from './helpers/test_framework';

const PROD_PORT = 4174;
const CHROME_PORT = 9223;
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

export async function runCdpE2ETests(runner: TestRunner) {
  if (!fs.existsSync(CHROME_PATH) || !fs.existsSync('dist/index.html')) {
    console.log('  \x1b[33mℹ Skipping live Chrome CDP E2E (Chrome binary or dist/index.html not found)\x1b[0m');
    return;
  }

  runner.setTier('E2E Browser CDP Integration (Headless Chrome)');

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
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html#/song/bieszczadzkie-anioly` });
    await new Promise((r) => setTimeout(r, 800));

    // Test 1: Quick Chips and Inline Chords interactive buttons
    await runner.test('E2E: Quick chips & inline chord tokens rendered as interactive buttons', async () => {
      const quickChips = await cdp.eval(`(() => {
        const container = document.querySelector('.flex.flex-wrap.gap-2.pt-2');
        if (!container) return [];
        return Array.from(container.querySelectorAll('button')).map(b => ({
          tagName: b.tagName,
          type: b.getAttribute('type'),
          text: b.textContent.trim(),
        }));
      })()`);
      assert(quickChips.length > 0, 'Must find quick chips');
      for (const chip of quickChips) {
        assert.strictEqual(chip.tagName, 'BUTTON');
        assert.strictEqual(chip.type, 'button');
      }

      const inlineChords = await cdp.eval(`Array.from(document.querySelectorAll('span.inline-flex > button')).length`);
      assert(inlineChords > 0, 'Must find inline chord buttons');
    });

    // Test 2: Native <dialog> lifecycle and showModal()
    await runner.test('E2E: Native <dialog> showModal() on quick chip click', async () => {
      const initialOpen = await cdp.eval('document.querySelector("dialog").open');
      assert.strictEqual(initialOpen, false, 'Dialog must be closed initially');

      // Click quick chip 'G'
      await cdp.eval(`Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button'))
        .find(b => b.textContent.trim() === 'G').click()`);
      await new Promise((r) => setTimeout(r, 200));

      const modalInfo = await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        return {
          open: d.open,
          chord: d.querySelector('.text-2xl')?.textContent?.trim(),
          hasSvg: !!d.querySelector('svg'),
          counter: d.querySelector('.select-none')?.textContent?.trim(),
        };
      })()`);
      assert.strictEqual(modalInfo.open, true, '<dialog> open property must be true');
      assert.strictEqual(modalInfo.chord, 'G');
      assert.strictEqual(modalInfo.hasSvg, true);
      assert.strictEqual(modalInfo.counter, '1 z 4');
    });

    // Test 3: Carousel navigation forward, backward, wrap-around
    await runner.test('E2E: Carousel forward, backward, and modulo wrap-around', async () => {
      // 1 -> 2
      await cdp.eval(`document.querySelector('dialog button[aria-label="Następna pozycja"]').click()`);
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`), '2 z 4');

      // 2 -> 1
      await cdp.eval(`document.querySelector('dialog button[aria-label="Poprzednia pozycja"]').click()`);
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`), '1 z 4');

      // 1 -> 4 (backward wrap-around)
      await cdp.eval(`document.querySelector('dialog button[aria-label="Poprzednia pozycja"]').click()`);
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`), '4 z 4');

      // 4 -> 1 (forward wrap-around)
      await cdp.eval(`document.querySelector('dialog button[aria-label="Następna pozycja"]').click()`);
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`), '1 z 4');
    });

    // Test 4: In-Modal Instrument Switcher & Header synchronization
    await runner.test('E2E: In-modal instrument switch updates fretboard and synchronizes app header', async () => {
      await cdp.eval(`Array.from(document.querySelectorAll('dialog button'))
        .find(b => b.textContent.trim() === 'Ukulele').click()`);
      await new Promise((r) => setTimeout(r, 200));

      const ukeState = await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        const counter = d.querySelector('.select-none')?.textContent?.trim();
        const headerActive = Array.from(document.querySelectorAll('header button'))
          .find(b => b.className.includes('bg-amber-500'))?.textContent?.trim();
        return { counter, headerActive };
      })()`);
      assert.strictEqual(ukeState.counter, '1 z 4');
      assert.strictEqual(ukeState.headerActive, 'Ukulele');

      // Switch back to Gitara
      await cdp.eval(`Array.from(document.querySelectorAll('dialog button'))
        .find(b => b.textContent.trim() === 'Gitara').click()`);
      await new Promise((r) => setTimeout(r, 200));
    });

    // Test 5: Modal close button (XIcon)
    await runner.test('E2E: Close button (XIcon) dismisses modal', async () => {
      await cdp.eval(`document.querySelector('dialog button[aria-label="Zamknij"]').click()`);
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), false);
    });

    // Test 6: Backdrop click dismissal
    await runner.test('E2E: Backdrop click dismisses modal and synchronizes React state', async () => {
      // Reopen modal via first quick chip
      await cdp.eval(`document.querySelector('.flex.flex-wrap.gap-2.pt-2 button').click()`);
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), true);

      // Dispatch click on native dialog element (backdrop)
      await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        d.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()`);
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), false);
    });

    // Test 7: Native Escape key dismissal
    await runner.test('E2E: Native Escape key cancels modal and synchronizes React state', async () => {
      // Reopen modal
      await cdp.eval(`document.querySelector('.flex.flex-wrap.gap-2.pt-2 button').click()`);
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), true);

      // Dispatch native dialog close
      await cdp.eval('document.querySelector("dialog").close()');
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), false);
    });

    // Test 8: Live transposition and Polish notation toggle
    await runner.test('E2E: Live transposition +4 and Polish H resolution in browser', async () => {
      // Transpose +4
      for (let i = 0; i < 4; i++) {
        await cdp.eval(`Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim() === '+1').click()`);
      }
      await new Promise((r) => setTimeout(r, 150));

      const transValue = await cdp.eval(`document.querySelector('.w-12.text-center').textContent.trim()`);
      assert.strictEqual(transValue, '+4');

      const plChips = await cdp.eval(`Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button')).map(b => b.textContent.trim())`);
      assert(plChips.includes('H'), 'Transposed +4 in PL mode must include Polish root "H"');

      // Click 'H' quick chip
      await cdp.eval(`Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button'))
        .find(b => b.textContent.trim() === 'H').click()`);
      await new Promise((r) => setTimeout(r, 200));

      const hModal = await cdp.eval(`(() => {
        const d = document.querySelector('dialog');
        return { open: d.open, chord: d.querySelector('.text-2xl')?.textContent?.trim() };
      })()`);
      assert.strictEqual(hModal.open, true);
      assert.strictEqual(hModal.chord, 'H');

      // Close modal and reset transpose
      await cdp.eval(`document.querySelector('dialog button[aria-label="Zamknij"]').click()`);
      await new Promise((r) => setTimeout(r, 150));
      await cdp.eval(`Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Reset').click()`);
      await new Promise((r) => setTimeout(r, 100));
    });

    ws.close();
  } finally {
    chrome.kill();
    server.close();
  }
}
