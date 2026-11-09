# Product Requirements Document (PRD): Mobile Offline Songbook PWA

## 1. Product Vision & Goals
A minimalist, high-performance, offline-first mobile Progressive Web App (PWA) designed for musicians at rehearsals, campfires, and stage performances. Songs are managed as plain-text files in a Git repository and automatically deployed to GitHub Pages.

---

## 2. Requirements Specification

### 2.1. Content & Song File Specification
- **REQ-CNT-1 (Storage Location)**: Songs are stored as `.txt` files in `songs/**/*.txt`, supporting both a flat structure (`songs/*.txt`) and author subdirectories (`songs/<artist>/*.txt`).
- **REQ-CNT-2 (Frontmatter Metadata)**: Every song file must include YAML frontmatter:
  - `title`: Song title (string, required).
  - `artist`: Artist / band name (string, required).
  - `key`: Original musical key, e.g. `C`, `Am`, `G` (string, required).
  - `tags`: Genre / categorization tags, e.g. `[rock, biesiada]` (array of strings, optional).
- **REQ-CNT-3 (Chords-Above-Lyrics Format)**: Song body uses the standard chords-above-lyrics notation, with section headers in square brackets (e.g. `[Intro]`, `[Zwrotka 1]`, `[Refren]`).
- **REQ-CNT-4 (Build-Time Bundling)**: Song files are globbed and compiled into the application bundle at build time, ensuring 100% offline availability with 0 runtime fetch latency.

### 2.2. Catalog, Navigation & Search
- **REQ-CAT-1 (Dual Catalog Tabs)**:
  - **Piosenki**: Alphabetical list of all songs with real-time search.
  - **Wykonawcy**: Alphabetical list of artists displaying song count (e.g. *Dżem (2)*); tapping an artist filters down to their songs.
  - **Ulubione**: Filter tab displaying starred favorites (★).
- **REQ-CAT-2 (Instant Search)**: Real-time search across Title, Artist, Tags, and full Lyrics text.
- **REQ-CAT-3 (Contextual Lyric Snippet)**: When a search query matches words inside a song's lyrics (rather than title/artist), the song card displays a 1-line snippet of the matching lyric line.
- **REQ-CAT-4 (Tag Filtering)**: Horizontal scrollable filter chips for quick filtering by genre/category tags.
- **REQ-CAT-5 (Hash Routing)**: Lightweight native hash routing (`#/`, `#/song/:slug`, `#/artist/:slug`) supporting browser history, bookmarks, and mobile back button navigation.

### 2.3. Song Viewer & Responsive Typography
- **REQ-VIEW-1 (Atomic Chord-Syllable Wrapping)**: Each chord is bound to its lyric syllable/word in a vertical column (`inline-flex flex-col`). Lines wrap cleanly at word boundaries on narrow mobile screens (360–400px) with zero chord-to-lyric drift.
- **REQ-VIEW-2 (Font Size Scaling)**: Performer-controlled font scaling buttons (`A-` / `A+`) to optimize viewing distance on music stands.
- **REQ-VIEW-3 (Distraction-Free Navigation)**: Song viewer provides a top back button (←) to return directly to the catalog; no adjacent next/prev song clutter.

### 2.4. Musical Notation, Transposition & Enharmonics
- **REQ-NOT-1 (Semitone Transposition)**: Full $\pm N$ semitone transposition shift with a one-tap reset button (*"Przywróć oryginalną tonację"*).
- **REQ-NOT-2 (Sharp Enharmonic Preference)**: Transposed accidentals must default to sharp spellings (`F#`, `C#`, `G#`, `D#`, `A#`) rather than flats.
- **REQ-NOT-3 (Minor Chord Notation)**: Minor chords must display in standard notation using uppercase root + `m` (e.g. `Am`, `Dm`, `Fm`, `F#m`).
- **REQ-NOT-4 (Polish Notation Toggle)**: Toggle between Polish notation (`H` for B natural, `B` for B-flat) and International notation (`B` for B natural, `Bb` for B-flat), with Polish notation active by default.

### 2.5. Chord Voicings & Diagram Modal
- **REQ-CHD-1 (Multi-Instrument Support)**: Fretboard diagrams for **Guitar** (6 strings, standard EADGBE) and **Ukulele** (4 strings, standard GCEA).
- **REQ-CHD-2 (Strict Lookup & Fallback)**: Exact chord matches render vector SVG diagrams displaying strings, frets, finger numbers, barre chords, and open/muted string indicators. Uncataloged or slash chords display a clean notice: *"Diagram niedostępny dla tego chwytu"*.
- **REQ-CHD-3 (Dual Access Points)**: Tapping any chord chip (in the top quick-reference bar or inline in the lyrics) immediately opens the Chord Modal.
- **REQ-CHD-4 (Variation Carousel)**: Chord modal provides a variation carousel (`◀ 1 z N ▶`) to browse alternative voicings/positions.
- **REQ-CHD-5 (Instrument Switcher)**: Instrument toggle accessible in the top header and directly inside the Chord Modal.

### 2.6. Hands-Free Auto-Scroll & Screen Wake Lock
- **REQ-SCR-1 (Floating Dock)**: Bottom floating dock with Play/Pause, speed adjustment slider/buttons (15–120 px/s), and jump-to-top button.
- **REQ-SCR-2 (Touch Gesture Interruption)**: Touching or flicking the screen during active auto-scroll immediately pauses scrolling and automatically resumes after 3 seconds of inactivity.
- **REQ-SCR-3 (Screen Wake Lock)**: Screen Wake Lock API is automatically acquired upon opening any song in `SongViewer` and released when navigating back to the catalog.

### 2.7. State & User Preference Persistence
- **REQ-PER-1 (Per-Song Persistence)**: Custom transposition offset and custom scroll speed persist per song slug in `localStorage`.
- **REQ-PER-2 (Global Persistence)**: Active instrument, dark/light theme, Polish notation toggle, global font size offset, and favorites list persist globally in `localStorage`.

### 2.8. Offline PWA & Deployment
- **REQ-PWA-1 (100% Offline Caching)**: Service worker precaches application shell, icons, songs, and chord databases for complete offline capability.
- **REQ-PWA-2 (Silent Background Updates)**: Service worker checks for updates silently in the background and displays a non-intrusive toast notification (*"Nowe piosenki pobrane"*) with an optional reload button; never reloads or interrupts an open song.
- **REQ-PWA-3 (GitHub Pages CI/CD)**: Automated deployment to GitHub Pages via GitHub Actions workflow on every push to `master`.

### 2.9. Localization & UI Theme
- **REQ-LOC-1 (Polish Interface)**: All UI labels, placeholders, buttons, and system messages are in Polish.
- **REQ-UI-1 (Dark Mode by Default)**: High-contrast dark theme by default (with dark/light switcher) for OLED power savings and glare-free stage/campfire readability.
