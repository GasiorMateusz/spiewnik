# Technical Implementation Plan: Offline Songbook PWA

This technical plan details the architecture, external dependencies, system workflows, and phased execution roadmap for the Mobile Offline Songbook PWA.

---

## 1. Architecture & System Design

### 1.1. High-Level System Architecture

```mermaid
flowchart TD
    subgraph BuildTime ["Build Time & Bundler (Vite)"]
        SongsDir["songs/**/*.txt"] -->|import.meta.glob| EagerLoader["Vite Ingest (?raw)"]
        EagerLoader --> NativeParser["songParser.ts\n(Frontmatter + Column Binder)"]
        ChordsDbJSON["@tombatossals/chords-db\n(Lazy loaded guitar & ukulele JSON)"] --> DynamicBundle["Lazy Chord DB Chunk"]
        NativeParser --> Bundle["Client Application Bundle"]
    end

    subgraph RuntimeClient ["Client Runtime (Browser PWA)"]
        SW["Service Worker (sw.js)\nOffline Cache Engine"] --> UI
        
        subgraph StateManagement ["State & Navigation"]
            HashRouter["Hash Router\n(useSyncExternalStore)"]
            LocalStore["Typed localStorage\n(Preferences & Per-Song Key/Speed)"]
            WakeLock["Screen Wake Lock API\n(Active in SongViewer)"]
        end

        subgraph PresentationLayer ["UI Components"]
            Header["Header (Theme, Instrument, Offline Status)"]
            SongList["SongList (Dual View: Piosenki / Wykonawcy, Search)"]
            SongViewer["SongViewer (Atomic Flex Wrap, Font Scaler)"]
            AutoScroll["AutoScroll Dock (Touch Pause & 3s Auto-Resume)"]
            ChordModal["ChordModal (Native <dialog> + Fretboard SVG)"]
        end

        HashRouter --> SongList
        HashRouter --> SongViewer
        LocalStore <--> SongViewer
        LocalStore <--> Header
        WakeLock <--> SongViewer
    end
```

### 1.2. Zero-Dependency Hash Routing Architecture
Navigation relies on browser hash routing (`#/`, `#/song/:slug`, `#/artist/:slug`) without third-party router libraries:
- Implemented with React 19's native `useSyncExternalStore`:
  ```ts
  export function useHashRoute(): string {
    return useSyncExternalStore(
      (notify) => {
        window.addEventListener('hashchange', notify);
        return () => window.removeEventListener('hashchange', notify);
      },
      () => window.location.hash || '#/'
    );
  }
  ```
- Guarantees instant client-side route changes on GitHub Pages without 404 rewriting or server configuration.

### 1.3. Persistence Schema (`localStorage`)
```ts
interface LocalStorageSchema {
  // Global settings
  'spiewnik_theme': 'dark' | 'light';
  'spiewnik_instrument': 'guitar' | 'ukulele';
  'spiewnik_polish_notation': boolean;
  'spiewnik_font_offset': number; // -4 to +12 px
  'spiewnik_favorites': string[]; // Array of song slugs

  // Per-song settings (keyed by slug)
  'spiewnik_song_pref_<slug>': {
    transpose: number;    // Semitone shift (+/- N)
    scrollSpeed: number;  // Pixels per second (15-120)
  };
}
```

---

## 2. Dependencies & Zero-Debt Tools Strategy

The architecture follows a strict minimal-tooling policy: native Web Platform APIs and concise TypeScript functions replace heavy external libraries, reducing `node_modules` by >60 MB and bundle size by >300 KB:

| Dependency | Category | Role in Architecture | Hand-Rolled Code Replaced / Rationale |
|---|---|---|---|
| **`react` & `react-dom`** | Core UI | High-performance declarative component rendering (React 19). | Core framework. |
| **`@tombatossals/chords-db`** | Data Source | Provides verified fretboard positions, fingerings, and barres for Guitar (6 strings) and Ukulele (4 strings). | Lazy-loaded dynamically on modal trigger; eliminates manual voicing curation. |
| **`@tailwindcss/vite`** | Styling Engine | Zero-config Tailwind CSS v4 pipeline configured directly in Vite. | Eliminates PostCSS and Tailwind configuration files. |
| **`vite-plugin-pwa`** | PWA & Offline | Generates service worker, precaches static assets and song bundles, configures auto-update lifecycle. | Replaces manual service worker caching scripts. |
| *(Replaced)* `chordsheetjs` | Native Parser | Replaced by `songParser.ts` (~80 lines) and `chordNotation.ts` (~60 lines). | Direct column-by-column chord/lyric binding for atomic flex wrapping; exact sharp accidental preference and Polish `H`/`B` notation. |
| *(Replaced)* `gray-matter` | Native Parser | Replaced by `parseFrontmatter` in `songParser.ts` (~15 lines). | Eliminates Node.js `Buffer` and `js-yaml` dependencies from the client bundle. |
| *(Replaced)* `lucide-react` | Native SVGs | Replaced by `Icons.tsx` (~60 lines). | Eliminates 36.8 MB package on disk for ~8 standard UI icons. |
| *(Replaced)* `react-chords` | Native SVG | Replaced by `ChordSvg.tsx` (256 lines). | Custom React 19 SVG fretboard renderer with dark-theme styling. |

---

## 3. Technical Workflows & State Machines

### 3.1. Song Ingestion & Build-Time Globbing Pipeline
```
[songs/**/*.txt]
      │
      ▼  Vite eager glob (query: '?raw')
[Raw String Map: { path: rawText }]
      │
      ▼  parseFrontmatter(rawText) [title, artist, key, tags]
      │
      ▼  bindChordsAndLyrics(chordLine, lyricLine)
[ParsedSong: lines with ChordSegments bound for flex wrapping]
      │
      ▼
[Memory Catalog Array in Client Bundle]
```

### 3.2. Transposition & Polish Notation Formatting Pipeline
```mermaid
sequenceDiagram
    participant User as Musician (UI)
    participant Viewer as SongViewer
    participant Transposer as chordNotation.ts

    User->>Viewer: Click Transpose (+1)
    Viewer->>Transposer: transposeChord(chord, shift, isPolishNotation)
    Note over Transposer: Computes (idx + shift) % 12, applies sharp preference and Polish H/B
    Transposer-->>Viewer: Return transposed chord string (e.g. C -> C#, Am -> Bm/Hm)
    Viewer-->>User: Instant DOM re-render without AST cloning
```

### 3.3. Strict Chord Lookup & SVG Rendering Workflow
1. User taps chord chip (e.g. `F#m`) in top bar or inline in lyrics.
2. `chordDb.ts` maps chord string to key & suffix:
   - Guitar: `F#m` -> Key `Fsharp`, Suffix `minor`.
   - Ukulele: `F#m` -> Key `Gb`, Suffix `minor`.
3. Check chords database entry:
   - **Found**: Pass positions array into `<ChordModal />`. Render SVG fretboard diagram with variation carousel (`◀ Position 1 of N ▶`).
   - **Not Found (slash/uncataloged)**: Return `null`. Display fallback message: *"Diagram niedostępny dla tego chwytu"*.

### 3.4. Auto-Scroll Engine & Touch Interruption State Machine
```mermaid
stateDiagram-v2
    [*] --> Idle: Song loaded
    Idle --> Scrolling: Tap Play
    Scrolling --> Idle: Tap Pause / Reached Bottom
    Scrolling --> Interrupted: User touch / flick gesture detected
    
    state Interrupted {
        [*] --> PausedTimer: Pause scroll
        PausedTimer --> PausedTimer: User continues touch
        PausedTimer --> AutoResume: 3 seconds without touch
    }
    
    Interrupted --> Scrolling: Auto-resume fires
    Interrupted --> Idle: Tap Pause explicitly
```

### 3.5. Screen Wake Lock Lifecycle
- **Mount `SongViewer`**:
  ```ts
  if ('wakeLock' in navigator) {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
  }
  ```
- **Visibility Change**: When browser tab regains focus, automatically re-acquire lock.
- **Unmount `SongViewer`**: Release sentinel cleanly.

### 3.6. PWA Precaching & Background Update Workflow
1. App initializes `virtual:pwa-register`.
2. Service Worker registers and caches all assets defined in `dist/`.
3. If a new deployment is pushed to GitHub Pages, the Service Worker installs in the background.
4. When installation finishes, trigger `onNeedRefresh`:
   - Display non-intrusive toast: *"Nowe piosenki pobrane"* with *"Odśwież"* button.
   - User clicks *"Odśwież"* -> Service worker skips waiting and updates client.

### 3.7. GitHub Pages CI/CD Workflow (`.github/workflows/deploy.yml`)
1. Trigger: Push to branch `master`.
2. Job:
   - Checkout repository.
   - Setup Node.js 22.
   - Run `npm ci` and `npm run build`.
   - Upload `dist/` directory via `actions/upload-pages-artifact`.
   - Deploy to GitHub Pages via `actions/deploy-pages`.

---

## 4. Directory Structure & Module Boundaries

```
spiewnik/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD automated build and deploy to GitHub Pages
├── docs/
│   ├── PRD.md                      # Product Requirements Document
│   └── PLAN.md                     # This implementation plan
├── songs/                          # Song files (flat or grouped by author)
│   ├── lornetka.txt
│   ├── wehikul-czasu.txt
│   ├── whisky.txt
│   └── bieszczadzkie-anioly.txt
├── src/
│   ├── components/
│   │   ├── AutoScroll.tsx          # Floating dock + 3s touch pause + jump to top
│   │   ├── ChordModal.tsx          # Native HTML5 <dialog> with ChordSvg variation carousel
│   │   ├── ChordSvg.tsx            # SVG vector fretboard renderer (guitar 6-str / uke 4-str)
│   │   ├── Header.tsx              # Nav bar, instrument toggle, theme toggle, offline badge
│   │   ├── Icons.tsx               # Minimal, zero-dep SVG icon set (replacing 37MB lucide-react)
│   │   ├── SongList.tsx            # Dual view (Piosenki / Wykonawcy), search, tag chips, favorites
│   │   ├── SongViewer.tsx          # Atomic chord-syllable flex wrap, transposer, font scaler
│   │   └── Toast.tsx               # Subtle PWA update toast
│   ├── hooks/
│   │   ├── useHashRoute.ts         # Native 3-line useSyncExternalStore hash router
│   │   ├── useWakeLock.ts          # Screen Wake Lock API lifecycle hook
│   │   └── useLocalStorage.ts     # Typed storage hook for preferences & per-song state
│   ├── lib/
│   │   ├── chordDb.ts              # Lazy-loaded lookup against chords-db guitar/ukulele JSON
│   │   ├── chordNotation.ts        # Polish notation (H/B), sharp accidentals, fast transposition
│   │   └── songParser.ts           # Zero-dep frontmatter extractor + atomic flex column binder
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces (Song, Instrument, Preferences)
│   ├── App.tsx                     # Top layout + hash routing switch
│   ├── main.tsx                    # React root + PWA service worker registration
│   ├── vite-env.d.ts               # Vite client types
│   └── index.css                   # Tailwind v4 import
├── index.html                      # Mobile shell (theme-color, viewport-fit=cover)
├── package.json                    # Dependencies & build scripts (clean 3 deps)
├── tsconfig.json                   # Strict TypeScript compiler options
└── vite.config.ts                  # Vite + Tailwind + VitePWA precaching config
```

---

## 5. Phased Implementation Roadmap

### Phase 1: Project Scaffolding & Zero-Debt Architecture *(Status: Completed)*
- [x] Initialized Vite 6 + React 19 + TypeScript + Tailwind CSS v4.
- [x] Streamlined dependencies: removed `chordsheetjs`, `gray-matter`, `lucide-react`, `@types/node`, `react-chords`.
- [x] Configured PWA manifest, viewport meta tags, and mobile shell.
- [x] Seeded starter songs in `songs/`.
- [x] Verified build output: `npm.cmd run build` succeeds with 0 errors.

### Phase 2: Content Pipeline & Native Engine *(Status: Completed)*
- [x] Implemented `src/lib/songParser.ts` for zero-dep frontmatter parsing and column-bound flex tokens.
- [x] Implemented `src/lib/chordNotation.ts` for Polish `H`/`B` notation and sharp enharmonics.
- [x] Implemented `src/components/Icons.tsx` replacing external icon libraries.
- [x] Implemented `src/lib/chordDb.ts` with lazy-loaded guitar and ukulele chord lookups.
- [x] Verified build and type checking against starter songs.

### Phase 3: Chord Database & Modal Component
- [ ] Implement `src/lib/chordDb.ts` querying `@tombatossals/chords-db` for guitar and ukulele chord voicings.
- [ ] Implement `src/components/ChordModal.tsx` using native HTML5 `<dialog>` and `ChordSvg.tsx`.
- [ ] Add variation carousel (`◀ 1 z N ▶`) and instrument switcher inside the modal.

### Phase 4: Song Viewer, Transposition & Auto-Scroll
- [ ] Implement `src/hooks/useWakeLock.ts` to manage screen lock during song viewing.
- [ ] Implement `src/components/AutoScroll.tsx` with floating bottom dock, speed controls, and 3-second touch pause auto-resume.
- [ ] Implement `src/components/SongViewer.tsx`:
  - Top quick-reference chord chips bar.
  - Atomic chord-syllable flex wrapping columns.
  - Transposition controls with built-in `song.transpose()` and reset button.
  - Font scaling buttons (`A-` / `A+`).
  - Top back button (←) to catalog.

### Phase 5: Catalog, Wykonawcy View & Search
- [ ] Implement `src/hooks/useHashRoute.ts` with `useSyncExternalStore`.
- [ ] Implement `src/hooks/useLocalStorage.ts` for per-song persistence and global preferences.
- [ ] Implement `src/components/Header.tsx` (Instrument switch, theme toggle, offline status).
- [ ] Implement `src/components/SongList.tsx`:
  - Tab 1: **Piosenki** (instant search across title, artist, tags, lyrics with snippet preview).
  - Tab 2: **Wykonawcy** (alphabetical artist listing with song count, drilldown to songs).
  - Tab 3: **Ulubione** (starred songs filter).
  - Tag filter chips bar.

### Phase 6: PWA Registration, Polish UI & CI/CD
- [ ] Implement `src/components/Toast.tsx` for PWA update alerts.
- [ ] Register Service Worker update callbacks in `src/main.tsx`.
- [ ] Create `.github/workflows/deploy.yml` for automated GitHub Pages deployment.
- [ ] Final verification: offline test in DevTools, mobile responsiveness, chord accuracy.

---

## 6. Verification & Automated Testing Plan

### Automated Checks
```powershell
# Type checking and production bundle build
npm.cmd run build

# Verify PWA service worker and precache generation
Test-Path dist/sw.js
Test-Path dist/manifest.webmanifest
```

### Manual Verification Matrix
1. **Catalog & Navigation**:
   - Verify switching between **Piosenki**, **Wykonawcy**, and **Ulubione** tabs.
   - Verify typing in search box filters by title, artist, tag, and lyric text.
   - Verify deep linking: navigating to `#/song/lornetka` directly opens the song viewer.
2. **Song Layout & Chords**:
   - Verify atomic wrapping: on mobile viewport (375px), long lines wrap at word boundaries without chords detaching from syllables.
   - Verify tapping chord chips (in top bar or inline) opens `ChordModal`.
   - Verify variation carousel navigates alternative fingerings.
3. **Transposition & Notation**:
   - Transpose song up/down; verify chords shift by semitone using sharp accidentals (`#`).
   - Toggle Polish notation; verify `B` natural transforms to `H`.
4. **Auto-Scroll & Wake Lock**:
   - Start auto-scroll; flick screen and verify scroll pauses for 3 seconds, then automatically resumes.
   - Verify screen does not dim or sleep while `SongViewer` is mounted.
5. **Offline Reliability**:
   - Set DevTools `Network: Offline`. Refresh page. Verify full catalog, song viewer, and chord diagrams work without network access.
