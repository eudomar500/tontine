import { create } from 'zustand';
import {
  AdminState,
  KillswitchStatus,
  getAdminState,
  getKillswitchStatus,
  getAccumulatedFees,
  getCreationFee,
} from '../services/contract';

interface AdminStoreState {
  adminState: AdminState | null;
  killswitchStatus: KillswitchStatus | null;
  accumulatedFees: bigint;
  creationFee: bigint;
  isLoading: boolean;
  error: string | null;
  loadAdminData: () => Promise<void>;
}

export const useAdminStore = create<AdminStoreState>((set) => ({
  adminState: null,
  killswitchStatus: null,
  accumulatedFees: 0n,
  creationFee: 0n,
  isLoading: false,
  error: null,

  // Loads all required contract administrative status configurations concurrently.
  // The underlying client read queue handles serialization internally to prevent RPC throttling.
  loadAdminData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [adminState, killswitchStatus, accumulatedFees, creationFee] = await Promise.all([
        getAdminState(),
        getKillswitchStatus(),
        getAccumulatedFees(),
        getCreationFee(),
      ]);
      set({
        adminState,
        killswitchStatus,
        accumulatedFees,
        creationFee,
        isLoading: false,
      });
    } catch (err: any) {
      console.error('Error loading admin configurations:', err);
      set({
        isLoading: false,
        error: err?.message || 'Failed to retrieve admin details from contract.',
      });
    }
  },
}));

