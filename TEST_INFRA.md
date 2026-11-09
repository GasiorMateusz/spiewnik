# Test Infrastructure & Specification: Spiewnik PWA (Stages 1, 2 & 3)

## 1. Test Philosophy

The testing architecture for **Spiewnik PWA (Stage 1: Interactive Chord Modal & Multi-Instrument Voicings; Stage 2: Song Viewer Polish, Responsive Typography & Screen Wake Lock; Stage 3: Hands-Free Auto-Scroll & Touch Gestures)** is built on the following foundational tenets:

- **Requirement-Driven & Opaque-Box**: Tests are derived strictly from authoritative specifications (`ORIGINAL_REQUEST.md`, `PROJECT.md`, `PRD.md`) rather than internal implementation quirks. We verify observable behavior, DOM outputs, SVG vector structures, user interaction events, responsive typography scaling, wake lock sentinels, 60 FPS sub-pixel scroll calculations, and touch interruption state machine cycles.
- **Zero-Debt Architecture**: Following the project's strict minimal-tooling policy, the testing suite requires zero extra test dependencies in `package.json` (no Jest, Vitest, Cypress, or Playwright bloat). The test runner operates natively on Node.js 22 with `--experimental-strip-types` and leverages `esbuild` for lightning-fast (sub-second) execution.
- **Multi-Tier Systematic Coverage**:
  - **Tier 1 (Feature Coverage)**: Independent happy-path verification for every single feature across the 72-feature inventory (F01–F30 for Stage 1, F31–F45 for Stage 2, F46–F72 for Stage 3).
  - **Tier 2 (Boundary & Corner Cases)**: Edge cases, single-variation ($N=1$), multi-voicing ($N=5$), uncataloged slash chords, font scaling boundaries ($[-4\text{px}, +12\text{px}]$), transposition bounds ($\pm 24$ semitones), wake lock denial, minimum speed (15 px/s) fractional accumulation, maximum speed (120 px/s), bottom detection tolerance ($y + \text{vh} \ge h - 2$), short song zero-scroll, tab freeze time clamp ($\Delta t \le 100$ms), and start-at-bottom smooth reset.
  - **Tier 3 (Cross-Feature Combinations)**: Pairwise and multi-way interactions (e.g. Transposition + Polish Notation + Modal Trigger, font scaling + transposition + Polish notation toggle, wake lock + navigation lifecycle, dock control event isolation during active scroll, jump-to-top during interrupted countdown, explicit pause cancelling auto-resume, accumulator resync on manual repositioning).
  - **Tier 4 (Real-World Musician Scenarios)**: Authentic musician workflows tested end-to-end on real repository songs (*Wehikuł Czasu*, *Whisky*, *Lornetka*, *Bieszczadzkie Anioły*), stand-distance font scaling on narrow viewports (360px), campfire hands-free auto-scroll performance, touch interruption rehearsal cycles, and jump-to-top practice loops.
  - **Live Browser CDP Automation**: Real headless Chrome DevTools Protocol automation testing native `<dialog>` events, button taps, font scaling controls, semitone transposition and one-tap reset, notation toggle, back navigation, floating dock controls, speed slider adjustments, touch interruption debouncing, 3s auto-resume, jump-to-top reset, bottom clean stop, and Service Worker offline precaching.
- **Empirical Authoritative Oracles**: Expected outputs are derived mathematically from 12-semitone chromatic theory, exact fretboard geometries, chords database ground truth, and sub-pixel frame integration math $\Delta y = \text{speed} \times \frac{\Delta t}{1000}$.

---

## 2. Feature Inventory Mapping (72 Features)

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

### Stage 3: Hands-Free Auto-Scroll & Touch Gestures (F46–F72)

| Feature # | Feature Name | Description | Source Implementation | Test Location | Status |
|-----------|--------------|-------------|-----------------------|---------------|--------|
| **F46** | Bottom Floating Dock Shell | Pinned bottom overlay, centered, max-w-xl, rounded-2xl, backdrop blur | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F47** | Play / Pause Toggle Button | Primary button toggling scrolling/paused with PlayIcon/PauseIcon | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F48** | Dynamic Velocity Slider | Range input adjusting velocity 15–120 px/s with live numerical display | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F49** | Jump-to-Top Button | Dedicated button with `ArrowUpIcon` ("Wróć na górę") resetting to top | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F50** | State & Countdown Indicator | Real-time badge/text showing state countdown ("Wznowienie za 3s...") | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F51** | High-Contrast Stage Styling | Dark theme OLED styling (`bg-neutral-900/95`, border, amber) & light theme | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F52** | Mobile Thumb Tap Targets | Hit areas $\ge 40\times 40$px for interactive buttons & sliders | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F53** | Safe Area Insets & Floating Offset | Respects iOS/Android gesture bar (`env(safe-area-inset-bottom)`) with clearance | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F54** | SongViewer Bottom Content Padding | Lyrics container includes `pb-28 sm:pb-32` preventing dock occlusion | `src/components/SongViewer.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F55** | RAF Scroll Driver Loop | Smooth scrolling loop driven via `window.requestAnimationFrame` | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F56** | Sub-Pixel Delta Calculation | High-resolution elapsed time calculation: $\Delta y = \text{speed} \times \frac{\Delta t}{1000}$ | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F57** | Sub-Pixel Floating Accumulator | Floating-point accumulator prevents integer truncation freeze at 15 px/s | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F58** | Background Tab Time Capping | Caps elapsed $\Delta t \le 100$ms to prevent runaway scroll jumps on tab switch | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F59** | Clean Bottom Detection & Stop | Detects scroll end ($y + \text{vh} \ge h - 2$px), halts RAF, transitions to idle | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F60** | Target Container Flexibility | Engine defaults to `window` with containerRef / scrollTarget fallback | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F61** | Three-State Finite State Machine | Strict FSM managing `idle`, `scrolling`, and `interrupted` states | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F62** | Touch / Flick Gesture Detection | Passive listeners (`touchstart`, `touchmove`, `wheel`, `pointerdown`) | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F63** | Dock Control Event Isolation | Gestures originating within floating dock do not trigger interruption | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F64** | Immediate Scroll Halting on Gesture | Instantly stops RAF loop upon gesture detection when in `scrolling` state | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F65** | 3-Second Auto-Resume Timer | Starts 3000ms countdown upon gesture interruption; auto-resumes scrolling | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F66** | Gesture Debounce / Timer Reset | Repeated touch, drag, or flick gestures during `interrupted` reset 3000ms | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F67** | Position Re-sync on Resume | Resets sub-pixel accumulator to physical DOM `window.scrollY` on reposition | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F68** | Explicit Pause Semantics | Tapping Pause during `scrolling` or `interrupted` cancels timer & enters idle | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F69** | Explicit Play / Resume Semantics | Tapping Play during `interrupted` cancels timer & immediately resumes | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F70** | At-Bottom Start Behavior | Tapping Start when already at bottom scrolls to top and starts cleanly | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F71** | Dynamic Velocity Modification | Dragging speed slider while auto-scroll is running immediately alters speed | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |
| **F72** | Lifecycle & Cleanup | Cancels active RAF, clears 3s timer, unregisters window listeners on unmount | `src/components/AutoScroll.tsx` | `tests/stage3_tier1_feature_coverage.ts` | **PASS** |

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
│   ├── hook_harness.ts                   # Lightweight React 18/19 hook dispatcher & mock environment
│   └── autoscroll_harness.ts             # Virtual clock, RAF driver, touch dispatcher & AutoScroll controller
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
├── stage3_tier1_feature_coverage.ts      # Stage 3 feature coverage for F46–F72
├── stage3_tier2_boundary_corner.ts       # Stage 3 sub-pixel math, bounds [15, 120], bottom tolerance, clamps
├── stage3_tier3_cross_feature.ts         # Stage 3 cross-feature interactions (dock isolation, wake lock, timers)
├── stage3_tier4_musician_scenarios.ts    # Stage 3 musician hands-free performance, touch debounce, practice loops
├── stage3_tier_e2e_cdp.ts                # Stage 3 live Headless Chrome CDP mobile testing (360px viewport)
└── run_all_tests.ts                      # Master test orchestrator & CLI reporter
```

---

## 4. Real-World Application Scenarios (Tier 4)

1. **"Wehikuł Czasu" (Dżem) Hands-Free Campfire Performance**:
   - Musician plays guitar around campfire with phone placed on stand.
   - Starts auto-scroll at 25 px/s.
   - Scrolls continuously for 15 virtual seconds (900 frames at 60 FPS) with strictly monotonic downward progression.
   - Content padding (`pb-28 sm:pb-32`) ensures final lyrics lines are completely visible above floating dock overlay.

2. **"Whisky" (Dżem) Live Rehearsal Touch Interruption & Resume Cycle**:
   - Musician auto-scrolls down to verse 2, touches screen to pause and practice chord transitions.
   - Immediate pause and 3s countdown badge armed.
   - Musician adjusts finger position with touchmove, triggering debounced timer reset.
   - 3 seconds of inactivity smoothly resumes scrolling from manual position down to song end, where clean bottom stop occurs within 2px tolerance.

3. **"Bieszczadzkie Anioły" Solo Practice & Jump-to-Top Loop**:
   - Musician rehearses chorus at 50 px/s.
   - Hits Jump-to-top button: cancels scrolling, resets `window.scrollY` to 0 cleanly.
   - Restarts scrolling from top for second practice run.

4. **Production Repertoire Complete Parsing & SongViewer Rendering**:
   - Automated full parse and render across all 4 production song files in `./songs/`:
     - `bieszczadzkie-anioly.txt`
     - `wehikul-czasu.txt`
     - `whisky.txt`
     - `lornetka.txt`
   - Verifies 100% of songs mount AutoScroll floating dock and include bottom clearance padding.

---

## 5. Coverage & Integrity Thresholds

- **Total Test Suites**: 18 suites (7 Stage 1 suites + 5 Stage 2 suites + 6 Stage 3 suites).
- **Total Test Cases**: 238 test cases.
- **Pass Rate Threshold**: 100% (0 failures allowed, 238/238 passed).
- **Compilation Requirement**: `npm.cmd run build` completes with 0 TypeScript and bundling errors.
- **Database Exhaustiveness**: Fuzz rendering across all 4,183 unique chord variations in `@tombatossals/chords-db` (2,069 Guitar + 2,114 Ukulele).
- **Live Chrome CDP Validation**: Automated headless Chrome exercising 360px mobile viewport, dynamic velocity slider, touch gestures, 3-second auto-resume countdown, dock isolation, jump-to-top reset, and clean bottom stop.
- **Stage 3 Tier 5 Adversarial Hardening**: Stress-tested 5000+ frame runs at 60 and 120 FPS verifying $\le 1$px accumulator drift, variable framerate jitter (5ms–35ms), rapid touch bursts (50+ gestures) with continuous slider velocity alteration, debounce timer integrity, dock control event isolation, sudden orientation changes (Portrait <-> Landscape), content shrinkage, zero-height container fallback, rapid jump-to-top tapping, 15-second background tab suspension, rapid visibility flapping, and 200-step chaos monkey fuzzing.
