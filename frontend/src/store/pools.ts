import { create } from 'zustand';
import { PoolSummary, getPoolCount, getPoolSummary } from '../services/contract';

interface PoolsState {
  pools: PoolSummary[];
  selectedCategory: string;
  selectedPoolId: number | null;
  isLoading: boolean;
  error: string | null;
  loadPools: () => Promise<void>;
  setSelectedCategory: (category: string) => void;
  setSelectedPoolId: (id: number | null) => void;
}

export const usePoolsStore = create<PoolsState>((set) => ({
  pools: [],
  selectedCategory: 'All',
  selectedPoolId: null,
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

  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSelectedPoolId: (id) => set({ selectedPoolId: id }),
}));

// Module-level caches prevent React rendering loops by preserving reference equality 
// when the underlying store state hasn't changed.
let lastPools: PoolSummary[] = [];
let lastSelectedCategory = '';
let cachedFilteredPools: PoolSummary[] = [];

export const selectFilteredPools = (state: PoolsState) => {
  if (state.pools === lastPools && state.selectedCategory === lastSelectedCategory) {
    return cachedFilteredPools;
  }
  lastPools = state.pools;
  lastSelectedCategory = state.selectedCategory;
  cachedFilteredPools = state.selectedCategory === 'All'
    ? state.pools
    : state.pools.filter((pool) => pool.category === state.selectedCategory);
  return cachedFilteredPools;
};

let lastCategoriesPools: PoolSummary[] = [];
let cachedCategories: string[] = ['All'];

export const selectCategories = (state: PoolsState) => {
  if (state.pools === lastCategoriesPools) {
    return cachedCategories;
  }
  lastCategoriesPools = state.pools;
  const uniqueCategories = Array.from(
    new Set(
      state.pools
        .map((p) => p.category)
        .filter((cat): cat is string => typeof cat === 'string' && cat.trim() !== '')
    )
  );
  cachedCategories = ['All', ...uniqueCategories];
  return cachedCategories;
};
