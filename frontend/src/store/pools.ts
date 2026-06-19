import { create } from 'zustand';
import { PoolSummary, getPoolCount, getPoolSummary, getWalletPools, CATEGORIES } from '../services/contract';

interface PoolsState {
  pools: PoolSummary[];
  selectedCategory: string;
  selectedPoolId: number | null;
  isLoading: boolean;
  error: string | null;
  viewMode: 'all' | 'mine';
  myPoolIds: number[];
  myPoolsLoading: boolean;
  loadPools: () => Promise<void>;
  setSelectedCategory: (category: string) => void;
  setSelectedPoolId: (id: number | null) => void;
  setViewMode: (mode: 'all' | 'mine') => void;
  loadMyPools: (address: string) => Promise<void>;
}

export const usePoolsStore = create<PoolsState>((set) => ({
  pools: [],
  selectedCategory: 'All',
  selectedPoolId: null,
  isLoading: false,
  error: null,
  viewMode: 'all',
  myPoolIds: [],
  myPoolsLoading: false,

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
      console.error('Error loading prediction events:', err);
      set({
        isLoading: false,
        error: err?.message || 'Failed to load events from contract',
      });
    }
  },

  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSelectedPoolId: (id) => set({ selectedPoolId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  loadMyPools: async (address: string) => {
    set({ myPoolsLoading: true });
    try {
      const stakedIds = await getWalletPools(address);
      const normalizedAddress = address.toLowerCase();

      // Addresses returned by different wallets can be in varying case formats.
      // We perform a client-side comparison to associate pools created by the user.
      const createdIds = usePoolsStore.getState().pools
        .filter((pool) => pool.creator.toLowerCase() === normalizedAddress)
        .map((pool) => pool.pool_id);

      // Union the two lists to prevent duplicates if a user is both the creator
      // and a participant in the same pool.
      const unionSet = new Set([...stakedIds, ...createdIds]);
      set({ myPoolIds: Array.from(unionSet) });
    } catch (err) {
      console.error('Failed to load user-specific pools from contract:', err);
    } finally {
      set({ myPoolsLoading: false });
    }
  },
}));

// Module-level caches prevent React rendering loops by preserving reference equality 
// when the underlying store state hasn't changed.
let lastPools: PoolSummary[] = [];
let lastSelectedCategory = '';
let lastViewMode: 'all' | 'mine' = 'all';
let lastMyPoolIds: number[] = [];
let cachedFilteredPools: PoolSummary[] = [];

export const selectFilteredPools = (state: PoolsState) => {
  if (
    state.pools === lastPools &&
    state.selectedCategory === lastSelectedCategory &&
    state.viewMode === lastViewMode &&
    state.myPoolIds === lastMyPoolIds
  ) {
    return cachedFilteredPools;
  }
  lastPools = state.pools;
  lastSelectedCategory = state.selectedCategory;
  lastViewMode = state.viewMode;
  lastMyPoolIds = state.myPoolIds;

  let poolsToFilter = state.pools;
  if (state.viewMode === 'mine') {
    poolsToFilter = state.pools.filter((pool) => state.myPoolIds.includes(pool.pool_id));
  }

  if (state.selectedCategory === 'All') {
    cachedFilteredPools = poolsToFilter;
  } else if (state.selectedCategory === 'Other') {
    cachedFilteredPools = poolsToFilter.filter((pool) => {
      const cat = typeof pool.category === 'string' ? pool.category.trim() : '';
      if (!cat) return true;
      const catLower = cat.toLowerCase();
      // Returns true if the pool category does not match any category in the fixed CATEGORIES array.
      return !CATEGORIES.some((fixed) => fixed.toLowerCase() === catLower);
    });
  } else {
    const targetLower = state.selectedCategory.toLowerCase();
    cachedFilteredPools = poolsToFilter.filter((pool) => {
      return typeof pool.category === 'string' && pool.category.trim().toLowerCase() === targetLower;
    });
  }
  return cachedFilteredPools;
};

let lastCategoriesPools: PoolSummary[] = [];
let cachedCategories: string[] = ['All'];

export const selectCategories = (state: PoolsState) => {
  if (state.pools === lastCategoriesPools) {
    return cachedCategories;
  }
  lastCategoriesPools = state.pools;

  // Filter the static list to only categories containing at least one pool.
  const activeFixedCategories = CATEGORIES.filter((fixedCat) => {
    const targetLower = fixedCat.toLowerCase();
    return state.pools.some((pool) => {
      return typeof pool.category === 'string' && pool.category.trim().toLowerCase() === targetLower;
    });
  });

  // Identify if any pools fall under the 'Other' catch-all bucket.
  const hasOther = state.pools.some((pool) => {
    const cat = typeof pool.category === 'string' ? pool.category.trim() : '';
    if (!cat) return true;
    const catLower = cat.toLowerCase();
    return !CATEGORIES.some((fixed) => fixed.toLowerCase() === catLower);
  });

  cachedCategories = ['All', ...activeFixedCategories, ...(hasOther ? ['Other'] : [])];
  return cachedCategories;
};
