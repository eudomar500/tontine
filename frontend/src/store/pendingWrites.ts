import { create } from 'zustand';

export interface PendingWrite {
  key: string;
  wallet: string;
  action: string;
  target: string;
  txHash: string;
  timestamp: number;
  status: 'pending' | 'stale';
  metadata?: Record<string, any>;
}

interface PendingWritesState {
  entries: PendingWrite[];
  isLoaded: boolean;
  addPendingWrite: (
    wallet: string,
    action: string,
    target: string,
    txHash: string,
    metadata?: Record<string, any>
  ) => void;
  updateStatus: (key: string, status: 'pending' | 'stale') => void;
  removePendingWrite: (key: string) => void;
  loadFromStorage: () => void;
}

const STORAGE_KEY = 'tontine:pending_writes';

const getInitialEntries = (): PendingWrite[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to read pending writes on initialization', e);
    return [];
  }
};

export const usePendingWritesStore = create<PendingWritesState>((set) => ({
  entries: getInitialEntries(),
  isLoaded: typeof window !== 'undefined',

  addPendingWrite: (wallet, action, target, txHash, metadata) => {
    const key = `${wallet.toLowerCase()}:${action}:${target}`;
    const newEntry: PendingWrite = {
      key,
      wallet: wallet.toLowerCase(),
      action,
      target,
      txHash,
      timestamp: Date.now(),
      status: 'pending',
      metadata,
    };
    set((state) => {
      // Ensure we replace any duplicates to keep keys unique per wallet, action, and target
      const filtered = state.entries.filter((e) => e.key !== key);
      const updated = [...filtered, newEntry];
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
      return { entries: updated };
    });
  },

  updateStatus: (key, status) => {
    set((state) => {
      const updated = state.entries.map((e) =>
        e.key === key ? { ...e, status } : e
      );
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
      return { entries: updated };
    });
  },

  removePendingWrite: (key) => {
    set((state) => {
      const updated = state.entries.filter((e) => e.key !== key);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
      return { entries: updated };
    });
  },

  loadFromStorage: () => {
    // Only load if window is defined to avoid SSR/CSR hydration mismatches
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        set({ entries: JSON.parse(stored), isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch (e) {
      console.error('Failed to load pending writes from storage', e);
      set({ isLoaded: true });
    }
  },
}));
