'use client';

import { useEffect, useRef } from 'react';
import { usePendingWritesStore } from '../store/pendingWrites';
import { checkJoinPoolPredicate } from '../services/contract';
import { usePoolsStore } from '../store/pools';

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
