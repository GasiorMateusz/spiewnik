# Test Infrastructure & Specification: Spiewnik PWA (Stages 1 & 2)

## 1. Test Philosophy

The testing architecture for **Spiewnik PWA (Stage 1: Interactive Chord Modal & Multi-Instrument Voicings; Stage 2: Song Viewer Polish, Responsive Typography & Screen Wake Lock)** is built on the following foundational tenets:

- **Requirement-Driven & Opaque-Box**: Tests are derived strictly from authoritative specifications (`ORIGINAL_REQUEST.md`, `PROJECT.md`, `PRD.md`) rather than internal implementation quirks. We verify observable behavior, DOM outputs, SVG vector structures, user interaction events, responsive typography scaling, wake lock sentinels, and audio-visual musician contracts.
- **Zero-Debt Architecture**: Following the project's strict minimal-tooling policy, the testing suite requires zero extra test dependencies in `package.json` (no Jest, Vitest, Cypress, or Playwright bloat). The test runner operates natively on Node.js 22 with `--experimental-strip-types` and leverages `esbuild` for lightning-fast (sub-second) execution.
- **Multi-Tier Systematic Coverage**:
  - **Tier 1 (Feature Coverage)**: Independent happy-path verification for every single feature across the 45-feature inventory (F01–F30 for Stage 1, F31–F45 for Stage 2).
  - **Tier 2 (Boundary & Corner Cases)**: Edge cases, single-variation ($N=1$), multi-voicing ($N=5$), uncataloged slash chords, font scaling boundaries ($[-4\text{px}, +12\text{px}]$), transposition bounds ($\pm 24$ semitones), syllable-less chords, chord-less lyrics, wake lock denial and unmount in-flight releases.
  - **Tier 3 (Cross-Feature Combinations)**: Pairwise and multi-way interactions (e.g. Transposition + Polish Notation + Modal Trigger, font scaling + transposition + Polish notation toggle, wake lock + navigation lifecycle, theme toggle + typography scaling).
  - **Tier 4 (Real-World Musician Scenarios)**: Authentic musician workflows tested end-to-end on real repository songs (*Wehikuł Czasu*, *Whisky*, *Lornetka*, *Bieszczadzkie Anioły*), stand-distance font scaling on narrow viewports (360px), campfire vocal range transpositions, and Polish campfire songbook conventions.
  - **Live Browser CDP Automation**: Real headless Chrome DevTools Protocol automation testing native `<dialog>` events, button taps, font scaling controls, semitone transposition and one-tap reset, notation toggle, back navigation, and Service Worker offline precaching.
- **Empirical Authoritative Oracles**: Expected outputs are derived mathematically from 12-semitone chromatic theory, exact fretboard geometries, and chords database ground truth.

---

## 2. Feature Inventory Mapping (45 Features)

### Stage 1: Interactive Chord Modal & Multi-Instrument Voicings (F01–F30)

| Feature # | Feature Name | Description | Source Implementation | Test Location | Status |
|-----------|--------------|-------------|-----------------------|---------------|--------|
| **F01** | HTML5 `<dialog>` Shell | Native modal shell using `<dialog>` with `showModal()` / `close()` | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F02** | Backdrop Click Dismissal | Clicking outside modal content dismisses dialog | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F03** | Native Escape Key Dismissal | Escape key cancels dialog & syncs React state | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F04** | Top-Right Close Button | Dedicated button with `XIcon` to close modal | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F05** | Top Quick-Bar Chord Triggers | Clickable chord chips in top quick-reference bar | `src/App.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F06** | Inline Lyric Chord Triggers | Clickable chord tokens rendered directly above lyrics | `src/App.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F07** | Transposition & Notation Awareness | Trigger passes transposed & Polish formatted chord | `src/lib/chordNotation.ts`, `src/App.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F08** | Guitar Voicings (6 Strings) | Fretboard diagram with 6 strings & EADGBE tuning notes | `src/components/ChordSvg.tsx`, `src/lib/chordDb.ts` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F09** | Ukulele Voicings (4 Strings) | Fretboard diagram with 4 strings & GCEA tuning notes | `src/components/ChordSvg.tsx`, `src/lib/chordDb.ts` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F10** | In-Modal Instrument Toggle | Segmented control inside modal to switch Gitara ↔ Ukulele | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F11** | Top Header Instrument Toggle | Global switcher in app header allowing instrument selection | `src/App.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F12** | Carousel Navigation Controls | Cycling controls formatted as `◀ 1 z N ▶` | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F13** | Wrap-Around Cycling | Navigating before 1 wraps to N; past N wraps to 1 | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F14** | Single-Voicing Handling | When N=1, displays `1 z 1` with disabled arrow buttons | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F15** | Vector Fretboard Grid | Precision SVG rendering of neck frets and strings in dark theme | `src/components/ChordSvg.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F16** | Open & Muted String Markers | Circle marker for open string (fret 0) & red × for muted (-1) | `src/components/ChordSvg.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F17** | Barre Chord Rectangles | Rounded rect `#f59e0b` spanning barre frets with fingers | `src/components/ChordSvg.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F18** | Base Fret Number Display | Displays fret offset text (e.g. `3fr`) when played higher | `src/components/ChordSvg.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F19** | String Tuning Notes | Text labels at the bottom of each string showing tuning notes | `src/components/ChordSvg.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F20** | Uncataloged Chord Fallback | Displays clean Polish notice: "Diagram niedostępny dla tego chwytu" | `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F21** | Slash Chord Resolution | Uncataloged slash chords show fallback or map cleanly | `src/lib/chordDb.ts` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F22** | Polish Notation Normalization | Normalizes Polish root H -> B (natural) and B -> Bb (flat) | `src/lib/chordDb.ts`, `src/lib/chordNotation.ts` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F23** | Malformed Chord Degradation | Malformed input safely returns null without runtime exceptions | `src/lib/chordDb.ts` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F24** | Lazy Loading Chord DB | Guitar and Ukulele JSON datasets loaded dynamically on demand | `src/lib/chordDb.ts` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F25** | In-Memory Database Cache | Cached JSON instances after first dynamic import | `src/lib/chordDb.ts` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F26** | Offline PWA Precaching | Dynamic chord chunks precached by Service Worker for offline use | `dist/sw.js`, `vite.config.ts` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F27** | Zero-Debt Minimal Tooling | Pure React 19 + native dialog + Tailwind v4 + local SVGs | `package.json` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F28** | Comprehensive Polish UI | All user-facing strings, headers, and notices strictly in Polish | `src/App.tsx`, `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F29** | OLED Dark Theme | High-contrast dark styling (`#0a0a0a` / `#171717`) with amber | `src/App.tsx`, `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |
| **F30** | Touch Target Compliance | Hit areas for buttons and chord chips >= 40x40px | `src/App.tsx`, `src/components/ChordModal.tsx` | `tests/tier1_feature_coverage.ts` | **PASS** |

### Stage 2: Song Viewer Polish, Responsive Typography & Screen Wake Lock (F31–F45)

| Feature # | Feature Name | Description | Source Implementation | Test Location | Status |
|-----------|--------------|-------------|-----------------------|---------------|--------|
| **F31** | Dedicated SongViewer Component | Dedicated song component with header, toolbar, chord chips & lines | `src/components/SongViewer.tsx` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F32** | Atomic Chord-Syllable Flex Wrap | Wrap chord-syllables with `inline-flex flex-col` down to 360px | `src/components/SongViewer.tsx` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F33** | Performer Font Scaling Controls | `A-`/`A+` controls scaling font size in `[-4px, +12px]` range | `src/components/SongViewer.tsx` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F34** | Vertical Alignment Preservation | Dynamic line & row height preventing vertical text collision | `src/components/SongViewer.tsx` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F35** | Distraction-Free Back Button | Top `←` button (`ArrowLeftIcon`) wired to `onBack` & `#/` | `src/components/SongViewer.tsx` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F36** | Semitone Transposition Controls | `-1` / `+1` buttons shifting chord pitches chromatically | `src/components/SongViewer.tsx` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F37** | One-Tap Transposition Reset | Button labeled `Reset` ("Przywróć oryginalną tonację") | `src/components/SongViewer.tsx` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F38** | Sharp Enharmonic Preference | Transposed accidentals strictly default to sharp spellings (`#`) | `src/lib/chordNotation.ts` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F39** | Standard Minor Chord Formatting | Standardize minor chords as uppercase root + lowercase `m` | `src/lib/chordNotation.ts` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F40** | Polish Notation Toggle | Toggle button switching between PL (`H`/`B`) and INT (`B`/`Bb`) | `src/components/SongViewer.tsx`, `src/lib/chordNotation.ts` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F41** | Screen Wake Lock Acquisition | Hook `useWakeLock.ts` requests screen wake lock in viewer | `src/hooks/useWakeLock.ts` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F42** | Wake Lock Foreground Re-acquisition | Auto re-acquires lock on `visibilitychange` returning to tab | `src/hooks/useWakeLock.ts` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F43** | Wake Lock Clean Release | Releases sentinel cleanly on component unmount and view exit | `src/hooks/useWakeLock.ts` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F44** | Wake Lock Error Degradation | Gracefully suppresses rejections and handles unsupported envs | `src/hooks/useWakeLock.ts` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |
| **F45** | App Backward Compatibility | Preserves Stage 1 test contracts, chip triggers, and modals | `src/App.tsx` | `tests/stage2_tier1_feature_coverage.ts` | **PASS** |

---

## 3. Test Architecture & Runner Command

### Execution Command
The full test suite is configured in `package.json` under the `"test"` script:

```bash
npm.cmd test
# Or directly:
node --experimental-strip-types tests/run_all_tests.ts
```

### Directory Layout
```
tests/
├── helpers/
│   ├── test_framework.ts                 # Assertion helpers, timer harness, reporting summary
│   └── hook_harness.ts                   # Lightweight React 18/19 hook dispatcher & mock environment
├── tier1_feature_coverage.ts             # Happy-path coverage for Stage 1 features F01–F30
├── tier2_boundary_corner.ts              # Stage 1 boundary conditions, N=1, N=5, fuzzing, 4,183 DB chords
├── tier3_cross_feature.ts                # Stage 1 cross-feature combinations (transposition, instrument, notation)
├── tier4_real_world_scenarios.ts         # Stage 1 real-world musician song playback workflows
├── tier5_adversarial_hardening.ts        # Stage 1 adversarial coverage hardening
├── tier_e2e_cdp.ts                       # Stage 1 headless Chrome DevTools Protocol E2E browser automation
├── tier5_adversarial_stress.ts           # Stage 1 adversarial stress & offline precache validation
├── stage2_tier1_feature_coverage.ts      # Stage 2 feature coverage for F31–F45
├── stage2_tier2_boundary_corner.ts       # Stage 2 font bounds (-4/+12), transposition (+/-24), wake lock denial
├── stage2_tier3_cross_feature.ts         # Stage 2 cross-feature interactions (scaling + transpose + PL + modal)
├── stage2_tier4_musician_scenarios.ts    # Stage 2 musician stand distance, campfire vocal range, Polish conventions
├── stage2_tier_e2e_cdp.ts                # Stage 2 live Headless Chrome E2E browser automation (360px viewport)
└── run_all_tests.ts                      # Master test orchestrator & CLI reporter
```

---

## 4. Real-World Application Scenarios (Tier 4)

1. **"Wehikuł Czasu" (Dżem) Music Stand Scaling Scenario**:
   - Musician on dark stage at night with smartphone (360px viewport) on music stand 1.5m away.
   - Enlarges font size to maximum `+12px` offset (`lyricFontSize = 28px`, `chordFontSize = 20px`, `chordRowHeight = 25px`).
   - Verifies zero horizontal overflow, atomic chord-syllable flex wrapping, and high contrast OLED dark theme legibility.

2. **Campfire Vocal Range Transposition Scenario**:
   - Musician playing acoustic guitar around a campfire transposes *Wehikuł Czasu* by -2 semitones from A major to G major (`[G, D, Em, C]`).
   - Transposes *Whisky* by +3 semitones in Polish notation (`[B, D#, F]`).
   - Verifies all transposed chords resolve cleanly on both Guitar and Ukulele in chord database, and one-tap Reset button restores original key.

3. **Polish Campfire Songbook Convention Scenario**:
   - Musician playing SDM's *Bieszczadzkie Anioły*.
   - In Polish mode, transposing G major +4 semitones yields key of H (B natural in INT).
   - Toggling notation switches between Polish `H` and International `B`.
   - Tests Polish campfire minor chord `Hm` (B minor), verifying standard guitar voicing `[2, 2, 4, 4, 3, 2]` and ukulele voicing `[4, 2, 2, 2]`.
   - Transposes Hm across campfire keys (+5 to Em, -4 to Gm).

4. **Production Repertoire Complete Parsing & SongViewer Rendering**:
   - Automated full parse and render across all 4 production song files in `./songs/`:
     - `bieszczadzkie-anioly.txt`
     - `wehikul-czasu.txt`
     - `whisky.txt`
     - `lornetka.txt`
   - Verifies 100% of unique song chords resolve on Guitar and Ukulele, with 0 rendering errors.

---

## 5. Coverage & Integrity Thresholds

- **Total Test Suites**: 12 suites (7 Stage 1 suites + 5 Stage 2 suites).
- **Total Test Cases**: 153 test cases.
- **Pass Rate Threshold**: 100% (0 failures allowed, 153/153 passed).
- **Compilation Requirement**: `npm.cmd run build` completes with 0 TypeScript and bundling errors.
- **Database Exhaustiveness**: Fuzz rendering across all 4,183 unique chord variations in `@tombatossals/chords-db` (2,069 Guitar + 2,114 Ukulele).
- **Live Chrome CDP Validation**: Automated headless Chrome exercising 360px viewport metrics, interactive font scaling bounds, semitone transpositions, one-tap reset, Polish notation toggling, back navigation, native dialog modal triggers, and Screen Wake Lock lifecycle.
