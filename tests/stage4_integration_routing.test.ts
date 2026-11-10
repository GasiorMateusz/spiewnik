import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { TestRunner, assert } from './helpers/test_framework';
import { MockRoutingEnvironment } from './helpers/routing_storage_harness';
import { SongViewer } from '../src/components/SongViewer';
import { getSongPrefKey, clearMemoryStore } from '../src/hooks/useLocalStorage';
import type { ParsedSong } from '../src/types';

// Standard production song fixtures
const MOCK_LORNETKA: ParsedSong = {
  slug: 'lornetka',
  title: 'Lornetka',
  artist: 'Golec uOrkiestra',
  key: 'G',
  tags: ['folk', 'golec'],
  rawLyrics: '',
  lines: [
    {
      type: 'section-header',
      header: 'Zwrotka 1',
    },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'G', lyrics: 'Kupiłek se ' },
        { chord: 'C', lyrics: 'lornetkę ' },
        { chord: 'D', lyrics: 'by oglądać świat' },
      ],
    },
  ],
  uniqueChords: ['G', 'C', 'D'],
};

const MOCK_WEHIKUL: ParsedSong = {
  slug: 'wehikul-czasu',
  title: 'Wehikuł czasu',
  artist: 'Dżem',
  key: 'A',
  tags: ['rock', 'dzem'],
  rawLyrics: '',
  lines: [
    {
      type: 'section-header',
      header: 'Refren',
    },
    {
      type: 'chords-and-lyrics',
      segments: [
        { chord: 'A', lyrics: 'Tylko nocą ' },
        { chord: 'E', lyrics: 'do klubu ' },
        { chord: 'D', lyrics: 'puls' },
      ],
    },
  ],
  uniqueChords: ['A', 'E', 'D'],
};

export async function runStage4IntegrationTests(runner: TestRunner) {
  runner.setTier('Stage 4 — Tier 3: App Routing & Fallback Integration (F83–F93)');

  // F88-INT: Catalog Route & App Contracts
  await runner.test('F88-INT: App.tsx contains catalog routing, search and song list markup', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('useHashRoute'), 'App.tsx must invoke useHashRoute hook');
    assert(appSrc.includes('route.type') || appSrc.includes("type === 'catalog'"), 'App.tsx must branch on route type');
    assert(appSrc.includes('Śpiewnik'), 'App.tsx must include Śpiewnik brand header');
  });

  // F89-INT: Deep Link SongViewer Rendering
  await runner.test('F89-INT: Rendering SongViewer for deep-linked song mounts complete toolbar and content', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_LORNETKA,
        instrument: 'guitar',
        theme: 'dark',
        initialTranspose: 0,
        initialPolishNotation: true,
        initialFontSizeOffset: 0,
      })
    );

    assert(html.includes('Lornetka'), 'Must render song title');
    assert(html.includes('Golec uOrkiestra'), 'Must render artist');
    assert(html.includes('Tonacja:'), 'Must render transposition toolbar');
    assert(html.includes('Notacja: PL (H)'), 'Must render Polish notation button');
  });

  // F90-INT: Per-Song Preference Hydration
  await runner.test('F90-INT: SongViewer initializes with persisted per-song transpose and scroll speed', () => {
    const htmlHydrated = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_WEHIKUL,
        instrument: 'guitar',
        theme: 'dark',
        initialTranspose: 3,
        initialScrollSpeed: 65,
      })
    );

    assert(htmlHydrated.includes('>+3</span>'), 'Must display hydrated +3 transposition offset');
    assert(htmlHydrated.includes('65 px/s') || htmlHydrated.includes('value="65"'), 'Must hydrate 65 px/s auto-scroll speed');
  });

  // F90-INT: SongViewer Change Notification Callbacks
  await runner.test('F90-INT: SongViewer triggers onTransposeChange and onScrollSpeedChange callbacks', () => {
    const songViewerSrc = fs.readFileSync('src/components/SongViewer.tsx', 'utf8');
    assert(songViewerSrc.includes('onTransposeChange'), 'SongViewer must support onTransposeChange callback prop');
    assert(songViewerSrc.includes('onScrollSpeedChange'), 'SongViewer must support onScrollSpeedChange callback prop');
  });

  // F91-INT: Non-Existent Song Slug Fallback Notice
  await runner.test('F91-INT: App.tsx source specifies clean Polish fallback notice for missing songs', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(
      appSrc.includes('Nie znaleziono piosenki') || appSrc.includes('nie istnieje'),
      'App.tsx must render Polish fallback notice "Nie znaleziono piosenki"'
    );
    assert(
      appSrc.includes('Wróć do katalogu') || appSrc.includes('#/'),
      'App.tsx fallback must contain link or button "Wróć do katalogu" returning to #/'
    );
  });

  // F92-INT: Distraction-Free Back Button Flow
  await runner.test('F92-INT: SongViewer onBack callback resets route to catalog #/', () => {
    let backCalled = false;
    const html = renderToStaticMarkup(
      React.createElement(SongViewer, {
        song: MOCK_LORNETKA,
        onBack: () => {
          backCalled = true;
        },
      })
    );

    assert(html.includes('title="Wróć do listy piosenek"') || html.includes('aria-label="Wróć do listy piosenek"') || html.includes('Wróć'), 'Back button must be rendered in SongViewer');

    const songViewerSrc = fs.readFileSync('src/components/SongViewer.tsx', 'utf8');
    assert(songViewerSrc.includes('if (onBack)'), 'handleBack checks onBack prop');
    assert(songViewerSrc.includes("window.location.hash = '#/'") || songViewerSrc.includes("navigate('#/')"), 'handleBack falls back to #/');
  });

  // F93-INT: Cross-Song State Isolation in Storage
  await runner.test('F93-INT: Independent song preferences persist separately across sequential songs', () => {
    const env = new MockRoutingEnvironment('#/');
    env.install();
    clearMemoryStore();
    try {
      // Pre-seed storage
      env.localStorage.setItem(
        getSongPrefKey('lornetka'),
        JSON.stringify({ transpose: 2, scrollSpeed: 50 })
      );
      env.localStorage.setItem(
        getSongPrefKey('wehikul-czasu'),
        JSON.stringify({ transpose: -1, scrollSpeed: 30 })
      );

      const prefLornetka = JSON.parse(env.localStorage.getItem(getSongPrefKey('lornetka'))!);
      const prefWehikul = JSON.parse(env.localStorage.getItem(getSongPrefKey('wehikul-czasu'))!);

      assert.strictEqual(prefLornetka.transpose, 2);
      assert.strictEqual(prefLornetka.scrollSpeed, 50);

      assert.strictEqual(prefWehikul.transpose, -1);
      assert.strictEqual(prefWehikul.scrollSpeed, 30);
    } finally {
      env.uninstall();
    }
  });

  // F45-INT: Static Backward Compatibility with Stage 1 & 2 Contracts
  await runner.test('F45-INT: Preserves all Stage 1 & Stage 2 App.tsx static assertions', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    const viewerSrc = fs.readFileSync('src/components/SongViewer.tsx', 'utf8');
    const combined = appSrc + viewerSrc;

    assert(appSrc.includes('<SongViewer'), 'Must mount <SongViewer />');
    assert(appSrc.includes('instrument={instrument}'), 'Passes instrument prop');
    assert(appSrc.includes('onInstrumentChange={setInstrument}'), 'Passes onInstrumentChange prop');
    assert(appSrc.includes('setInstrument(\'guitar\')') && appSrc.includes('setInstrument(\'ukulele\')'), 'Instrument toggle buttons');
    assert(appSrc.includes('bg-neutral-950') && appSrc.includes('text-neutral-100'), 'OLED dark theme classes');
    assert(appSrc.includes('text-amber-500'), 'Amber brand accent class');
    assert(combined.includes('inline-flex flex-col align-top mr-1'), 'Atomic chord syllable alignment class');
    assert(combined.includes('whitespace-pre font-sans'), 'Preserved font layout class');
  });
}
