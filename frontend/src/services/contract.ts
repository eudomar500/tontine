import { createClient } from 'genlayer-js';
import { CalldataAddress } from 'genlayer-js/types';
import { testnetBradbury } from 'genlayer-js/chains';
import { rpcQueue, withRateLimitRetry } from './rpc';
export const CONTRACT_ADDRESS = '0x57E9930079FCeF23A76468508643F4aF193776C8';
export const CATEGORIES = ['Crypto', 'Sports', 'Politics', 'Weather', 'Tech'] as const;
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
  name: string;
  is_open_duel: boolean;
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
  name: string;
  is_open_duel: boolean;
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

export interface Stake {
  wallet: string;
  outcome_index: number;
  amount: string;
  claimed: boolean;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length !== 40) {
    throw new Error(`Invalid address hex length: ${hex}`);
  }
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Fetches the stake details for a specific wallet inside a pool.
 */
export async function getStake(poolId: number, wallet: string): Promise<Stake> {
  const calldataAddr = new CalldataAddress(hexToBytes(wallet));
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_stake',
        args: [poolId, calldataAddr],
      });
      return res as unknown as Stake;
    })
  );
}

/**
 * Fetches the current pool creation fee in wei units.
 */
export async function getCreationFee(): Promise<bigint> {
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_creation_fee',
      });
      return BigInt(res as string | number | bigint);
    })
  );
}

/**
 * Fetches the list of pool IDs where a wallet address has staked.
 * Since the user might be checking their own participations, this serves as
 * the database reference for client-side matching.
 */
export async function getWalletPools(wallet: string): Promise<number[]> {
  const calldataAddr = new CalldataAddress(hexToBytes(wallet));
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_wallet_pools',
        args: [calldataAddr],
      });
      return (res as unknown as Array<number | bigint | string>).map(Number);
    })
  );
}

export interface AdminState {
  admin: string;
  pending_admin: string;
  admin_transfer_deadline: number;
  fee_collector: string;
  pending_fee_collector: string;
  pending_fee_collector_deadline: number;
  creation_fee: string;
  pending_creation_fee: string;
  pending_creation_fee_deadline: number;
  paused: boolean;
  killswitch_active: boolean;
  killswitch_activated_at: number;
  last_admin_heartbeat: number;
}

export interface KillswitchStatus {
  active: boolean;
  activated_at: number;
  window_ends_at: number;
  can_deactivate: boolean;
  dead_man_triggers_at: number;
}

/**
 * Fetches the current admin state from the contract.
 */
export async function getAdminState(): Promise<AdminState> {
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_admin_state',
      });
      return res as unknown as AdminState;
    })
  );
}

/**
 * Fetches the current killswitch status from the contract.
 */
export async function getKillswitchStatus(): Promise<KillswitchStatus> {
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_killswitch_status',
      });
      return res as unknown as KillswitchStatus;
    })
  );
}

/**
 * Fetches the total accumulated fees in the contract.
 */
export async function getAccumulatedFees(): Promise<bigint> {
  return rpcQueue.enqueue(() =>
    withRateLimitRetry(async () => {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_accumulated_fees',
      });
      return BigInt(res as string | number | bigint);
    })
  );
}

export async function checkJoinPoolPredicate(poolId: number, address: string): Promise<boolean> {
  try {
    const stake = await getStake(poolId, address);
    return stake !== null && BigInt(stake.amount) > 0n;
  } catch (err: any) {
    const errMsg = err?.message?.toLowerCase() || '';
    const errDetails = err?.details?.toLowerCase() || '';
    const errData = (err?.data || err?.cause?.data || '').toLowerCase();
    const errStr = JSON.stringify(err || '').toLowerCase();

    // Replicate exactly the no-stake error checks to avoid false negatives on RPC variations
    const isNoStake =
      errMsg.includes('no stake') ||
      errDetails.includes('no stake') ||
      errMsg.includes('0x6e, 0x6f, 0x20, 0x73, 0x74, 0x61, 0x6b, 0x65') ||
      errDetails.includes('0x6e, 0x6f, 0x20, 0x73, 0x74, 0x61, 0x6b, 0x65') ||
      errData.includes('6e6f207374616b65') ||
      errStr.includes('no stake') ||
      errStr.includes('6e6f207374616b65') ||
      errStr.includes('0x6e, 0x6f, 0x20, 0x73, 0x74, 0x61, 0x6b, 0x65');

    if (isNoStake) {
      return false;
    }
    throw err;
  }
}





