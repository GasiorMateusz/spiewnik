import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework';
import { SongViewer } from '../src/components/SongViewer';
import { parseSong } from '../src/lib/songParser';
import { AutoScrollController } from './helpers/autoscroll_harness';
import type { ParsedSong } from '../src/types';

export async function runStage3Tier4Tests(runner: TestRunner) {
  runner.setTier('Stage 3 — Tier 4: Real-World Musician Scenarios');

  const songDir = './songs';

  // M01: Campfire hands-free performance on Wehikuł Czasu
  await runner.test('M01: Campfire hands-free performance scenario on Wehikuł Czasu (continuous monotonic auto-scroll)', () => {
    const raw = fs.readFileSync(path.join(songDir, 'wehikul-czasu.txt'), 'utf8');
    const song = parseSong(raw, 'wehikul-czasu', 'songs/wehikul-czasu.txt');

    // 1. Verify SongViewer markup contains lyrics padding and floating dock
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song,
        theme: 'dark',
        initialScrollSpeed: 25,
      })
    );
    assert(html.includes('Wehikuł Czasu'), 'Renders song title');
    assert(html.includes('pb-28 sm:pb-32'), 'Container has pb-28 sm:pb-32 padding so last verse is never covered');
    assert(html.includes('Panel automatycznego przewijania'), 'AutoScroll floating dock present');
    assert(html.includes('25 px/s'), 'Speed display initialized to 25 px/s');

    // 2. Drive virtual continuous scrolling performance for 15 virtual seconds
    const ctrl = new AutoScrollController({ initialSpeed: 25 });
    try {
      ctrl.env.scrollHeight = 2500;
      ctrl.env.innerHeight = 800;
      ctrl.clickPlayPause();
      ctrl.stepFrame(0); // baseline

      let prevY = ctrl.env.scrollY;
      // Step 900 frames (15 seconds at 60 FPS)
      for (let i = 0; i < 900; i++) {
        ctrl.stepFrame(16.6667);
        assert(ctrl.env.scrollY >= prevY, `Scroll progression must be monotonic (prev=${prevY}, curr=${ctrl.env.scrollY})`);
        prevY = ctrl.env.scrollY;
      }

      // Expected: 25 px/s * 15s = 375px
      assert(
        Math.abs(ctrl.env.scrollY - 375) <= 2,
        `Expected continuous scroll ~375px, got ${ctrl.env.scrollY}`
      );
    } finally {
      ctrl.destroy();
    }
  });

  // M02: Live rehearsal touch interruption and 3s resume cycle on Whisky (Dżem)
  await runner.test('M02: Live rehearsal touch interruption and 3s resume cycle on Whisky (Dżem)', () => {
    const raw = fs.readFileSync(path.join(songDir, 'whisky.txt'), 'utf8');
    const song = parseSong(raw, 'whisky', 'songs/whisky.txt');

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song, initialScrollSpeed: 30 }));
    assert(html.includes('Whisky'), 'Song title rendered');
    assert(html.includes('Panel automatycznego przewijania'));

    const ctrl = new AutoScrollController({ initialSpeed: 30 });
    try {
      ctrl.env.scrollHeight = 1400;
      ctrl.env.innerHeight = 800; // maxScrollTop = 600px

      // 1. Musician starts scrolling
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      for (let i = 0; i < 180; i++) ctrl.stepFrame(16.6667); // 3 seconds: ~90px
      assert(ctrl.env.scrollY >= 88 && ctrl.env.scrollY <= 92);

      // 2. Musician touches screen to review chords
      ctrl.touchOutside('touchstart');
      assert.strictEqual(ctrl.currentState, 'interrupted');
      let currentY = ctrl.env.scrollY;

      // 3. User fingers the neck for 2 seconds, then adjusts position slightly (+20px)
      ctrl.advanceTime(2000);
      ctrl.env.scrollY += 20; // manual scroll to y=110
      ctrl.touchOutside('touchmove'); // debounced: resets 3s timer

      // 4. Advance 2500ms: still interrupted
      ctrl.advanceTime(2500);
      assert.strictEqual(ctrl.currentState, 'interrupted');

      // 5. Advance remaining 500ms: auto-resumes smoothly!
      ctrl.advanceTime(500);
      assert.strictEqual(ctrl.currentState, 'scrolling');

      // 6. Scrolls smoothly from manual position 110 to bottom
      ctrl.stepFrame(0);
      // Step until near bottom (remaining 490px at 30 px/s is ~16.3s)
      for (let i = 0; i < 1200; i++) {
        if (ctrl.currentState === 'idle') break;
        ctrl.stepFrame(16.6667);
      }

      // Reached bottom cleanly
      assert.strictEqual(ctrl.currentState, 'idle', 'Auto-stopped at bottom of Whisky');
      assert(ctrl.env.scrollY >= 598, `Stopped within 2px of maxScrollTop 600: got ${ctrl.env.scrollY}`);
    } finally {
      ctrl.destroy();
    }
  });

  // M03: Solo practice and Jump-to-Top rehearsal loop on Bieszczadzkie Anioły
  await runner.test('M03: Solo practice and Jump-to-Top rehearsal loop on Bieszczadzkie Anioły', () => {
    const raw = fs.readFileSync(path.join(songDir, 'bieszczadzkie-anioly.txt'), 'utf8');
    const song = parseSong(raw, 'bieszczadzkie-anioly', 'songs/bieszczadzkie-anioly.txt');

    const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));
    assert(html.includes('Bieszczadzkie Anioły'), 'Song title rendered');

    const ctrl = new AutoScrollController({ initialSpeed: 50 });
    try {
      ctrl.env.scrollHeight = 2000;
      ctrl.env.innerHeight = 800; // maxScrollTop = 1200

      // Rehearsal Run 1: Scroll to middle of song
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      for (let i = 0; i < 300; i++) ctrl.stepFrame(16.6667); // 5 seconds at 50 px/s = 250px
      assert(ctrl.env.scrollY >= 248 && ctrl.env.scrollY <= 252);

      // Musician hits Jump-to-top to rehearse verse 1 again
      ctrl.clickJumpToTop();
      assert.strictEqual(ctrl.currentState, 'idle');
      assert.strictEqual(ctrl.env.scrollY, 0, 'Back at song top');

      // Rehearsal Run 2: Start from top again cleanly
      ctrl.clickPlayPause();
      ctrl.stepFrame(0);
      ctrl.stepFrame(100); // 50 * 0.1 = 5px
      assert.strictEqual(ctrl.env.scrollY, 5, 'Clean restart from top');
    } finally {
      ctrl.destroy();
    }
  });

  // M04: Complete production catalog parsing & SongViewer AutoScroll integration
  await runner.test('M04: Complete production catalog (all 4 songs) integrates AutoScroll floating dock', () => {
    const songFiles = [
      'wehikul-czasu.txt',
      'whisky.txt',
      'lornetka.txt',
      'bieszczadzkie-anioly.txt',
    ];

    for (const f of songFiles) {
      const raw = fs.readFileSync(path.join(songDir, f), 'utf8');
      const slug = path.basename(f, '.txt');
      const song = parseSong(raw, slug, `songs/${f}`);

      const html = renderToStaticMarkup(React.createElement(SongViewer, { song }));

      assert(html.includes('role="region"'), `Song ${f} must render dock region`);
      assert(html.includes('aria-label="Panel automatycznego przewijania"'), `Song ${f} dock label`);
      assert(html.includes('aria-label="Start"'), `Song ${f} Start button`);
      assert(html.includes('aria-label="Prędkość przewijania"'), `Song ${f} Speed slider`);
      assert(html.includes('aria-label="Wróć na górę"'), `Song ${f} Jump-to-top button`);
      assert(html.includes('pb-28 sm:pb-32'), `Song ${f} has pb-28 sm:pb-32 bottom clearance`);
    }
  });
}
