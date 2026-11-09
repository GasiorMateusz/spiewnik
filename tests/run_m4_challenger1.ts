import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { TestRunner } from './helpers/test_framework.ts';

async function main() {
  console.log('\n================================================================');
  console.log('  CHALLENGER M4-1: EMPIRICAL RAF MATH & BOUNDARY STRESS SUITE   ');
  console.log('  Sub-Pixel Accumulator, Time Clamping, Bottom Stop & Reset     ');
  console.log('================================================================\n');

  const runner = new TestRunner();
  const cacheDir = path.join(process.cwd(), 'tests', '.cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const entry = 'tests/m4_challenger1_empirical.ts';
  const outFile = path.join(cacheDir, `${path.basename(entry, '.ts')}.mjs`);

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
    await mod.runM4Challenger1Tests(runner);
  } catch (err: any) {
    console.error(`\x1b[31mError executing ${entry}:\x1b[0m`, err);
    runner.setTier('M4-CHALLENGER-1: Test Suite Execution');
    await runner.test('Challenger 1 Execution', () => {
      throw err;
    });
  }

  const passed = runner.printSummary();
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
