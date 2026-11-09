import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { TestRunner } from './helpers/test_framework.ts';

async function main() {
  console.log('\n================================================================');
  console.log('  CHALLENGER M4.2: EMPIRICAL STATE MACHINE & GESTURES AUDIT     ');
  console.log('  3-State FSM Transitions, Debounce, Isolation & CDP Tests       ');
  console.log('================================================================\n');

  const runner = new TestRunner();
  const cacheDir = path.join(process.cwd(), 'tests', '.cache_m4_challenger2');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const entry = 'tests/m4_challenger2_empirical.ts';
  const outFile = path.join(cacheDir, 'm4_challenger2_empirical.mjs');

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

  try {
    await esbuild.build({
      entryPoints: [entry],
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

    const fileUrl = new URL(`file:///${outFile.replace(/\\/g, '/')}`).href;
    const mod = await import(fileUrl);
    await mod.runM4Challenger2EmpiricalTests(runner);
  } catch (err: any) {
    console.error(`\x1b[31mError executing ${entry}:\x1b[0m`, err);
    runner.setTier('Empirical Challenger M4 Execution');
    await runner.test('Empirical Test Runner Failure', () => {
      throw err;
    });
  }

  const success = runner.printSummary();

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
