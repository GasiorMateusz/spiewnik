import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TestRunner, assert } from './helpers/test_framework';
import { Toast } from '../src/components/Toast';
import { WifiOffIcon } from '../src/components/Icons';

export async function runStage6Tests(runner: TestRunner) {
  // =========================================================================
  // Tier 1: Feature Coverage (REQ-PWA-1..3, REQ-LOC-1, REQ-UI-1: F97–F108)
  // =========================================================================
  runner.setTier('Stage 6 — Tier 1: Feature Coverage (F97–F108)');

  await runner.test('F97: Toast component renders with role="alert", aria-live="polite", and message', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, {
        message: 'Dostępna nowa wersja śpiewnika',
        onClose: () => {},
        theme: 'dark',
      })
    );
    assert(html.includes('role="alert"'), 'Toast must contain role="alert"');
    assert(html.includes('aria-live="polite"'), 'Toast must specify aria-live="polite"');
    assert(html.includes('Dostępna nowa wersja śpiewnika'), 'Toast must display message text');
    assert(html.includes('aria-label="Zamknij powiadomienie"'), 'Toast must provide accessible close button');
  });

  await runner.test('F98: Toast renders action button when actionLabel and onAction are supplied', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, {
        message: 'Nowe piosenki pobrane',
        actionLabel: 'Odśwież',
        onAction: () => {},
        onClose: () => {},
        theme: 'dark',
      })
    );
    assert(html.includes('Odśwież'), 'Toast must render action button with label');
    assert(html.includes('bg-amber-500'), 'Toast action button must use amber accent');
  });

  await runner.test('F99: Toast dark theme uses high-contrast OLED styling and light theme uses clean contrast', () => {
    const darkHtml = renderToStaticMarkup(
      React.createElement(Toast, {
        message: 'Test ciemny motyw',
        onClose: () => {},
        theme: 'dark',
      })
    );
    assert(darkHtml.includes('bg-neutral-900'), 'Dark Toast must have bg-neutral-900');
    assert(darkHtml.includes('text-neutral-100'), 'Dark Toast must have text-neutral-100');

    const lightHtml = renderToStaticMarkup(
      React.createElement(Toast, {
        message: 'Test jasny motyw',
        onClose: () => {},
        theme: 'light',
      })
    );
    assert(lightHtml.includes('bg-white'), 'Light Toast must have bg-white');
    assert(lightHtml.includes('text-neutral-900'), 'Light Toast must have text-neutral-900');
  });

  await runner.test('F100: Toast autoCloseMs timer and useEffect cleanup logic', () => {
    const toastSrc = fs.readFileSync('src/components/Toast.tsx', 'utf8');
    assert(toastSrc.includes('setTimeout'), 'Toast must set auto-close timer via setTimeout');
    assert(toastSrc.includes('clearTimeout'), 'Toast must clear timer on unmount / cleanup');
    assert(toastSrc.includes('autoCloseMs'), 'Toast must check autoCloseMs threshold');
  });

  await runner.test('F101: WifiOffIcon renders vector SVG icon', () => {
    const html = renderToStaticMarkup(React.createElement(WifiOffIcon, { className: 'w-4 h-4 text-amber-500' }));
    assert(html.includes('<svg'), 'WifiOffIcon must render an SVG element');
    assert(html.includes('viewBox="0 0 24 24"'), 'WifiOffIcon must have 24x24 viewBox');
    assert(html.includes('text-amber-500'), 'WifiOffIcon must apply custom className');
  });

  await runner.test('F102: App.tsx integrates isOnline state and WifiOffIcon offline status indicator', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('isOnline'), 'App.tsx must define isOnline state');
    assert(appSrc.includes('WifiOffIcon'), 'App.tsx must import and use WifiOffIcon');
    assert(appSrc.includes('role="status"'), 'Offline indicator must have role="status"');
    assert(appSrc.includes('aria-label="Tryb offline"'), 'Offline indicator must have accessible aria-label');
    assert(appSrc.includes('Offline'), 'Offline indicator must include readable text label');
  });

  await runner.test('F103: App.tsx registers online and offline window event listeners', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes("window.addEventListener('online'"), 'App.tsx must attach online listener');
    assert(appSrc.includes("window.addEventListener('offline'"), 'App.tsx must attach offline listener');
    assert(appSrc.includes("window.removeEventListener('online'"), 'App.tsx must detach online listener on unmount');
    assert(appSrc.includes("window.removeEventListener('offline'"), 'App.tsx must detach offline listener on unmount');
  });

  await runner.test('F104: App.tsx listens to Service Worker updatefound event and triggers update toast', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes("'serviceWorker' in navigator"), 'App.tsx must check for serviceWorker support');
    assert(appSrc.includes("updatefound"), 'App.tsx must listen to SW updatefound event');
    assert(appSrc.includes("Dostępna nowa wersja śpiewnika"), 'App.tsx must provide Polish update prompt');
    assert(appSrc.includes("Odśwież"), 'App.tsx must provide Odśwież action button');
  });

  await runner.test('F105: App.tsx synchronizes dark class, body background, and theme-color meta tag', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes("document.documentElement.classList.add('dark')"), 'App.tsx must add dark class');
    assert(appSrc.includes("document.documentElement.classList.remove('dark')"), 'App.tsx must remove dark class');
    assert(appSrc.includes("document.body.className"), 'App.tsx must synchronize document.body.className');
    assert(appSrc.includes("meta[name=\"theme-color\"]"), 'App.tsx must update theme-color meta tag');
  });

  await runner.test('F106: App.tsx integrates Toast component at bottom of layout', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert(appSrc.includes('<Toast'), 'App.tsx must render Toast component');
    assert(appSrc.includes('onClose={() => setToast(null)}'), 'App.tsx must clear toast state on close');
  });

  await runner.test('F107: SongViewer font scaler controls support both dark and light high contrast modes', () => {
    const viewerSrc = fs.readFileSync('src/components/SongViewer.tsx', 'utf8');
    assert(
      viewerSrc.includes("isDark ? 'text-neutral-300 hover:text-white' : 'text-neutral-700 hover:text-neutral-900'"),
      'SongViewer font scaler buttons must provide adaptive high contrast classes'
    );
  });

  await runner.test('F108: Complete Polish UI localization audit across all primary components', () => {
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    const viewerSrc = fs.readFileSync('src/components/SongViewer.tsx', 'utf8');
    const listSrc = fs.readFileSync('src/components/SongList.tsx', 'utf8');
    const modalSrc = fs.readFileSync('src/components/ChordModal.tsx', 'utf8');
    const toastSrc = fs.readFileSync('src/components/Toast.tsx', 'utf8');
    const scrollSrc = fs.readFileSync('src/components/AutoScroll.tsx', 'utf8');

    // Verify key Polish user-facing terms
    assert(listSrc.includes('Piosenki') && listSrc.includes('Wykonawcy') && listSrc.includes('Ulubione'), 'SongList tabs must be Polish');
    assert(listSrc.includes('Szukaj piosenki, wykonawcy, tekstu...'), 'Search placeholder must be in Polish');
    assert(listSrc.includes('Brak ulubionych utworów'), 'Favorites empty state must be in Polish');
    assert(viewerSrc.includes('Tonacja:'), 'SongViewer transposition label must be in Polish');
    assert(viewerSrc.includes('Akordy:'), 'SongViewer chords label must be in Polish');
    assert(modalSrc.includes('Diagram niedostępny dla tego chwytu'), 'ChordModal fallback must be in Polish');
    assert(scrollSrc.includes('Start') && scrollSrc.includes('Pauza') && scrollSrc.includes('Wróć na górę'), 'AutoScroll controls must be in Polish');
    assert(toastSrc.includes('Zamknij powiadomienie'), 'Toast close button label must be in Polish');
    assert(appSrc.includes('Wróć do katalogu'), 'App navigation links must be in Polish');
  });

  // =========================================================================
  // Tier 2: Boundary & Corner Cases (REQ-PWA-1..3: B19–B24)
  // =========================================================================
  runner.setTier('Stage 6 — Tier 2: Boundary & Corner Cases (B19–B24)');

  await runner.test('B19: Toast dismiss via close button provides accessible aria-label and XIcon', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, {
        message: 'Test dismiss',
        onClose: () => {},
      })
    );
    assert(html.includes('aria-label="Zamknij powiadomienie"'), 'Close button must have accessible label');
    assert(html.includes('title="Zamknij"'), 'Close button must have title');
  });

  await runner.test('B20: Toast action button supplies click handler and Polish label', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, {
        message: 'Nowa wersja',
        actionLabel: 'Odśwież',
        onAction: () => {},
        onClose: () => {},
      })
    );
    assert(html.includes('Odśwież'), 'Action button must display label');
    assert(html.includes('bg-amber-500'), 'Action button must have amber accent styling');
  });

  await runner.test('B21: Toast renders cleanly without action button when actionLabel is omitted', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, {
        message: 'Informacja bez przycisku akcji',
        onClose: () => {},
      })
    );
    assert(!html.includes('Odśwież'), 'Toast must not render action button when not requested');
    assert(html.includes('Informacja bez przycisku akcji'), 'Toast must render message');
  });

  await runner.test('B22: Toast autoCloseMs threshold bounds and cleanup guard in source', () => {
    const toastSrc = fs.readFileSync('src/components/Toast.tsx', 'utf8');
    assert(toastSrc.includes('if (!autoCloseMs || autoCloseMs <= 0) return;'), 'Toast must guard against <= 0 autoCloseMs');
  });

  await runner.test('B23: Toast message truncation and layout safety on narrow viewports', () => {
    const longMessage = 'To jest bardzo długa wiadomość powiadomienia, która mogłaby przekroczyć szerokość ekranu telefonu';
    const html = renderToStaticMarkup(
      React.createElement(Toast, {
        message: longMessage,
        onClose: () => {},
      })
    );
    assert(html.includes('truncate'), 'Toast message paragraph must have truncate class');
    assert(html.includes('max-w-md w-[calc(100%-2rem)]'), 'Toast must bound width on mobile viewports');
  });

  await runner.test('B24: Toast handles undefined theme gracefully by falling back to dark default', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, {
        message: 'Domyślny motyw',
        onClose: () => {},
      })
    );
    assert(html.includes('bg-neutral-900'), 'Default theme must be dark');
  });

  // =========================================================================
  // Tier 3: Cross-Feature Interactions & PWA Precache Verification (C06–C10)
  // =========================================================================
  runner.setTier('Stage 6 — Tier 3: Cross-Feature Interactions & PWA Precache (C06–C10)');

  await runner.test('C06: Production build output contains valid service worker (dist/sw.js)', () => {
    const swPath = path.join(process.cwd(), 'dist', 'sw.js');
    assert(fs.existsSync(swPath), 'dist/sw.js must exist in build output');
    const swContent = fs.readFileSync(swPath, 'utf8');
    assert(swContent.length > 500, 'dist/sw.js must contain substantial service worker logic');
  });

  await runner.test('C07: Production build output contains valid web manifest (dist/manifest.webmanifest)', () => {
    const manifestPath = path.join(process.cwd(), 'dist', 'manifest.webmanifest');
    assert(fs.existsSync(manifestPath), 'dist/manifest.webmanifest must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.name, 'Śpiewnik Gitarowy i Ukulele', 'Manifest name must be correct');
    assert.strictEqual(manifest.short_name, 'Śpiewnik', 'Manifest short_name must be Śpiewnik');
    assert.strictEqual(manifest.display, 'standalone', 'Manifest display must be standalone');
    assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Manifest must declare at least 2 icon sizes');
  });

  await runner.test('C08: Service worker precache covers all asset types including text, svg, js, and css', () => {
    const viteConfigSrc = fs.readFileSync('vite.config.ts', 'utf8');
    assert(
      viteConfigSrc.includes("globPatterns: ['**/*.{js,css,html,ico,png,svg,txt}']"),
      'VitePWA must configure workbox globPatterns covering all required asset types'
    );
  });

  await runner.test('C09: Mobile HTML shell contains required PWA and mobile viewport meta tags', () => {
    const indexHtml = fs.readFileSync('index.html', 'utf8');
    assert(indexHtml.includes('<meta name="viewport"'), 'index.html must specify viewport meta tag');
    assert(indexHtml.includes('viewport-fit=cover'), 'index.html must include viewport-fit=cover for notched screens');
    assert(indexHtml.includes('<meta name="mobile-web-app-capable" content="yes"'), 'index.html must include modern mobile-web-app-capable');
    assert(indexHtml.includes('<meta name="theme-color"'), 'index.html must specify theme-color');
    assert(indexHtml.includes('lang="pl"'), 'index.html must specify Polish language (lang="pl")');
  });

  await runner.test('C10: GitHub Actions deployment workflow (.github/workflows/deploy.yml) exists and is configured for Pages', () => {
    const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'deploy.yml');
    assert(fs.existsSync(workflowPath), '.github/workflows/deploy.yml must exist');
    const workflowSrc = fs.readFileSync(workflowPath, 'utf8');
    assert(workflowSrc.includes('actions/deploy-pages'), 'Workflow must use deploy-pages action');
    assert(workflowSrc.includes('actions/upload-pages-artifact'), 'Workflow must upload artifact');
    assert(workflowSrc.includes('enablement: true'), 'Workflow must specify configure-pages enablement');
  });
}
