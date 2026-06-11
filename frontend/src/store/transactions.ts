import { create } from 'zustand';
import { getTransactionReceipt } from '../services/rpc';

export type TxStatus = 'submitted' | 'accepted' | 'finalized';

export interface TrackedTx {
  hash: string;
  status: TxStatus;
  timestamp: number;
  isDemo?: boolean;
  blockHash?: string;
  blockNumber?: string;
  elapsedSeconds: number;
  poolId?: number;
  action?: string;
}

interface TxState {
  transactions: TrackedTx[];
  addTransaction: (hash: string, isDemo?: boolean, poolId?: number, action?: string) => void;
  removeTransaction: (hash: string) => void;
  tickElapsed: () => void;
  updateStatuses: () => Promise<void>;
}

// Local status names resolver map (handles SDK/RPC discrepancies)
const STATUS_NAMES: Record<string, TxStatus> = {
  pending: 'submitted',
  proposing: 'submitted',
  committing: 'submitted',
  revealing: 'submitted',
  accepted: 'accepted',
  finalized: 'finalized',
  '0': 'submitted',
  '1': 'submitted',
  '2': 'submitted',
  '3': 'submitted',
  '4': 'accepted',
  '5': 'finalized',
};

function resolveStatusName(rawStatus: string | number | undefined | null): TxStatus {
  if (rawStatus === undefined || rawStatus === null) return 'submitted';
  const normalized = String(rawStatus).toLowerCase().trim();
  return STATUS_NAMES[normalized] || 'submitted';
}

export const useTxStore = create<TxState>((set, get) => ({
  transactions: [],

  addTransaction: (hash, isDemo = false, poolId, action) => {
    const cleanHash = hash.trim();
    if (!cleanHash) return;

    set((state) => {
      if (state.transactions.some((tx) => tx.hash === cleanHash)) {
        return state;
      }
      const newTx: TrackedTx = {
        hash: cleanHash,
        status: 'submitted',
        timestamp: Date.now(),
        isDemo,
        elapsedSeconds: 0,
        poolId,
        action,
      };
      return { transactions: [newTx, ...state.transactions] };
    });

    if (isDemo) {
      // Simulate progress for demo tx
      // Submitted -> Accepted in 15 seconds
      // Accepted -> Finalized in 45 seconds
      setTimeout(() => {
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.hash === cleanHash ? { ...t, status: 'accepted' } : t
          ),
        }));
      }, 15000);

      setTimeout(() => {
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.hash === cleanHash ? { ...t, status: 'finalized' } : t
          ),
        }));
      }, 60000);
    } else {
      // Fetch initial status immediately
      get().updateStatuses().catch(() => {});
    }
  },

  removeTransaction: (hash) => {
    set((state) => ({
      transactions: state.transactions.filter((tx) => tx.hash !== hash),
    }));
  },

  tickElapsed: () => {
    set((state) => ({
      transactions: state.transactions.map((tx) => {
        if (tx.status !== 'finalized') {
          return {
            ...tx,
            elapsedSeconds: Math.floor((Date.now() - tx.timestamp) / 1000),
          };
        }
        return tx;
      }),
    }));
  },

  updateStatuses: async () => {
    const activeTxs = get().transactions.filter((tx) => !tx.isDemo && tx.status !== 'finalized');
    if (activeTxs.length === 0) return;

    for (const tx of activeTxs) {
      try {
        const receipt = await getTransactionReceipt(tx.hash);
        if (receipt) {
          const resolvedStatus = resolveStatusName(receipt.status);
          set((state) => ({
            transactions: state.transactions.map((t) =>
              t.hash === tx.hash
                ? {
                    ...t,
                    status: resolvedStatus,
                    blockHash: receipt.blockHash,
                    blockNumber: receipt.blockNumber,
                  }
                : t
            ),
          }));
        }
      } catch (error) {
        console.error(`Error polling status for ${tx.hash}:`, error);
      }
    }
  },
}));
