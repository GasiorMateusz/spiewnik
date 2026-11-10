import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunner, assert } from './helpers/test_framework';

const PROD_PORT = 4182;
const CHROME_PORT = 9232;
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

export async function runStage3CdpE2ETests(runner: TestRunner) {
  runner.setTier('Stage 3 — E2E Browser CDP Integration (Headless Chrome)');

  if (!fs.existsSync(CHROME_PATH) || !fs.existsSync('dist/index.html')) {
    console.log('  \x1b[33mℹ Skipping Stage 3 Chrome CDP E2E (Chrome or dist/index.html not found)\x1b[0m');
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

    // 1. Emulate mobile viewport (360px x 640px)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html#/song/bieszczadzkie-anioly` });
    await new Promise((r) => setTimeout(r, 700));

    // E2E-S3.1: AutoScroll floating dock rendered on 360px mobile viewport
    await runner.test('E2E-S3.1: AutoScroll floating dock rendered on 360px mobile viewport (REQ-SCR-1)', async () => {
      const dockInfo = await cdp.eval(`(() => {
        const dock = document.querySelector('[aria-label="Panel automatycznego przewijania"]');
        if (!dock) return null;
        const rect = dock.getBoundingClientRect();
        const playBtn = dock.querySelector('button[aria-label="Start"], button[aria-label="Pauza"]');
        const jumpBtn = dock.querySelector('button[aria-label="Wróć na górę"]');
        const slider = dock.querySelector('input[type="range"]');
        const speedText = dock.querySelector('.font-mono')?.textContent?.trim();

        return {
          exists: true,
          role: dock.getAttribute('role'),
          rect: { width: rect.width, height: rect.height, bottom: rect.bottom },
          playBtnRect: playBtn ? playBtn.getBoundingClientRect().width >= 40 && playBtn.getBoundingClientRect().height >= 40 : false,
          jumpBtnRect: jumpBtn ? jumpBtn.getBoundingClientRect().width >= 40 && jumpBtn.getBoundingClientRect().height >= 40 : false,
          sliderValue: slider?.value,
          speedText,
        };
      })()`);

      assert(dockInfo && dockInfo.exists, 'Floating dock must be present in DOM');
      assert.strictEqual(dockInfo.role, 'region', 'Dock must have role="region"');
      assert(dockInfo.playBtnRect, 'Play button must meet >= 40x40px tap target');
      assert(dockInfo.jumpBtnRect, 'Jump-to-top button must meet >= 40x40px tap target');
      assert.strictEqual(dockInfo.sliderValue, '30', 'Default slider value must be 30');
      assert.strictEqual(dockInfo.speedText, '30 px/s', 'Default speed text 30 px/s');
    });

    // E2E-S3.2: Live Play / Pause button toggles auto-scrolling in browser
    await runner.test('E2E-S3.2: Live Play / Pause button toggles auto-scrolling in browser (REQ-SCR-1)', async () => {
      const initialScrollY = await cdp.eval(`window.scrollY`);

      // Click Start button
      await cdp.eval(`document.querySelector('[aria-label="Start"]').click()`);
      await new Promise((r) => setTimeout(r, 80));

      const playingState = await cdp.eval(`(() => {
        const dock = document.querySelector('[aria-label="Panel automatycznego przewijania"]');
        const pauseBtn = dock.querySelector('button[aria-label="Pauza"]');
        return {
          hasPauseBtn: !!pauseBtn,
          text: pauseBtn?.textContent.trim(),
        };
      })()`);
      assert(playingState.hasPauseBtn, 'Button switches to Pauza');
      assert(playingState.text?.includes('Pauza'), 'Button text includes Pauza');

      // Let it scroll for 600ms
      await new Promise((r) => setTimeout(r, 600));

      const scrolledY = await cdp.eval(`window.scrollY`);
      assert(scrolledY > initialScrollY, `Page must scroll downwards: initial=${initialScrollY}, after 600ms=${scrolledY}`);

      // Click Pause button
      await cdp.eval(`document.querySelector('[aria-label="Pauza"]').click()`);
      await new Promise((r) => setTimeout(r, 80));

      const pausedState = await cdp.eval(`(() => {
        const dock = document.querySelector('[aria-label="Panel automatycznego przewijania"]');
        const startBtn = dock.querySelector('button[aria-label="Start"]');
        return {
          hasStartBtn: !!startBtn,
          text: startBtn?.textContent.trim(),
        };
      })()`);
      assert(pausedState.hasStartBtn, 'Button switches back to Start on pause');
    });

    // E2E-S3.3: Dynamic speed slider adjusts scrolling speed live
    await runner.test('E2E-S3.3: Dynamic speed slider adjusts scrolling speed live (REQ-SCR-1)', async () => {
      // Set speed to 90 px/s via native value setter and input/change event
      await cdp.eval(`(() => {
        const dock = document.querySelector('[aria-label="Panel automatycznego przewijania"]');
        const slider = dock.querySelector('input[type="range"][aria-label="Prędkość przewijania"]');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(slider, '90');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await new Promise((r) => setTimeout(r, 60));

      const speedReadout = await cdp.eval(`document.querySelector('[aria-label="Panel automatycznego przewijania"] input[type="range"] + span')?.textContent?.trim()`);
      assert.strictEqual(speedReadout, '90 px/s', 'Speed readout must update to 90 px/s');

      // Reset speed back to 30 for subsequent tests
      await cdp.eval(`(() => {
        const dock = document.querySelector('[aria-label="Panel automatycznego przewijania"]');
        const slider = dock.querySelector('input[type="range"][aria-label="Prędkość przewijania"]');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(slider, '30');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    });

    // E2E-S3.4: Touch gesture triggers interruption and 3-second countdown
    await runner.test('E2E-S3.4: Touch gesture triggers interruption and 3-second countdown badge (REQ-SCR-2)', async () => {
      // Click Start to scroll
      await cdp.eval(`document.querySelector('[aria-label="Start"]').click()`);
      await new Promise((r) => setTimeout(r, 200));

      // Dispatch native pointerdown/touchstart gesture on song lyrics outside dock
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 180, y: 250 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await new Promise((r) => setTimeout(r, 120));

      // Verify interrupted status badge
      const interruptedInfo = await cdp.eval(`(() => {
        const badge = document.querySelector('.animate-pulse');
        const stopBtn = document.querySelector('button[title="Zatrzymaj automatyczne przewijanie"]');
        return {
          hasBadge: !!badge,
          badgeText: badge?.textContent.trim(),
          hasStopBtn: !!stopBtn,
        };
      })()`);

      assert(interruptedInfo.hasBadge, 'Countdown badge must be rendered upon touch interruption');
      assert(interruptedInfo.badgeText?.includes('Wznowienie za'), 'Badge text must show resume countdown');
      assert(interruptedInfo.hasStopBtn, 'Explicit Zatrzymaj button must be present');
    });

    // E2E-S3.5: Auto-resume fires after 3 seconds of user inactivity
    await runner.test('E2E-S3.5: Auto-resume fires after 3 seconds of inactivity (REQ-SCR-2)', async () => {
      // Wait for 3.3 seconds without touching screen
      await new Promise((r) => setTimeout(r, 3300));

      const resumedInfo = await cdp.eval(`(() => {
        const badge = document.querySelector('.animate-pulse');
        const pauseBtn = document.querySelector('[aria-label="Panel automatycznego przewijania"] button[aria-label="Pauza"]');
        return {
          badgeGone: !badge,
          isScrolling: !!pauseBtn,
        };
      })()`);

      assert(resumedInfo.badgeGone, 'Countdown badge must disappear after auto-resume');
      assert(resumedInfo.isScrolling, 'AutoScroll must return to scrolling state (Pauza button visible)');

      // Pause scrolling for clean state
      await cdp.eval(`document.querySelector('[aria-label="Panel automatycznego przewijania"] button[aria-label="Pauza"]').click()`);
      await new Promise((r) => setTimeout(r, 50));
    });

    // E2E-S3.6: Dock control event isolation prevents touch interruption
    await runner.test('E2E-S3.6: Dock control event isolation prevents touch interruption (REQ-SCR-2)', async () => {
      // Start scrolling
      await cdp.eval(`document.querySelector('[aria-label="Start"]').click()`);
      await new Promise((r) => setTimeout(r, 100));

      // Dispatch pointerdown / touch directly inside the dock element
      await cdp.eval(`(() => {
        const slider = document.querySelector('input[type="range"]');
        slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      })()`);
      await new Promise((r) => setTimeout(r, 100));

      const isStillScrolling = await cdp.eval(`(() => {
        const badge = document.querySelector('.animate-pulse');
        const pauseBtn = document.querySelector('[aria-label="Panel automatycznego przewijania"] button[aria-label="Pauza"]');
        return !badge && !!pauseBtn;
      })()`);

      assert(isStillScrolling, 'Dock touch must be isolated and not trigger interruption');

      // Pause scrolling
      await cdp.eval(`document.querySelector('[aria-label="Panel automatycznego przewijania"] button[aria-label="Pauza"]').click()`);
      await new Promise((r) => setTimeout(r, 50));
    });

    // E2E-S3.7: Jump-to-Top button resets window scroll position to 0
    await runner.test('E2E-S3.7: Jump-to-Top button resets window scroll position to 0 smoothly (REQ-SCR-1)', async () => {
      // Scroll down to 200px
      await cdp.eval(`window.scrollTo(0, 200)`);
      await new Promise((r) => setTimeout(r, 50));

      const beforeScroll = await cdp.eval(`window.scrollY`);
      assert(beforeScroll > 50, 'Page is scrolled down');

      // Click Jump-to-top button
      await cdp.eval(`document.querySelector('button[aria-label="Wróć na górę"]').click()`);
      await new Promise((r) => setTimeout(r, 350));

      const afterScroll = await cdp.eval(`window.scrollY`);
      assert.strictEqual(afterScroll, 0, 'Scroll position must be reset to 0');
    });

    // E2E-S3.8: Automatic clean stop at bottom of song content
    await runner.test('E2E-S3.8: Automatic clean stop at bottom of song content (REQ-SCR-1)', async () => {
      // Scroll to 10px before bottom
      await cdp.eval(`(() => {
        const doc = document.documentElement;
        const maxScroll = doc.scrollHeight - window.innerHeight;
        window.scrollTo(0, maxScroll - 6);
      })()`);
      await new Promise((r) => setTimeout(r, 50));

      // Click Start
      await cdp.eval(`document.querySelector('[aria-label="Start"]').click()`);
      // Wait for scrolling to reach bottom (< 2px remaining) and auto-stop
      await new Promise((r) => setTimeout(r, 500));

      const endState = await cdp.eval(`(() => {
        const dock = document.querySelector('[aria-label="Panel automatycznego przewijania"]');
        const startBtn = dock.querySelector('button[aria-label="Start"]');
        const pauseBtn = dock.querySelector('button[aria-label="Pauza"]');
        return {
          isIdle: !!startBtn && !pauseBtn,
        };
      })()`);

      assert(endState.isIdle, 'Scrolling automatically stops at bottom and transitions to idle');
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
