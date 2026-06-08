import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { rpcQueue, withRateLimitRetry } from './rpc';
export const CONTRACT_ADDRESS = '0x4cA9bd0d2130773dfA5C9d571d987E4929A23498';
const client = createClient({ chain: testnetBradbury });

export interface PoolSummary {
  creator: string;
  join_deadline: number;
  outcome_count: number;
  outcome_labels: string[];
  outcome_totals: string[];
  participant_count: number;
  pool_id: number;
  resolution_deadline: number;
  state: number;
  terms_short: string;
  total_pool: string;
  winning_outcome_index: number;
  category: string;
}

/**
 * Fetches the total number of pools created on-chain.
 */
export async function getPoolCount(): Promise<number> {
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_pool_count',
      });
      return Number(res);
    })
  );
}

/**
 * Fetches the summary of a specific pool by its index.
 */
export async function getPoolSummary(poolId: number): Promise<PoolSummary> {
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_pool_summary',
        args: [poolId],
      });
      return res as unknown as PoolSummary;
    })
  );
}

/**
 * Converts wei string values to GEN tokens representation with up to 4 decimal places.
 */
export function weiToGen(wei: string): string {
  try {
    const value = BigInt(wei);
    const isNegative = value < 0n;
    const absValue = isNegative ? -value : value;
    
    const divisor = 1000000000000000000n; // 1e18
    const integerPart = absValue / divisor;
    const remainder = absValue % divisor;
    
    if (remainder === 0n) {
      return (isNegative ? '-' : '') + integerPart.toString();
    }
    
    let fractionStr = remainder.toString().padStart(18, '0');
    fractionStr = fractionStr.slice(0, 4);
    fractionStr = fractionStr.replace(/0+$/, '');
    
    if (fractionStr.length === 0) {
      return (isNegative ? '-' : '') + integerPart.toString();
    }
    
    return `${isNegative ? '-' : ''}${integerPart}.${fractionStr}`;
  } catch (error) {
    return '0';
  }
}

/**
 * Maps state code integer to string label.
 */
export function stateLabel(state: number): string {
  switch (state) {
    case 0:
      return 'Open';
    case 1:
      return 'Resolving';
    case 2:
      return 'Settled';
    case 3:
      return 'Refunded';
    case 4:
      return 'Emergency';
    default:
      return 'Unknown';
  }
}

/**
 * Truncates user wallet address for standard UI representation.
 */
export function truncateAddress(addr: string): string {
  if (!addr) return '';
  const cleanAddr = addr.trim();
  if (cleanAddr.length <= 10) return cleanAddr;
  return `${cleanAddr.slice(0, 6)}...${cleanAddr.slice(-4)}`;
}

/**
 * Computes readable remaining duration relative to current epoch.
 */
export function timeRemaining(deadlineUnix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadlineUnix - now;
  if (diff <= 0) {
    return 'closed';
  }
  
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  
  const parts: string[] = [];
  if (d > 0) {
    parts.push(`${d}d`);
  }
  if (h > 0 || d > 0) {
    parts.push(`${h}h`);
  }
  parts.push(`${m}m`);
  
  return parts.join(' ');
}

export interface AssetReference {
  asset_type: number;
  token_address: string;
  token_id: string;
  amount: string;
}

export interface OutcomeDetail {
  label: string;
  total_staked: string;
  participants_count: number;
}

export interface Pool {
  pool_id: number;
  creator: string;
  state: number;
  terms: string;
  resolution_sources: string[];
  outcomes: OutcomeDetail[];
  winning_outcome_index: number;
  whitelist: string[];
  created_at: number;
  join_deadline: number;
  resolution_deadline: number;
  timeout_deadline: number;
  asset: AssetReference;
  total_pool: string;
  resolution_evidence: string;
  refund_reason: number;
  category: string;
}

/**
 * Fetches the full pool detail by its index.
 */
export async function getPool(poolId: number): Promise<Pool> {
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_pool',
        args: [poolId],
      });
      return res as unknown as Pool;
    })
  );
}
