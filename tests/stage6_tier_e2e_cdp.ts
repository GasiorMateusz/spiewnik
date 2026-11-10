import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunner, assert } from './helpers/test_framework';

const PROD_PORT = 4184;
const CHROME_PORT = 9234;
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

export async function runStage6CdpE2ETests(runner: TestRunner) {
  runner.setTier('Stage 6 — E2E Browser CDP Integration (Headless Chrome)');

  if (!fs.existsSync(CHROME_PATH) || !fs.existsSync('dist/index.html')) {
    console.log('  \x1b[33mℹ Skipping Stage 6 Chrome CDP tests (Chrome or dist/index.html not found)\x1b[0m');
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
      '--window-size=375,812',
      'about:blank',
    ]);

    const { cdp, ws } = await connectToChromePage();

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html#/` });
    await new Promise((r) => setTimeout(r, 1000));

    // E2E-S6.1: Theme toggle synchronization
    await runner.test('E2E-S6.1: Live theme toggle switches HTML dark class and theme-color meta tag', async () => {
      const initialTheme = await cdp.eval(`(() => {
        const isDark = document.documentElement.classList.contains('dark');
        const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
        return { isDark, themeColor };
      })()`);
      assert.strictEqual(initialTheme.isDark, true, 'Default theme must be dark');

      // Click theme switcher button
      await cdp.eval(`(() => {
        const btn = document.querySelector('button[title*="Przełącz na"]');
        if (btn) btn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 200));

      const lightTheme = await cdp.eval(`(() => {
        const isDark = document.documentElement.classList.contains('dark');
        const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
        return { isDark, themeColor };
      })()`);
      assert.strictEqual(lightTheme.isDark, false, 'HTML class must remove dark in light mode');
      assert.strictEqual(lightTheme.themeColor, '#fafafa', 'meta theme-color must update to light color');

      // Toggle back to dark
      await cdp.eval(`(() => {
        const btn = document.querySelector('button[title*="Przełącz na"]');
        if (btn) btn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 200));

      const backToDark = await cdp.eval(`document.documentElement.classList.contains('dark')`);
      assert.strictEqual(backToDark, true, 'HTML class must restore dark');
    });

    // E2E-S6.2: Offline status detection in header
    await runner.test('E2E-S6.2: Emulated offline network displays Offline status badge in header', async () => {
      // Dispatch offline event in window
      await cdp.eval(`window.dispatchEvent(new Event('offline'))`);
      await new Promise((r) => setTimeout(r, 250));

      const offlineStatus = await cdp.eval(`(() => {
        const badge = document.querySelector('[role="status"]');
        const text = badge?.textContent?.trim();
        return { hasBadge: !!badge, text };
      })()`);

      assert.strictEqual(offlineStatus.hasBadge, true, 'Header must display offline badge when offline');
      assert(offlineStatus.text?.includes('Offline'), 'Offline badge must include text "Offline"');

      // Dispatch online event
      await cdp.eval(`window.dispatchEvent(new Event('online'))`);
      await new Promise((r) => setTimeout(r, 250));

      const onlineStatus = await cdp.eval(`!!document.querySelector('[role="status"]')`);
      assert.strictEqual(onlineStatus, false, 'Offline badge must disappear when connection is restored');
    });

    // E2E-S6.3: Toast alert rendering and close dismissal in DOM
    await runner.test('E2E-S6.3: Toast alert renders role="alert" and dismisses on close button click', async () => {
      // Trigger offline event to generate toast
      await cdp.eval(`window.dispatchEvent(new Event('offline'))`);
      await new Promise((r) => setTimeout(r, 200));

      const toastBefore = await cdp.eval(`(() => {
        const alert = document.querySelector('[role="alert"]');
        return { hasAlert: !!alert, text: alert?.textContent };
      })()`);
      assert.strictEqual(toastBefore.hasAlert, true, 'Toast role="alert" must be visible');
      assert(toastBefore.text?.includes('offline'), 'Toast must indicate offline status');

      // Click close button on toast
      await cdp.eval(`(() => {
        const closeBtn = document.querySelector('aside[role="alert"] button[aria-label="Zamknij powiadomienie"]');
        if (closeBtn) closeBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 200));

      const toastAfter = await cdp.eval(`!!document.querySelector('[role="alert"]')`);
      assert.strictEqual(toastAfter, false, 'Toast must disappear after clicking close button');
    });

    // Clean up
    ws.close();
    chrome.kill('SIGTERM');
    if ((server as any).closeAllConnections) {
      (server as any).closeAllConnections();
    }
    await new Promise((r) => server!.close(r));
    server = null;
  } catch (err) {
    if (chrome) chrome.kill('SIGKILL');
    if (server) {
      if ((server as any).closeAllConnections) {
        (server as any).closeAllConnections();
      }
      server.close();
    }
    throw err;
  }
}
