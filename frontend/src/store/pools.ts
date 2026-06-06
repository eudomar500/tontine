import { create } from 'zustand';
import { PoolSummary, getPoolCount, getPoolSummary } from '../services/contract';

interface PoolsState {
  pools: PoolSummary[];
  isLoading: boolean;
  error: string | null;
  loadPools: () => Promise<void>;
}

export const usePoolsStore = create<PoolsState>((set) => ({
  pools: [],
  isLoading: false,
  error: null,

  loadPools: async () => {
    set({ isLoading: true, error: null });
    try {
      const count = await getPoolCount();
      const loadedPools: PoolSummary[] = [];

      for (let id = 1; id <= count; id++) {
        try {
          const summary = await getPoolSummary(id);
          loadedPools.push(summary);
        } catch (err) {
          // Failure isolation: log error but do not disrupt other pool loads
          console.warn(`Failed to fetch pool ${id}:`, err);
        }
      }

      set({ pools: loadedPools, isLoading: false });
    } catch (err: any) {
      console.error('Error loading prediction pools:', err);
      set({
        isLoading: false,
        error: err?.message || 'Failed to load pools from contract',
      });
    }
  },
}));
