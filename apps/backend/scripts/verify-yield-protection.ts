/**
 * Yield engine protection — test cases 1–3.
 * Run from apps/backend: npx tsx scripts/verify-yield-protection.ts
 */

import { verifyYieldEngineProtection } from '../src/appAgent/yieldEngineProtection.js';

const testCase1 = {
  appName: 'SafeApp',
  requestedBudget: 5,
  userBalance: 20,
  token: 'USDC',
  slippage: 1,
  chainId: 84531,
};

const testCase2 = {
  appName: 'GreedyApp',
  requestedBudget: 15,
  userBalance: 20,
  token: 'USDC',
  slippage: 1,
  chainId: 84531,
};

const testCase3 = {
  appName: 'BurnerApp',
  requestedBudget: 20,
  userBalance: 20,
  token: 'USDC',
  slippage: 1,
  chainId: 84531,
  currentDailyBurn: 35, // so 35 + 20 > 50 → global burn exceeded
};

console.log('Test case 1 (safe):');
const r1 = verifyYieldEngineProtection(testCase1);
console.log(JSON.stringify({ ...r1, blockReasons: r1.blockReasons ?? [] }, null, 2));
console.log(r1.finalDecision.deploy === true ? 'PASS (deploy allowed)\n' : 'FAIL\n');

console.log('Test case 2 (over-budget):');
const r2 = verifyYieldEngineProtection(testCase2);
console.log(JSON.stringify({ ...r2, blockReasons: r2.blockReasons ?? [] }, null, 2));
const pass2 = !r2.finalDecision.deploy && r2.checks.perAppCap.passed === false;
console.log(pass2 ? 'PASS (blocked by per-app cap)\n' : 'FAIL\n');

console.log('Test case 3 (global burn exceeded):');
const r3 = verifyYieldEngineProtection(testCase3);
console.log(JSON.stringify({ ...r3, blockReasons: r3.blockReasons ?? [] }, null, 2));
const pass3 = !r3.finalDecision.deploy && r3.checks.globalBurnLimit.passed === false;
console.log(pass3 ? 'PASS (blocked by global burn limit)\n' : 'FAIL\n');

const ok = r1.finalDecision.deploy && pass2 && pass3;
process.exit(ok ? 0 : 1);
