# Code Architecture & Standards

## 1. Architectural Overview

Śpiewnik is an offline-first Progressive Web App (PWA) built for musicians. It compiles song text files and chord databases into a client-only bundle that works 100% offline.

### Tech Stack
- **Framework**: React 19 (Functional components, hooks)
- **Language**: TypeScript 5.7+ (Strict mode, ES2022 target)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Bundler & PWA**: Vite 8 + `vite-plugin-pwa` (Workbox precaching)
- **Runtime / Tests**: Node.js 20+ (`--experimental-strip-types`), custom multi-tier test runner, Chrome DevTools Protocol (CDP) for headless E2E

### Zero Unnecessary Dependencies (Ponytail Philosophy)
Do not install heavy npm packages for functionality that native web APIs or lightweight custom modules can handle:
- **Routing**: Lightweight hash routing via `useSyncExternalStore` (`src/hooks/useHashRoute.ts`). No `react-router-dom`.
- **Parsing**: Native regex frontmatter and lyric parsers (`src/lib/songParser.ts`). No `gray-matter` or `chordsheetjs`.
- **Icons**: Handcrafted vector SVG components (`src/components/Icons.tsx`). No icon libraries (`lucide-react`, `font-awesome`).
- **Chord Diagrams**: Pure SVG renderer (`src/components/ChordSvg.tsx`) with dynamic on-demand chord chunk loading (`src/lib/chordDb.ts`).
- **Device APIs**: Screen Wake Lock API (`src/hooks/useWakeLock.ts`) and `requestAnimationFrame` for 60 FPS auto-scroll (`src/components/AutoScroll.tsx`).

---

## 2. Directory Structure & Responsibilities

```
spiewnik/
├── public/              # Static PWA assets (manifest, icons, favicon)
├── songs/               # Built-in songs in plain-text (.txt) with YAML frontmatter
├── src/
│   ├── components/      # UI components (presentation & user interaction)
│   ├── hooks/           # Reusable headless hooks (routing, storage, wake lock)
│   ├── lib/             # Pure business logic (parsers, chord math, search, import)
│   ├── types/           # Shared TypeScript domain interfaces and types
│   ├── App.tsx          # Root coordinator (state, routing, global settings)
│   ├── main.tsx         # React root entrypoint
│   └── index.css        # Base styles and Tailwind configuration
├── scripts/             # Offline tools and importers (e.g. Wywrota.pl importer)
├── tests/               # Multi-tier test suites (unit, boundary, stress, CDP E2E)
└── docs/                # Architecture plans, PRD, and maintenance guides
```

---

## 3. Core Architectural Patterns

### 3.1. Data Flow & State Management
- **Unidirectional Flow**: `App.tsx` owns top-level state (catalog songs, active route, global preferences, custom uploads) and passes state down via props.
- **Persistence Layer**: All persistent settings use typed localStorage wrappers (`src/hooks/useLocalStorage.ts`) with schema validation functions and in-memory fallbacks for private browsing / quota limits.
- **Route Handling**: Navigation is synchronized with `window.location.hash` (`#/`, `#/song/:slug`, `#/artist/:slug`). Never mutate browser history directly; navigate using `window.location.hash = ...`.

### 3.2. Atomic Chord-Lyric Alignment
- Songs render chords paired vertically with syllables using `inline-flex flex-col` within flex-wrapped lines (`SongViewer.tsx`).
- Chords must never wrap independently from their underlying word or syllable on mobile viewports (minimum width: 360px).

### 3.3. Musical Theory Rules
- **Accidentals**: Transposition defaults to sharp notation (`#`) rather than flats (`b`), except when explicitly configured.
- **Notation Modes**: Support Polish (`H`, `B`, `Cis`, `Dis`), International (`B`, `Bb`), and German/European notation cleanly through `chordNotation.ts`.
- **Minor Chords**: Always represented as uppercase root + lowercase `m` (e.g., `Am`, `C#m`).

---

## 4. Coding Standards

### 4.1. TypeScript
- **Strict Typing**: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`.
- **No `any`**: Use explicit interfaces or `unknown` with type guards.
- **Type Location**: Domain models live in `src/types/index.ts`. Component-specific props remain in their respective component files.
- **File Extensions**: Use `.ts` for pure logic and `.tsx` for React components.

### 4.2. React & Components
- **Pure Functions First**: Extract non-UI calculations, string manipulation, and musical logic into `src/lib/` as pure, testable functions.
- **Performance**:
  - Memoize expensive calculations (`useMemo` for song lists, filter tags, search indexing).
  - Use stable callbacks (`useCallback`) for event handlers passed to deep tree children.
  - Avoid layout thrashing in auto-scroll and animations (`requestAnimationFrame` only).
- **Cleanup**: Always clean up timers, event listeners, WakeLock handles, and animation frames in `useEffect` return functions.

### 4.3. Styling & Mobile UX
- **Mobile-First**: Design for small screens (360px–412px portrait) first, then scale up to desktop/tablet.
- **OLED / Low-Light Contrast**: Dark theme is primary; maintain high contrast for stage and campfire conditions.
- **Touch Ergonomics**: Minimum tap target size of 44x44px for touchable controls (buttons, chord chips, sliders).
- **Gestures**: Disable accidental pull-to-refresh (`overscroll-behavior-y: none`) and iOS tap highlights (`-webkit-tap-highlight-color: transparent`).

### 4.4. Storage & Defensive Programming
- **Storage Safety**: Always wrap `localStorage` access in try/catch to survive private mode restrictions and storage quota errors.
- **Payload Validation**: Never deserialize raw JSON from `localStorage` without a validator function verifying the schema.

---

## 5. Song File Format Standard

Built-in songs in `songs/*.txt` must adhere to:
```txt
---
title: Song Title
artist: Artist Name
key: G
tags:
  - rock
  - ognisko
---

[Zwrotka 1]
[G]                     [C]
Text with bracket chords or chords above lyrics line
```
- Slugs are derived directly from the filename (e.g., `songs/whisky.txt` -> `whisky`).
- Section headers must be wrapped in brackets (`[Zwrotka 1]`, `[Refren]`).

---

## 6. Testing & Quality Gate

Every change must satisfy the three-step validation pipeline:

```bash
# 1. Type check
npm.cmd run lint

# 2. Complete multi-tier test suite
npm.cmd test

# 3. Production build
npm.cmd run build
```

- **Unit & Logic Tests**: Located in `tests/`, covering boundary cases, fuzzing, and musical transposition.
- **E2E Browser Tests**: Run headless Chrome via CDP (`tests/*_cdp.ts`) testing 360px mobile viewports, touch auto-scroll, and offline caching.
