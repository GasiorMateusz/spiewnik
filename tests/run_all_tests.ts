import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { TestRunner } from './helpers/test_framework.ts';

async function main() {
  console.log('\n================================================================');
  console.log('  SPIEWNIK PWA — AUTOMATED E2E & COMPREHENSIVE TEST SUITE       ');
  console.log('  Stage 1, 2, 3, 4 & 5 (Chord Modal, Song Viewer, Wake Lock, Auto-Scroll, Hash Routing, Dual Catalog & Search)');
  console.log('================================================================');

  const runner = new TestRunner();
  const cacheDir = path.join(process.cwd(), 'tests', '.cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const tiers = [
    // Stage 1 Test Suites
    { name: 'Stage 1 — Tier 1', entry: 'tests/tier1_feature_coverage.ts', fnName: 'runTier1Tests' },
    { name: 'Stage 1 — Tier 2', entry: 'tests/tier2_boundary_corner.ts', fnName: 'runTier2Tests' },
    { name: 'Stage 1 — Tier 3', entry: 'tests/tier3_cross_feature.ts', fnName: 'runTier3Tests' },
    { name: 'Stage 1 — Tier 4', entry: 'tests/tier4_real_world_scenarios.ts', fnName: 'runTier4Tests' },
    { name: 'Stage 1 — Tier 5 (Adversarial)', entry: 'tests/tier5_adversarial_hardening.ts', fnName: 'runTier5Tests' },
    { name: 'Stage 1 — Browser E2E CDP', entry: 'tests/tier_e2e_cdp.ts', fnName: 'runCdpE2ETests' },
    { name: 'Stage 1 — Tier 5 Stress', entry: 'tests/tier5_adversarial_stress.ts', fnName: 'runTier5StressTests' },

    // Stage 2 Test Suites (F31–F45)
    { name: 'Stage 2 — Tier 1 (Feature Coverage F31–F45)', entry: 'tests/stage2_tier1_feature_coverage.ts', fnName: 'runStage2Tier1Tests' },
    { name: 'Stage 2 — Tier 2 (Boundary & Corner Cases)', entry: 'tests/stage2_tier2_boundary_corner.ts', fnName: 'runStage2Tier2Tests' },
    { name: 'Stage 2 — Tier 3 (Cross-Feature Interactions)', entry: 'tests/stage2_tier3_cross_feature.ts', fnName: 'runStage2Tier3Tests' },
    { name: 'Stage 2 — Tier 4 (Real-World Musician Scenarios)', entry: 'tests/stage2_tier4_musician_scenarios.ts', fnName: 'runStage2Tier4Tests' },
    { name: 'Stage 2 — Browser E2E CDP', entry: 'tests/stage2_tier_e2e_cdp.ts', fnName: 'runStage2CdpE2ETests' },

    // Stage 3 Test Suites (F46–F72: Hands-Free Auto-Scroll & Touch Gestures)
    { name: 'Stage 3 — Tier 1 (Feature Coverage F46–F72)', entry: 'tests/stage3_tier1_feature_coverage.ts', fnName: 'runStage3Tier1Tests' },
    { name: 'Stage 3 — Tier 2 (Boundary & Corner Cases)', entry: 'tests/stage3_tier2_boundary_corner.ts', fnName: 'runStage3Tier2Tests' },
    { name: 'Stage 3 — Tier 3 (Cross-Feature Interactions)', entry: 'tests/stage3_tier3_cross_feature.ts', fnName: 'runStage3Tier3Tests' },
    { name: 'Stage 3 — Tier 4 (Real-World Musician Scenarios)', entry: 'tests/stage3_tier4_musician_scenarios.ts', fnName: 'runStage3Tier4Tests' },
    { name: 'Stage 3 — Browser E2E CDP', entry: 'tests/stage3_tier_e2e_cdp.ts', fnName: 'runStage3CdpE2ETests' },
    { name: 'Stage 3 — Tier 5 (Adversarial Hardening)', entry: 'tests/stage3_tier5_adversarial_hardening.ts', fnName: 'runStage3Tier5AdversarialTests' },

    // Stage 4 Test Suites (Zero-Dependency Hash Routing & Typed Persistence)
    { name: 'Stage 4 — Tier 1 (useHashRoute Unit)', entry: 'tests/useHashRoute.test.ts', fnName: 'runUseHashRouteTests' },
    { name: 'Stage 4 — Tier 2 (useLocalStorage Unit)', entry: 'tests/useLocalStorage.test.ts', fnName: 'runUseLocalStorageTests' },
    { name: 'Stage 4 — Tier 3 (App Routing & Fallback Integration)', entry: 'tests/stage4_integration_routing.test.ts', fnName: 'runStage4IntegrationTests' },

    // Stage 5 Test Suites (Dual Catalog, Diacritic Search & Favorites: F73–F96)
    { name: 'Stage 5 — Dual Catalog, Diacritic Search & Favorites (Tiers 1–4)', entry: 'tests/stage5_song_list_search.test.ts', fnName: 'runStage5Tests' },
    { name: 'Stage 5 — Tier 5 (Adversarial Hardening)', entry: 'tests/stage5_tier5_adversarial_hardening.ts', fnName: 'runStage5Tier5AdversarialTests' },

    // Stage 6 Test Suites (PWA Precaching, Offline Status, Toast & Theme Polish: F97–F108)
    { name: 'Stage 6 — PWA Offline, Toast & Theme Polish (Tiers 1–3)', entry: 'tests/stage6_pwa_offline_theme.test.ts', fnName: 'runStage6Tests' },
    { name: 'Stage 6 — Browser E2E CDP', entry: 'tests/stage6_tier_e2e_cdp.ts', fnName: 'runStage6CdpE2ETests' },

    // Stage 7 Test Suites (Custom Song Upload, Performance & Maintenance)
    { name: 'Stage 7 — Upload, Performance & Maintenance', entry: 'tests/stage7_upload_maintenance.test.ts', fnName: 'runStage7Tests' },

    // Stage 8 Test Suites (Wywrota.pl Importer & CLI Tool)
    { name: 'Stage 8 — Wywrota.pl Importer & CLI Tool', entry: 'tests/import_wywrota.test.ts', fnName: 'runImportWywrotaTests' },

    // Song Title Overflow & Song View Favorite Star
    { name: 'Song Title Overflow & Song View Favorite Star', entry: 'tests/song_overflow_and_favorite_viewer.test.ts', fnName: 'runSongOverflowAndFavoriteViewerTests' },
  ];

  const inlineJsonPlugin = {
    name: 'inline-json',
    setup(build: any) {
      build.onResolve({ filter: /\.json$/ }, (args: any) => {
        let resolved = args.path;
        if (!path.isAbsolute(resolved)) {
          if (resolved.startsWith('.')) {
            resolved = path.resolve(args.resolveDir, resolved);
          } else {
            resolved = path.resolve(process.cwd(), 'node_modules', resolved);
          }
        }
        return { path: resolved, external: false };
      });
    },
  };

  for (const t of tiers) {
    const outFile = path.join(cacheDir, `${path.basename(t.entry, '.ts')}.mjs`);
    try {
      await esbuild.build({
        entryPoints: [t.entry],
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        plugins: [inlineJsonPlugin],
        outfile: outFile,
        sourcemap: 'inline',
        loader: {
          '.json': 'json',
        },
      });

      // Convert path to file:// URL for cross-platform ESM dynamic import
      const fileUrl = new URL(`file:///${outFile.replace(/\\/g, '/')}`).href;
      const mod = await import(fileUrl);
      const testFn = mod[t.fnName];
      if (typeof testFn === 'function') {
        await testFn(runner);
      } else {
        throw new Error(`Exported function "${t.fnName}" not found in ${t.entry}`);
      }
    } catch (err: any) {
      console.error(`\x1b[31mError executing ${t.name} (${t.entry}):\x1b[0m`, err);
      runner.setTier(t.name);
      await runner.test(`Suite Runner: ${t.name}`, () => {
        throw err;
      });
    }
  }

  // Print full systematic summary
  const success = runner.printSummary();

  // Clean up cache folder
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  } catch (e) {}

  if (!success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n\x1b[31mFATAL TEST RUNNER ERROR:\x1b[0m', err);
  process.exit(1);
});
