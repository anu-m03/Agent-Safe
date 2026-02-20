/**
 * x402 / CDP payment config from env. Base mainnet.
 */

export type PaidActionType = 'PROPOSAL_SUMMARISE' | 'RISK_CLASSIFICATION' | 'TX_SIMULATION' | 'REQUEST_PROTECTION';

const ZERO = '0';

function getEnv(name: string, defaultValue: string): string {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : defaultValue;
}

/** Operator wallet on Base that receives USDC (revenue). */
export function getOperatorWallet(): string {
  return getEnv('X402_OPERATOR_WALLET_BASE', ZERO);
}

/** USDC contract on Base mainnet. */
export function getUsdcAddress(): string {
  return getEnv('X402_USDC_BASE_ADDRESS', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
}

/** Required USDC amount (6 decimals) per action. */
export function getRequiredAmountWei(actionType: PaidActionType): string {
  const key = `X402_AMOUNT_${actionType}` as const;
  const raw = process.env[key];
  if (raw !== undefined && raw !== '' && /^\d+$/.test(raw)) return raw;
  switch (actionType) {
    case 'PROPOSAL_SUMMARISE':
      return getEnv('X402_AMOUNT_PROPOSAL_SUMMARISE', '10000'); // 0.01 USDC
    case 'RISK_CLASSIFICATION':
      return getEnv('X402_AMOUNT_RISK_CLASSIFICATION', '20000'); // 0.02 USDC
    case 'TX_SIMULATION':
      return getEnv('X402_AMOUNT_TX_SIMULATION', '5000'); // 0.005 USDC
    case 'REQUEST_PROTECTION':
      return getEnv('X402_AMOUNT_REQUEST_PROTECTION', '25000'); // 0.025 USDC
    default:
      return '0';
  }
}

/** Whether CDP/real payment flow is enabled (operator wallet set). */
export function isX402RealEnabled(): boolean {
  const wallet = getOperatorWallet();
  return wallet !== ZERO && wallet.length === 42 && wallet.startsWith('0x');
}

/** Base RPC URL for verification. */
export function getBaseRpcUrl(): string {
  return getEnv('BASE_RPC_URL', 'https://mainnet.base.org');
}
