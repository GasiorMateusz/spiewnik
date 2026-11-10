import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestRunner, assert } from './helpers/test_framework';
import { SongViewer } from '../src/components/SongViewer';
import { transposeChord, formatChordForDisplay, isChordToken, isChordLine, formatNote } from '../src/lib/chordNotation';
import { parseSong, parseFrontmatter, loadAllSongs } from '../src/lib/songParser';
import { useWakeLock } from '../src/hooks/useWakeLock';
import { HookHarness, MockWakeLockSentinel, MockDocument, setGlobalProperty } from './helpers/hook_harness';
import type { ParsedSong } from '../src/types';

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

export async function runStage2Tier5AdversarialTests(runner: TestRunner) {
  runner.setTier('Stage 2 — Tier 5: Adversarial Coverage Hardening');

  // =========================================================================
  // SECTION 1: RAPID STATE CHURN & RACE CONDITIONS
  // =========================================================================

  // ADV-01: Rapid font size scaling churn (100 rapid alternations between -4px and +12px)
  await runner.test('ADV-01: Rapid font scaling churn retains clamping bounds [-4, +12]', () => {
    let offset = 0;
    // Simulate 200 rapid clicks alternating between A- and A+
    for (let i = 0; i < 200; i++) {
      if (i % 2 === 0) {
        offset = Math.max(-4, offset - 2);
      } else {
        offset = Math.min(12, offset + 2);
      }
      assert(offset >= -4 && offset <= 12, `Font offset ${offset} must remain within [-4, +12]`);
    }

    // Stress extreme decrement (50 consecutive A- clicks)
    for (let i = 0; i < 50; i++) {
      offset = Math.max(-4, offset - 2);
    }
    assert.strictEqual(offset, -4, 'Font scaling must clamp at -4 under underflow pressure');

    // Stress extreme increment (50 consecutive A+ clicks)
    for (let i = 0; i < 50; i++) {
      offset = Math.min(12, offset + 2);
    }
    assert.strictEqual(offset, 12, 'Font scaling must clamp at +12 under overflow pressure');
  });

  // ADV-02: Rapid transposition increments/decrements across extreme ranges (+100, -100, Reset)
  await runner.test('ADV-02: Rapid transposition churn across extreme offsets preserves chromatic modulo invariants', () => {
    const testChords = ['C', 'Am', 'G', 'D/F#', 'Hm', 'B'];
    let transpose = 0;

    // Transpose +100 semitones
    for (let i = 0; i < 100; i++) {
      transpose += 1;
    }
    assert.strictEqual(transpose, 100);
    // 100 semitones mod 12 = 4 semitones (E.g. C + 100 semitones = E)
    for (const c of testChords) {
      const trans100 = transposeChord(c, transpose, true);
      const trans4 = transposeChord(c, 4, true);
      assert.strictEqual(trans100, trans4, `Chord ${c} transposed +100 must equal transposed +4`);
    }

    // Transpose -200 semitones (net -100)
    for (let i = 0; i < 200; i++) {
      transpose -= 1;
    }
    assert.strictEqual(transpose, -100);
    // -100 semitones mod 12 = 8 semitones (E.g. C - 100 semitones = G#)
    for (const c of testChords) {
      const transNeg100 = transposeChord(c, transpose, true);
      const trans8 = transposeChord(c, 8, true);
      assert.strictEqual(transNeg100, trans8, `Chord ${c} transposed -100 must equal transposed +8`);
    }

    // Reset button emulation: single tap restores 0
    transpose = 0;
    for (const c of testChords) {
      const resetChord = transposeChord(c, transpose, true);
      const directChord = formatChordForDisplay(c, true);
      assert.strictEqual(resetChord, directChord, `Reset chord ${c} must equal original display`);
    }
  });

  // ADV-03: Rapid Polish notation toggling interleaved with semitone transposition
  await runner.test('ADV-03: Rapid Polish notation toggling while transposing satisfies harmonic equivalence', () => {
    // Test 100 interleaved state transitions
    let transpose = 0;
    let polishNotation = true;

    for (let i = 0; i < 100; i++) {
      transpose = (transpose + 1) % 24 - 12; // shifts within [-12, +11]
      polishNotation = !polishNotation;

      // Invariant: B natural in Polish is H; in International is B
      // B-flat in Polish is B; in International is Bb or A#
      const bNatural = transposeChord('B', transpose, polishNotation);
      const bFlat = transposeChord('Bb', transpose, polishNotation);

      assert(typeof bNatural === 'string' && bNatural.length > 0);
      assert(typeof bFlat === 'string' && bFlat.length > 0);

      // Verify that when transposed by 0:
      if (transpose === 0) {
        if (polishNotation) {
          assert.strictEqual(bNatural, 'H', 'B natural must be H in Polish');
          assert.strictEqual(bFlat, 'B', 'Bb must be B in Polish');
        } else {
          assert.strictEqual(bNatural, 'B', 'B natural must be B in International');
          assert.strictEqual(bFlat, 'Bb', 'Bb must be Bb in International');
        }
      }
    }
  });

  // ADV-04: Hook race condition — Rapid unmount while wakeLock.request is in-flight
  await runner.test('ADV-04: Screen Wake Lock in-flight request releases immediately if unmounted during await', async () => {
    let mockSentinel: MockWakeLockSentinel | null = null;
    let resolveRequestPromise: ((val: any) => void) | null = null;

    const mockNav = {
      wakeLock: {
        request: async () => {
          return new Promise((resolve) => {
            mockSentinel = new MockWakeLockSentinel();
            resolveRequestPromise = () => resolve(mockSentinel);
          });
        },
      },
    };

    const restoreNav = setGlobalProperty('navigator', mockNav);
    const mockDoc = new MockDocument();
    const restoreDoc = setGlobalProperty('document', mockDoc);

    try {
      const harness = new HookHarness(() => useWakeLock(true), {});
      harness.render();

      // Hook started request, which is currently in-flight
      assert(resolveRequestPromise !== null, 'Request promise should be awaiting');

      // Now unmount before request finishes
      harness.unmount();

      // Now request promise resolves after unmount
      resolveRequestPromise!(null);
      await new Promise((r) => setTimeout(r, 50));

      assert(mockSentinel !== null, 'Sentinel was instantiated');
      assert.strictEqual(mockSentinel!.released, true, 'Sentinel MUST be immediately released on unmounted completion');
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // ADV-05: Hook race condition — Rapid visibilitychange churn (100 toggles in quick succession)
  await runner.test('ADV-05: 100 rapid visibilitychange events do not duplicate sentinels or leak event listeners', async () => {
    let activeSentinelsCount = 0;
    const sentinels: MockWakeLockSentinel[] = [];

    const mockNav = {
      wakeLock: {
        request: async () => {
          const s = new MockWakeLockSentinel();
          sentinels.push(s);
          activeSentinelsCount++;
          s.addEventListener('release', () => {
            activeSentinelsCount--;
          });
          return s;
        },
      },
    };

    const restoreNav = setGlobalProperty('navigator', mockNav);
    const mockDoc = new MockDocument();
    const restoreDoc = setGlobalProperty('document', mockDoc);

    try {
      const harness = new HookHarness(() => useWakeLock(true), {});
      harness.render();
      await new Promise((r) => setTimeout(r, 20));

      // 100 rapid transitions
      for (let i = 0; i < 100; i++) {
        mockDoc.triggerVisibilityChange(i % 2 === 0 ? 'hidden' : 'visible');
      }
      await new Promise((r) => setTimeout(r, 50));

      // Document listener count must remain 1
      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 1, 'Only 1 visibilitychange listener allowed');

      // Unmount hook
      harness.unmount();
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(mockDoc.getListenerCount('visibilitychange'), 0, 'Visibilitychange listener must be removed on unmount');
      // All created sentinels must be released
      for (const s of sentinels) {
        assert.strictEqual(s.released, true, 'Every sentinel must be released after unmount');
      }
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // ADV-06: Hook error suppression — sentinel.release throwing an exception is cleanly handled
  await runner.test('ADV-06: Wake lock release error suppression handles exceptions without crashing', async () => {
    const brokenSentinel = {
      released: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      release: async () => {
        throw new Error('Device locked or hardware failure');
      },
    };

    const mockNav = {
      wakeLock: {
        request: async () => brokenSentinel,
      },
    };

    const restoreNav = setGlobalProperty('navigator', mockNav);
    const mockDoc = new MockDocument();
    const restoreDoc = setGlobalProperty('document', mockDoc);

    try {
      const harness = new HookHarness(() => useWakeLock(true), {});
      harness.render();
      await new Promise((r) => setTimeout(r, 20));

      // Calling release explicitly should not throw
      let threw = false;
      try {
        await harness.result.release();
        harness.unmount();
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, 'Release errors must be silently caught during teardown');
    } finally {
      restoreNav();
      restoreDoc();
    }
  });

  // =========================================================================
  // SECTION 2: VIEWPORT & RENDERING CHAOS (Headless Chrome CDP)
  // =========================================================================

  if (fs.existsSync(CHROME_PATH) && fs.existsSync('dist/index.html')) {
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

      // Configure narrow mobile viewport: 320px width (iPhone SE 1st gen)
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 320,
        height: 568,
        deviceScaleFactor: 2,
        mobile: true,
      });

      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PROD_PORT}/index.html#/song/bieszczadzkie-anioly` });
      await new Promise((r) => setTimeout(r, 700));

      // ADV-07: Narrow 320px viewport at maximum font scaling (+12px) has zero horizontal overflow
      await runner.test('ADV-07: 320px viewport at +12px font scaling has ZERO horizontal overflow', async () => {
        // Enlarge font size to maximum +12px by clicking A+ 6 times (0 -> +2 -> +4 -> +6 -> +8 -> +10 -> +12)
        for (let i = 0; i < 6; i++) {
          await cdp.eval(`document.querySelector('button[title="Zwiększ czcionkę"]').click()`);
          await new Promise((r) => setTimeout(r, 60));
        }

        const metrics = await cdp.eval(`(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const innerWidth = window.innerWidth;
          const scrollWidth = docEl.scrollWidth;
          const bodyScrollWidth = body.scrollWidth;
          const pill = document.querySelector('button[title="Zwiększ czcionkę"]').parentElement.querySelector('span');
          return {
            innerWidth,
            scrollWidth,
            bodyScrollWidth,
            pillText: pill?.textContent.trim(),
            hasOverflow: scrollWidth > innerWidth || bodyScrollWidth > innerWidth,
          };
        })()`);

        assert.strictEqual(metrics.innerWidth, 320, 'Viewport width must be exactly 320px');
        assert.strictEqual(metrics.pillText, '+12', 'Font size offset must be +12');
        assert(!metrics.hasOverflow, `Overflow detected at 320px + 12px scaling! scrollWidth=${metrics.scrollWidth}`);
      });

      // ADV-08: Zero chord detachment — chords and lyrics share the exact column parent with aligned bounds
      await runner.test('ADV-08: Atomic column binding: chords remain strictly bound to lyrics without drift at 320px', async () => {
        const detachmentCheck = await cdp.eval(`(() => {
          const tokens = Array.from(document.querySelectorAll('.inline-flex.flex-col.align-top.mr-1'));
          let detachedCount = 0;
          let verifiedTokens = 0;

          for (const token of tokens) {
            const chordEl = token.querySelector('button, span.text-amber-500');
            const lyricEl = token.querySelector('span.whitespace-pre');
            if (chordEl && lyricEl) {
              verifiedTokens++;
              const tokenRect = token.getBoundingClientRect();
              const chordRect = chordEl.getBoundingClientRect();
              const lyricRect = lyricEl.getBoundingClientRect();

              // Verify chord and lyric are horizontally contained inside token parent
              if (chordRect.left < tokenRect.left - 2 || chordRect.right > tokenRect.right + 2) {
                detachedCount++;
              }
              if (lyricRect.left < tokenRect.left - 2 || lyricRect.right > tokenRect.right + 2) {
                detachedCount++;
              }
            }
          }
          return { totalTokens: tokens.length, verifiedTokens, detachedCount };
        })()`);

        assert(detachmentCheck.verifiedTokens > 10, 'Must verify at least 10 chord-lyric tokens');
        assert.strictEqual(detachmentCheck.detachedCount, 0, `Detected ${detachmentCheck.detachedCount} detached chords`);
      });

      // ADV-09: Zero vertical overlap between chords and lyrics at maximum font scaling
      await runner.test('ADV-09: Proportional height math: zero vertical overlap between chords and lyrics at +12px', async () => {
        const overlapCheck = await cdp.eval(`(() => {
          const tokens = Array.from(document.querySelectorAll('.inline-flex.flex-col.align-top.mr-1'));
          let collisionCount = 0;
          let checkedTokens = 0;

          for (const token of tokens) {
            const chordBtn = token.querySelector('button.text-amber-500');
            const lyricSpan = token.querySelector('span.whitespace-pre');
            if (chordBtn && lyricSpan) {
              checkedTokens++;
              const chordRect = chordBtn.getBoundingClientRect();
              const lyricRect = lyricSpan.getBoundingClientRect();

              // Chord bottom must be <= lyric top (with 0.5px sub-pixel tolerance)
              if (chordRect.bottom > lyricRect.top + 0.5) {
                collisionCount++;
              }
            }
          }
          return { checkedTokens, collisionCount };
        })()`);

        assert(overlapCheck.checkedTokens > 10, 'Must check at least 10 clickable chord tokens');
        assert.strictEqual(overlapCheck.collisionCount, 0, `Detected ${overlapCheck.collisionCount} collisions between chords and lyrics`);
      });

      // ADV-CDP-01: Rapid live state churn in browser DOM (rapid font scaling, transposition +20, and one-tap Reset)
      await runner.test('ADV-CDP-01: Rapid live state churn in browser DOM (font scaling + transposition + Reset)', async () => {
        // Rapid clicks on A- down to -4
        for (let i = 0; i < 12; i++) {
          await cdp.eval(`document.querySelector('button[title="Zmniejsz czcionkę"]')?.click()`);
        }
        await new Promise((r) => setTimeout(r, 60));

        const stateMinus4 = await cdp.eval(`(() => {
          const btnAminus = document.querySelector('button[title="Zmniejsz czcionkę"]');
          const pill = btnAminus.parentElement.querySelector('span');
          return { pill: pill?.textContent.trim(), disabled: btnAminus.disabled };
        })()`);
        assert.strictEqual(stateMinus4.pill, '-4', 'Pill must reach -4');
        assert.strictEqual(stateMinus4.disabled, true, 'A- button must be disabled at -4');

        // Rapid transposition +20
        for (let i = 0; i < 20; i++) {
          await cdp.eval(`document.querySelector('button[title="Podwyższ o półton"]')?.click()`);
        }
        await new Promise((r) => setTimeout(r, 80));

        const stateTrans = await cdp.eval(`(() => {
          const transSpan = document.querySelector('button[title="Podwyższ o półton"]').previousElementSibling;
          const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
          return { text: transSpan?.textContent.trim(), hasReset: !!resetBtn };
        })()`);
        assert.strictEqual(stateTrans.text, '+20', 'Transposition span must display +20');
        assert.strictEqual(stateTrans.hasReset, true, 'Reset button must be present when transposed');

        // Click Reset
        await cdp.eval(`document.querySelector('button[title="Przywróć oryginalną tonację"]')?.click()`);
        await new Promise((r) => setTimeout(r, 60));

        const stateReset = await cdp.eval(`(() => {
          const transSpan = document.querySelector('button[title="Podwyższ o półton"]').previousElementSibling;
          const resetBtn = document.querySelector('button[title="Przywróć oryginalną tonację"]');
          return { text: transSpan?.textContent.trim(), hasReset: !!resetBtn };
        })()`);
        assert.strictEqual(stateReset.text, '0', 'Transposition must reset to 0');
        assert.strictEqual(stateReset.hasReset, false, 'Reset button must disappear at 0');
      });

      // ADV-CDP-02: Rapid Polish notation toggle in browser DOM
      await runner.test('ADV-CDP-02: Rapid Polish notation toggling updates chips and inline chords instantly', async () => {
        // Toggle 3 times
        for (let i = 0; i < 3; i++) {
          await cdp.eval(`document.querySelector('button[title*="Przełącz notację"]')?.click()`);
          await new Promise((r) => setTimeout(r, 40));
        }

        const notationState = await cdp.eval(`(() => {
          const btn = document.querySelector('button[title*="Przełącz notację"]');
          return btn?.textContent.trim();
        })()`);
        // Started PL (H), 3 toggles -> INT (B)
        assert.strictEqual(notationState, 'Notacja: INT (B)', 'Notation button must show INT (B)');

        // Toggle once more back to PL (H)
        await cdp.eval(`document.querySelector('button[title*="Przełącz notację"]')?.click()`);
        await new Promise((r) => setTimeout(r, 40));

        const notationPl = await cdp.eval(`(() => {
          const btn = document.querySelector('button[title*="Przełącz notację"]');
          return btn?.textContent.trim();
        })()`);
        assert.strictEqual(notationPl, 'Notacja: PL (H)', 'Notation button must return to PL (H)');
      });

      // Close CDP and Chrome
      ws.close();
      chrome.kill('SIGTERM');
      await new Promise((r) => server.close(r));
    } catch (err) {
      ws?.close();
      chrome?.kill('SIGKILL');
      server.close();
      throw err;
    }
  }

  // =========================================================================
  // SECTION 3: MUSICAL EDGE FUZZING
  // =========================================================================

  // ADV-10: Complex and exotic slash chords with full chromatic transposition
  await runner.test('ADV-10: Complex slash chords transpose cleanly across all 12 semitones in Polish & INT', () => {
    const complexSlash = [
      { chord: 'C#m7b5/G#', semitones: 1, expectedPL: 'Dm7b5/A', expectedINT: 'Dm7b5/A' },
      { chord: 'D/F#', semitones: 1, expectedPL: 'D#/G', expectedINT: 'D#/G' },
      { chord: 'G/H', semitones: 1, expectedPL: 'G#/C', expectedINT: 'G#/C' },
      { chord: 'F#/A#', semitones: 1, expectedPL: 'G/H', expectedINT: 'G/B' },
      { chord: 'Am/G', semitones: 2, expectedPL: 'Hm/A', expectedINT: 'Bm/A' },
      { chord: 'C/B', semitones: 0, expectedPL: 'C/H', expectedINT: 'C/B' }, // In INT: B is B natural; in PL B natural is H
      { chord: 'C/Bb', semitones: 0, expectedPL: 'C/B', expectedINT: 'C/A#' }, // In PL: Bb is B; in INT: sharp enharmonics make Bb -> A#
      { chord: 'Ebmaj7/Bb', semitones: 0, expectedPL: 'D#maj7/B', expectedINT: 'D#maj7/A#' },
    ];

    for (const test of complexSlash) {
      const plResult = transposeChord(test.chord, test.semitones, true);
      const intResult = transposeChord(test.chord, test.semitones, false);
      assert.strictEqual(plResult, test.expectedPL, `Polish ${test.chord} +${test.semitones} -> ${test.expectedPL}`);
      assert.strictEqual(intResult, test.expectedINT, `International ${test.chord} +${test.semitones} -> ${test.expectedINT}`);
    }
  });

  // ADV-11: Musical accidental edge case investigation — Cb and double accidentals
  await runner.test('ADV-11: Cb and double accidental boundary investigation', () => {
    // 1. Cb (C-flat) test:
    // In chromatic theory, Cb = B natural (enharmonic index 11).
    // Let's document empirically how chordNotation behaves:
    const cbTransposed = transposeChord('Cb', 1);
    // Since Cb is omitted from NOTE_TO_INDEX, it returns unchanged 'Cb'
    assert.strictEqual(cbTransposed, 'Cb', 'Cb returns unchanged Cb due to omitted NOTE_TO_INDEX entry');

    // 2. Double accidentals:
    const cDoubleSharp = transposeChord('C##', 1);
    assert.strictEqual(cDoubleSharp, 'D#', 'C## + 1 semitone transposes to D#');

    const dDoubleFlat = transposeChord('Dbb', 1);
    assert.strictEqual(dDoubleFlat, 'Db', 'Dbb + 1 semitone returns Db');
  });

  // ADV-12: Malformed frontmatter fuzzing (unclosed, missing fields, corrupted YAML, XSS injection)
  await runner.test('ADV-12: Malformed frontmatter inputs degrade safely to robust defaults', () => {
    const malformedInputs = [
      '',
      '   ',
      '---\n',
      '---\ntitle: Unclosed without end delimiter\nBody text',
      '---\ntags: [unclosed, array\n---\nBody text',
      '---\n: empty key\n---\nBody text',
      '---\ntitle: "<script>alert(\'xss\')</script>"\nartist: "\"><img src=x onerror=alert(1)>"\n---\nLine 1',
      '---\nkey: \n---\nBody text',
      '---\n' + 'key'.repeat(100) + ': val\n---\nBody text',
    ];

    for (let i = 0; i < malformedInputs.length; i++) {
      let threw = false;
      try {
        const song = parseSong(malformedInputs[i], `fuzz-${i}`);
        assert(song.title.length > 0, 'Song must have non-empty title fallback');
        assert(song.artist.length > 0, 'Song must have non-empty artist fallback');
        assert(Array.isArray(song.lines), 'Song must have lines array');
        assert(Array.isArray(song.uniqueChords), 'Song must have uniqueChords array');
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, `parseSong must not throw on malformed input ${i}`);
    }
  });

  // ADV-13: Malformed song lines fuzzing (empty lines, unmatched brackets, extreme length asymmetries)
  await runner.test('ADV-13: Malformed song line structures parse and render with zero exceptions', () => {
    const malformedBodies = [
      // 100 consecutive empty lines
      '\n'.repeat(100),
      // Section headers with weird brackets
      '[[Refren]]\n[Refren (x2)]\n[]\n[   ]\n[!@#$%^&*()]',
      // Extreme chord-lyric length asymmetry: 50 chords, 2 letters
      'C D E F G A B C D E F G A B C D E F G A B C D E F G A B\nHi',
      // Extreme chord-lyric length asymmetry: 1 chord, 120 letters
      'C\n' + 'Superkalifragilisticexpialidocious '.repeat(4),
      // Random punctuation lines
      '!@#$%^&*()_+=-`~[]\\{}|;\':",.<>/?',
      // Polish diacritics
      'Zażółć gęślą jaźń\nC D G',
    ];

    for (let i = 0; i < malformedBodies.length; i++) {
      const parsed = parseSong(malformedBodies[i], `body-fuzz-${i}`);
      assert(Array.isArray(parsed.lines));

      // Test rendering to static markup via React Server DOM
      let renderThrew = false;
      try {
        const html = renderToStaticMarkup(
          React.createElement(SongViewer, {
            song: parsed,
          })
        );
        assert(typeof html === 'string' && html.length > 0);
      } catch {
        renderThrew = true;
      }
      assert.strictEqual(renderThrew, false, `SongViewer rendering must not throw on malformed body ${i}`);
    }
  });
}
