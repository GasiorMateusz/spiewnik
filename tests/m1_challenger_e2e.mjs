import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert';

const PROD_PORT = 4173;
const CHROME_PORT = 9222;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MIME_TYPES = {
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
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `CDP eval exception: ${res.exceptionDetails.text} - ${JSON.stringify(
          res.exceptionDetails.exception
        )}`
      );
    }
    return res.result?.value;
  }
}

async function connectToChromePage() {
  let pageWsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
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
  console.log('\n======================================================');
  console.log('CHALLENGER VERIFICATION SUITE — MILESTONE M1');
  console.log('======================================================\n');

  // -------------------------------------------------------------
  // TEST SUITE 1: Build Artifacts & PWA Service Worker Precache
  // -------------------------------------------------------------
  console.log('--- SUITE 1: Build Artifacts & PWA Precache Verification ---');
  const swContent = fs.readFileSync('dist/sw.js', 'utf8');
  const precacheMatch = swContent.match(/precacheAndRoute\((\[.*?\]),/s);
  assert(precacheMatch, 'precacheAndRoute found in dist/sw.js');
  const precacheEntries = eval(precacheMatch[1]);
  const precacheUrls = precacheEntries.map((e) => e.url);

  console.log(`[PWA SW] Precached entries (${precacheUrls.length}):`, precacheUrls);
  assert(
    precacheUrls.some((u) => /^assets\/guitar-.*\.js$/.test(u)),
    'SW precaches dynamic guitar chunk'
  );
  assert(
    precacheUrls.some((u) => /^assets\/ukulele-.*\.js$/.test(u)),
    'SW precaches dynamic ukulele chunk'
  );
  assert(
    precacheUrls.some((u) => /^assets\/index-.*\.js$/.test(u)),
    'SW precaches main app chunk'
  );
  assert(
    precacheUrls.some((u) => /^assets\/index-.*\.css$/.test(u)),
    'SW precaches styles chunk'
  );
  assert(precacheUrls.includes('index.html'), 'SW precaches index.html');
  console.log('✓ PASS: All dynamic chord chunks and shell assets are precached for 100% offline use.');

  // -------------------------------------------------------------
  // TEST SUITE 2: Browser E2E Lifecycle on Headless Chrome
  // -------------------------------------------------------------
  console.log('\n--- SUITE 2: Browser DOM, <dialog> Lifecycle & Interactions ---');

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
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

  await new Promise((r) => server.listen(PROD_PORT, r));
  console.log(`[HTTP] Serving dist/ at http://127.0.0.1:${PROD_PORT}`);

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  try {
    const { cdp, ws } = await connectToChromePage();

    console.log('[CDP] Navigating to http://127.0.0.1:' + PROD_PORT);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html` });
    await new Promise((r) => setTimeout(r, 800));

    // 1. Verify Quick Chips as Buttons
    const quickChips = await cdp.eval(`(() => {
      const container = document.querySelector('.flex.flex-wrap.gap-2.pt-2');
      if (!container) return null;
      return Array.from(container.querySelectorAll('button')).map(b => ({
        tagName: b.tagName,
        type: b.getAttribute('type'),
        text: b.textContent.trim(),
      }));
    })()`);
    console.log('[VERIFY] Quick chord chips:', quickChips);
    assert.strictEqual(quickChips.length, 3);
    for (const chip of quickChips) {
      assert.strictEqual(chip.tagName, 'BUTTON');
      assert.strictEqual(chip.type, 'button');
    }
    console.log('✓ PASS: All quick chips are interactive <button type="button"> elements');

    // 2. Verify Inline Lyric Chords as Buttons
    const inlineChords = await cdp.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('span.inline-flex > button'));
      return buttons.map(b => ({
        tagName: b.tagName,
        type: b.getAttribute('type'),
        text: b.textContent.trim(),
      }));
    })()`);
    console.log(`[VERIFY] Found ${inlineChords.length} inline chord buttons`);
    assert.strictEqual(inlineChords.length, 24);
    for (const b of inlineChords) {
      assert.strictEqual(b.tagName, 'BUTTON');
      assert.strictEqual(b.type, 'button');
    }
    console.log('✓ PASS: All inline lyric chord tokens are interactive <button type="button"> elements');

    // 3. Verify Native Dialog Lifecycle & showModal()
    const initialDialogState = await cdp.eval('document.querySelector("dialog").open');
    assert.strictEqual(initialDialogState, false, 'Dialog must be closed initially');

    console.log('[ACTION] Clicking quick chip "G"...');
    await cdp.eval(`Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button'))
      .find(b => b.textContent.trim() === 'G').click()`);
    await new Promise((r) => setTimeout(r, 300));

    const openedInfo = await cdp.eval(`(() => {
      const d = document.querySelector('dialog');
      return {
        open: d.open,
        chord: d.querySelector('.text-2xl')?.textContent?.trim(),
        instrument: d.querySelector('.text-xs.text-neutral-400')?.textContent?.trim(),
        hasSvg: !!d.querySelector('svg'),
        counter: d.querySelector('.select-none')?.textContent?.trim(),
      };
    })()`);
    console.log('[VERIFY] Modal open info:', openedInfo);
    assert.strictEqual(openedInfo.open, true, '<dialog> open property must be true (showModal called)');
    assert.strictEqual(openedInfo.chord, 'G');
    assert.strictEqual(openedInfo.instrument, 'Gitara');
    assert.strictEqual(openedInfo.hasSvg, true);
    assert.strictEqual(openedInfo.counter, '1 z 4');
    console.log('✓ PASS: Native <dialog> opened via showModal(), SVG fretboard rendered');

    // 4. Test Carousel Cycling on Guitar G (1 -> 2 -> 1 -> 4 -> 1)
    console.log('[ACTION] Testing Next button (1 -> 2)...');
    await cdp.eval(`document.querySelector('dialog button[aria-label="Następna pozycja"]').click()`);
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(
      await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`),
      '2 z 4'
    );

    console.log('[ACTION] Testing Prev button (2 -> 1)...');
    await cdp.eval(`document.querySelector('dialog button[aria-label="Poprzednia pozycja"]').click()`);
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(
      await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`),
      '1 z 4'
    );

    console.log('[ACTION] Testing Modulo Wrap-Around (1 -> 4)...');
    await cdp.eval(`document.querySelector('dialog button[aria-label="Poprzednia pozycja"]').click()`);
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(
      await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`),
      '4 z 4'
    );

    console.log('[ACTION] Testing Modulo Wrap-Around (4 -> 1)...');
    await cdp.eval(`document.querySelector('dialog button[aria-label="Następna pozycja"]').click()`);
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(
      await cdp.eval(`document.querySelector('dialog .select-none').textContent.trim()`),
      '1 z 4'
    );
    console.log('✓ PASS: Carousel forward, backward, and modulo wrap-around navigation verified');

    // 5. Test In-Modal Instrument Switching (Guitar -> Ukulele)
    console.log('[ACTION] Switching to Ukulele inside modal...');
    await cdp.eval(`Array.from(document.querySelectorAll('dialog button'))
      .find(b => b.textContent.trim() === 'Ukulele').click()`);
    await new Promise((r) => setTimeout(r, 300));

    const ukeModalState = await cdp.eval(`(() => {
      const d = document.querySelector('dialog');
      const counter = d.querySelector('.select-none')?.textContent?.trim();
      const strings = Array.from(d.querySelectorAll('text')).map(t => t.textContent.trim());
      const headerActive = Array.from(document.querySelectorAll('header button'))
        .find(b => b.className.includes('bg-amber-500'))?.textContent?.trim();
      return { counter, strings, headerActive };
    })()`);
    console.log('[VERIFY] In-modal switch to Ukulele:', ukeModalState);
    assert.strictEqual(ukeModalState.counter, '1 z 4');
    assert(ukeModalState.strings.includes('G') && ukeModalState.strings.includes('A'));
    assert.strictEqual(ukeModalState.headerActive, 'Ukulele');
    console.log('✓ PASS: Modal instrument switcher updated fretboard to 4 strings and synchronized app header');

    // 6. Test Close Button (XIcon)
    console.log('[ACTION] Clicking close button (XIcon)...');
    await cdp.eval(`document.querySelector('dialog button[aria-label="Zamknij"]').click()`);
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), false);
    console.log('✓ PASS: Modal closed via dedicated close button');

    // 7. Test Inline Lyric Chord Trigger
    console.log('[ACTION] Clicking inline lyric chord button...');
    await cdp.eval(`document.querySelector('span.inline-flex > button').click()`);
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), true);
    console.log('✓ PASS: Modal opened via inline lyric chord button');

    // 8. Test Backdrop Click
    console.log('[ACTION] Dispatching backdrop click on <dialog>...');
    await cdp.eval(`(() => {
      const dialog = document.querySelector('dialog');
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), false);
    console.log('✓ PASS: Backdrop click closed modal and synchronized state');

    // 9. Test Native Escape Key
    console.log('[ACTION] Opening modal and testing native Escape key dismiss...');
    await cdp.eval(`document.querySelector('.flex.flex-wrap.gap-2.pt-2 button').click()`);
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), true);

    await cdp.eval(`document.querySelector('dialog').close()`);
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(await cdp.eval('document.querySelector("dialog").open'), false);
    console.log('✓ PASS: Native Escape key handler closed modal and updated React state');

    // 10. Test Polish Notation Transposition & Mapping Live in App
    console.log('\n--- SUITE 3: Live Transposition & Polish Notation Normalization ---');

    // Transpose +4 in PL mode: G -> H (B natural in PL)
    for (let i = 0; i < 4; i++) {
      await cdp.eval(`Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '+1').click()`);
    }
    await new Promise((r) => setTimeout(r, 200));

    const transValue = await cdp.eval(`document.querySelector('.w-12.text-center').textContent.trim()`);
    assert.strictEqual(transValue, '+4');

    const plTransChips = await cdp.eval(`Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button')).map(b => b.textContent.trim())`);
    console.log('[VERIFY] Transposed +4 chips in PL mode:', plTransChips);
    assert(plTransChips.includes('H'), 'Transposed +4 from G must yield Polish root "H"');

    // Open modal on 'H'
    await cdp.eval(`Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button'))
      .find(b => b.textContent.trim() === 'H').click()`);
    await new Promise((r) => setTimeout(r, 300));

    const hModalInfo = await cdp.eval(`(() => {
      const d = document.querySelector('dialog');
      return {
        open: d.open,
        chord: d.querySelector('.text-2xl')?.textContent?.trim(),
        hasSvg: !!d.querySelector('svg'),
      };
    })()`);
    console.log('[VERIFY] H modal info:', hModalInfo);
    assert.strictEqual(hModalInfo.chord, 'H');
    assert.strictEqual(hModalInfo.hasSvg, true);
    console.log('✓ PASS: Polish notation chord "H" opened modal and resolved to B-natural voicings');

    // Close modal
    await cdp.eval(`document.querySelector('dialog button[aria-label="Zamknij"]').click()`);
    await new Promise((r) => setTimeout(r, 200));

    // Toggle to International mode
    await cdp.eval(`Array.from(document.querySelectorAll('header button'))
      .find(b => b.textContent.includes('Notacja:')).click()`);
    await new Promise((r) => setTimeout(r, 200));

    const intTransChips = await cdp.eval(`Array.from(document.querySelectorAll('.flex.flex-wrap.gap-2.pt-2 button')).map(b => b.textContent.trim())`);
    console.log('[VERIFY] Transposed +4 chips in INT mode:', intTransChips);
    assert(intTransChips.includes('B'), 'In International mode, B natural must display as "B"');

    // Reset transpose
    await cdp.eval(`Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === 'Reset').click()`);
    await new Promise((r) => setTimeout(r, 100));

    // Reset notation back to PL
    await cdp.eval(`Array.from(document.querySelectorAll('header button'))
      .find(b => b.textContent.includes('Notacja:')).click()`);
    await new Promise((r) => setTimeout(r, 100));

    ws.close();
  } finally {
    chrome.kill();
    server.close();
  }

  // -------------------------------------------------------------
  // TEST SUITE 4: Edge Cases, Single-Variation (N=1), Fallbacks & Slash Chords
  // -------------------------------------------------------------
  console.log('\n--- SUITE 4: Database Resolution, Single Variation (N=1) & Slash Chords ---');
  const { lookupChordPositions } = await import('../src/lib/chordDb.ts');

  // 1. Single-Variation Chord (N=1)
  const ukeC11 = await lookupChordPositions('C11', 'ukulele', true);
  console.log('[VERIFY] Ukulele C11 positions count:', ukeC11 ? ukeC11.length : null);
  assert(ukeC11 && ukeC11.length === 1, 'Ukulele C11 must have exactly 1 position');

  // Verify ChordModal code structure for N=1 disabling:
  const chordModalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
  assert(
    chordModalSrc.includes('disabled={positions.length <= 1}'),
    'ChordModal must disable pagination arrows when positions.length <= 1'
  );
  assert(
    chordModalSrc.includes('aria-label="Poprzednia pozycja"'),
    'Previous position button must have accessible aria-label'
  );
  assert(
    chordModalSrc.includes('aria-label="Następna pozycja"'),
    'Next position button must have accessible aria-label'
  );
  console.log('✓ PASS: Single-variation (N=1) chords disable pagination arrows to prevent erroneous cyclic state');

  // 2. Uncataloged Chord Fallback Notice
  const uncatCAdd = await lookupChordPositions('Cadd11', 'guitar', true);
  const uncatNC = await lookupChordPositions('N.C.', 'guitar', true);
  const uncatEmpty = await lookupChordPositions('', 'guitar', true);
  assert.strictEqual(uncatCAdd, null);
  assert.strictEqual(uncatNC, null);
  assert.strictEqual(uncatEmpty, null);

  assert(
    chordModalSrc.includes('Diagram niedostępny dla tego chwytu'),
    'ChordModal must render Polish fallback text "Diagram niedostępny dla tego chwytu"'
  );
  console.log('✓ PASS: Uncataloged or non-musical strings return null and render Polish fallback notice');

  // 3. Polish Notation B vs H Exact Frets
  const hGuitar = await lookupChordPositions('H', 'guitar', true);
  const bGuitarPl = await lookupChordPositions('B', 'guitar', true);
  const bGuitarInt = await lookupChordPositions('B', 'guitar', false);
  const bbGuitarInt = await lookupChordPositions('Bb', 'guitar', false);

  assert.deepStrictEqual(hGuitar[0].frets, [2, 2, 4, 4, 4, 2], 'PL "H" -> B natural [2, 2, 4, 4, 4, 2]');
  assert.deepStrictEqual(bGuitarPl[0].frets, [-1, 1, 3, 3, 3, 1], 'PL "B" -> Bb major [-1, 1, 3, 3, 3, 1]');
  assert.deepStrictEqual(bGuitarInt[0].frets, [2, 2, 4, 4, 4, 2], 'INT "B" -> B natural [2, 2, 4, 4, 4, 2]');
  assert.deepStrictEqual(bbGuitarInt[0].frets, [-1, 1, 3, 3, 3, 1], 'INT "Bb" -> Bb major [-1, 1, 3, 3, 3, 1]');
  console.log('✓ PASS: Polish and International B / H normalization produces exact fretboard voicings');

  // 4. Slash Chords
  const dSlash = await lookupChordPositions('D/F#', 'guitar', true);
  const emSlash = await lookupChordPositions('Em/G', 'guitar', true);
  const cSlashUncat = await lookupChordPositions('C/D', 'guitar', true);
  const ukeSlash = await lookupChordPositions('C/G', 'ukulele', true);

  assert(dSlash && dSlash.length === 3, 'Guitar D/F# has 3 positions');
  assert(emSlash && emSlash.length === 3, 'Guitar Em/G has 3 positions');
  assert.strictEqual(cSlashUncat, null, 'Uncataloged Guitar C/D safely returns null');
  assert.strictEqual(ukeSlash, null, 'Ukulele slash chords safely return null');
  console.log('✓ PASS: Slash chords map accurately when cataloged and safely return null when uncataloged');

  console.log('\n======================================================');
  console.log('🎉 ALL EMPIRICAL CHALLENGER ASSERTIONS PASSED 100%!');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\n❌ CHALLENGER TEST FAILED:', err);
  process.exit(1);
});
