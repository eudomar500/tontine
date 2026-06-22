'use client';

import { useEffect, useRef } from 'react';
import { usePendingWritesStore } from '../store/pendingWrites';
import { checkJoinPoolPredicate, getPoolCount, getStake, getPoolSummary, getAdminState, getKillswitchStatus, getAccumulatedFees } from '../services/contract';
import { usePoolsStore } from '../store/pools';
import { useAdminStore } from '../store/admin';

const POLL_INTERVAL = 30000; // 30 seconds
const TTL_LIMIT = 50 * 60 * 1000; // 50 minutes

export default function PendingWritesReconciler() {
  const isLoaded = usePendingWritesStore((state) => state.isLoaded);
  const loadFromStorage = usePendingWritesStore((state) => state.loadFromStorage);
  const entries = usePendingWritesStore((state) => state.entries);
  const removePendingWrite = usePendingWritesStore((state) => state.removePendingWrite);
  const updateStatus = usePendingWritesStore((state) => state.updateStatus);
  const loadPools = usePoolsStore((state) => state.loadPools);

  // Synchronize localStorage on client side mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Keep track of active requests to prevent overlapping calls on slow networks
  const activeChecksRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!isLoaded) return;

    const interval = setInterval(async () => {
      const now = Date.now();
      const pendingEntries = entries.filter((e) => e.status === 'pending');

      for (const entry of pendingEntries) {
        if (activeChecksRef.current[entry.key]) continue;

        // Check if transaction has timed out past typical Bradbury finality latency
        if (now - entry.timestamp > TTL_LIMIT) {
          updateStatus(entry.key, 'stale');
          continue;
        }

        activeChecksRef.current[entry.key] = true;
        try {
          if (entry.action === 'join_pool') {
            const confirmed = await checkJoinPoolPredicate(Number(entry.target), entry.wallet);
            if (confirmed) {
              removePendingWrite(entry.key);
              // Refresh global pools list to update the client dashboard view
              loadPools().catch(() => {});
            }
          } else if (entry.action === 'create_pool') {
            const currentCount = await getPoolCount();
            const preCount = Number(entry.metadata?.preCreateCount || 0);
            if (currentCount > preCount) {
              removePendingWrite(entry.key);
              // Refresh global pools list to update the client dashboard view
              loadPools().catch(() => {});
            }
          } else if (entry.action === 'increase_stake') {
            try {
              const stake = await getStake(Number(entry.target), entry.wallet);
              const preStakeAmount = BigInt(entry.metadata?.preStakeAmount || '0');
              if (stake && BigInt(stake.amount) > preStakeAmount) {
                removePendingWrite(entry.key);
                loadPools().catch(() => {});
              }
            } catch (err: any) {
              const errMsg = err?.message?.toLowerCase() || '';
              const errDetails = err?.details?.toLowerCase() || '';
              const errData = (err?.data || err?.cause?.data || '').toLowerCase();
              const errStr = JSON.stringify(err || '').toLowerCase();
              
              // Catch and ignore no stake errors which occur if the transaction has not landed yet
              const isNoStake =
                errMsg.includes('no stake') ||
                errDetails.includes('no stake') ||
                errData.includes('6e6f207374616b65') ||
                errStr.includes('no stake') ||
                errStr.includes('6e6f207374616b65');
                
              if (!isNoStake) {
                throw err;
              }
            }
          } else if (entry.action === 'cancel_pool') {
            const p = await getPoolSummary(Number(entry.target));
            if (p && p.state !== 0) {
              removePendingWrite(entry.key);
              loadPools().catch(() => {});
            }
          } else if (entry.action === 'block_and_refund_pool') {
            // Once the pool state changes from OPEN on-chain, the administrative block is complete.
            const p = await getPoolSummary(Number(entry.target));
            if (p && p.state !== 0) {
              removePendingWrite(entry.key);
              loadPools().catch(() => {});
            }
          } else if (entry.action === 'emergency_withdraw') {
            try {
              // The withdrawal is complete when the stake is marked claimed.
              const stake = await getStake(Number(entry.target), entry.wallet);
              if (stake && stake.claimed) {
                removePendingWrite(entry.key);
                loadPools().catch(() => {});
              }
            } catch (err: any) {
              const errMsg = err?.message?.toLowerCase() || '';
              const errDetails = err?.details?.toLowerCase() || '';
              const errData = (err?.data || err?.cause?.data || '').toLowerCase();
              const errStr = JSON.stringify(err || '').toLowerCase();
              
              const isNoStake =
                errMsg.includes('no stake') ||
                errDetails.includes('no stake') ||
                errData.includes('6e6f207374616b65') ||
                errStr.includes('no stake') ||
                errStr.includes('6e6f207374616b65');
                
              if (isNoStake) {
                // If there's no stake record left, the withdrawal successfully cleared the stake.
                removePendingWrite(entry.key);
                loadPools().catch(() => {});
              } else {
                throw err;
              }
            }
          } else if (entry.action === 'set_pause') {
            const adminState = await getAdminState();
            if (adminState && adminState.paused === entry.metadata?.paused) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'activate_killswitch') {
            const status = await getKillswitchStatus();
            if (status && status.active === true) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'deactivate_killswitch') {
            const status = await getKillswitchStatus();
            if (status && status.active === false) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'propose_creation_fee_change') {
            const adminState = await getAdminState();
            if (
              adminState &&
              adminState.pending_creation_fee === entry.metadata?.proposedFee &&
              Number(adminState.pending_creation_fee_deadline) > 0
            ) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'apply_creation_fee_change') {
            const adminState = await getAdminState();
            if (
              adminState &&
              adminState.creation_fee === entry.metadata?.proposedFee &&
              adminState.pending_creation_fee === '0'
            ) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'propose_fee_collector_change') {
            const adminState = await getAdminState();
            if (
              adminState &&
              adminState.pending_fee_collector.toLowerCase() === entry.metadata?.proposedCollector?.toLowerCase() &&
              Number(adminState.pending_fee_collector_deadline) > 0
            ) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'apply_fee_collector_change') {
            const adminState = await getAdminState();
            if (
              adminState &&
              adminState.fee_collector.toLowerCase() === entry.metadata?.proposedCollector?.toLowerCase() &&
              adminState.pending_fee_collector === '0x0000000000000000000000000000000000000000'
            ) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'propose_admin_transfer') {
            const adminState = await getAdminState();
            if (
              adminState &&
              adminState.pending_admin.toLowerCase() === entry.metadata?.proposedAdmin?.toLowerCase()
            ) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'accept_admin_transfer') {
            const adminState = await getAdminState();
            if (
              adminState &&
              adminState.admin.toLowerCase() === entry.metadata?.proposedAdmin?.toLowerCase()
            ) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'withdraw_fees') {
            const currentFees = await getAccumulatedFees();
            const preFees = BigInt(entry.metadata?.preFeesAmount || '0');
            // Clears if fees decreased or dropped to 0, validating that payout completed
            if (currentFees < preFees || currentFees === 0n) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          } else if (entry.action === 'heartbeat') {
            const adminState = await getAdminState();
            const preHeartbeat = Number(entry.metadata?.preHeartbeat || 0);
            // Clears when heartbeat timestamp has incremented beyond pre-tx state
            if (adminState && Number(adminState.last_admin_heartbeat) > preHeartbeat) {
              removePendingWrite(entry.key);
              useAdminStore.getState().loadAdminData().catch(() => {});
            }
          }
        } catch (error) {
          console.warn(`Pending write check failed for ${entry.key}:`, error);
        } finally {
          delete activeChecksRef.current[entry.key];
        }
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [isLoaded, entries, removePendingWrite, updateStatus, loadPools]);

  return null;
}
