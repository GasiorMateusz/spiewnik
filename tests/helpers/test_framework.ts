import assert from 'node:assert';

export interface TestCaseResult {
  tier: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export class TestRunner {
  private results: TestCaseResult[] = [];
  private currentTier: string = 'General';

  setTier(tier: string) {
    this.currentTier = tier;
    console.log(`\n================================================================`);
    console.log(`  ${tier}`);
    console.log(`================================================================`);
  }

  async test(name: string, fn: () => void | Promise<void>) {
    const start = performance.now();
    try {
      await fn();
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      this.results.push({
        tier: this.currentTier,
        name,
        passed: true,
        durationMs,
      });
      console.log(`  \x1b[32m✓\x1b[0m [${this.currentTier}] ${name} \x1b[90m(${durationMs}ms)\x1b[0m`);
    } catch (err: any) {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const errorMsg = err?.message || String(err);
      this.results.push({
        tier: this.currentTier,
        name,
        passed: false,
        durationMs,
        error: errorMsg,
      });
      console.error(`  \x1b[31m✗\x1b[0m [${this.currentTier}] ${name}: \x1b[31m${errorMsg}\x1b[0m`);
      if (err?.stack) {
        console.error(`    \x1b[90m${err.stack.split('\n').slice(1, 4).join('\n    ')}\x1b[0m`);
      }
    }
  }

  getResults(): TestCaseResult[] {
    return this.results;
  }

  getTierSummary(tierName: string) {
    const tierResults = this.results.filter((r) => r.tier === tierName);
    const passed = tierResults.filter((r) => r.passed).length;
    const failed = tierResults.filter((r) => !r.passed).length;
    return { total: tierResults.length, passed, failed };
  }

  printSummary(): boolean {
    console.log(`\n================================================================`);
    console.log(`                TEST SUITE EXECUTION SUMMARY                    `);
    console.log(`================================================================`);

    const tiers = Array.from(new Set(this.results.map((r) => r.tier)));
    let grandTotal = 0;
    let grandPassed = 0;
    let grandFailed = 0;

    console.log(`| Tier / Test Suite                          | Total | Pass | Fail | Status  |`);
    console.log(`|--------------------------------------------|-------|------|------|---------|`);

    for (const tier of tiers) {
      const { total, passed, failed } = this.getTierSummary(tier);
      grandTotal += total;
      grandPassed += passed;
      grandFailed += failed;
      const status = failed === 0 ? '\x1b[32mPASSED\x1b[0m ' : '\x1b[31mFAILED\x1b[0m ';
      const paddedTier = tier.padEnd(42, ' ');
      const paddedTotal = String(total).padStart(5, ' ');
      const paddedPass = String(passed).padStart(4, ' ');
      const paddedFail = String(failed).padStart(4, ' ');
      console.log(`| ${paddedTier} | ${paddedTotal} | ${paddedPass} | ${paddedFail} | ${status} |`);
    }

    console.log(`|--------------------------------------------|-------|------|------|---------|`);
    const totalStatus = grandFailed === 0 ? '\x1b[32mPASSED\x1b[0m ' : '\x1b[31mFAILED\x1b[0m ';
    console.log(
      `| \x1b[1mTOTAL ALL TIERS\x1b[0m                            | ${String(grandTotal).padStart(5, ' ')} | ${String(grandPassed).padStart(4, ' ')} | ${String(grandFailed).padStart(4, ' ')} | ${totalStatus} |`
    );
    console.log(`================================================================\n`);

    if (grandFailed > 0) {
      console.error(`\x1b[31m❌ TEST SUITE FAILED: ${grandFailed} test(s) failed out of ${grandTotal}.\x1b[0m\n`);
      return false;
    } else {
      console.log(`\x1b[32m🎉 100% PASS RATE: All ${grandTotal} tests passed across all tiers!\x1b[0m\n`);
      return true;
    }
  }
}

export { assert };
