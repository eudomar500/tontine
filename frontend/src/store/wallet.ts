import { create } from 'zustand';

export interface EIP6963ProviderInfo {
  rdns: string;
  uuid: string;
  name: string;
  icon: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

interface WalletState {
  providers: EIP6963ProviderDetail[];
  connectedProvider: EIP6963ProviderDetail | null;
  connectedAddress: string | null;
  isConnecting: boolean;
  error: string | null;
  isModalOpen: boolean;

  // Actions
  addProvider: (providerDetail: EIP6963ProviderDetail) => void;
  connectWallet: (providerDetail: EIP6963ProviderDetail) => Promise<void>;
  disconnectWallet: () => void;
  setModalOpen: (open: boolean) => void;
  initializeDiscovery: () => () => void;
  autoConnect: () => Promise<void>;
}

const STORAGE_KEY = 'tontine_last_connected_rdns';

export const useWalletStore = create<WalletState>((set, get) => ({
  providers: [],
  connectedProvider: null,
  connectedAddress: null,
  isConnecting: false,
  error: null,
  isModalOpen: false,

  addProvider: (providerDetail) => {
    set((state) => {
      if (state.providers.some((p) => p.info.uuid === providerDetail.info.uuid)) {
        return state;
      }
      const updated = [...state.providers, providerDetail];
      return { providers: updated };
    });

    // Check if we should auto-connect to this newly discovered provider
    const lastRdns = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (lastRdns && providerDetail.info.rdns === lastRdns && !get().connectedAddress && !get().isConnecting) {
      get().connectWallet(providerDetail).catch(() => {
        // Silent catch for auto-connect failures
      });
    }
  },

  connectWallet: async (detail) => {
    set({ isConnecting: true, error: null });
    try {
      const accounts = await detail.provider.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        set({
          connectedProvider: detail,
          connectedAddress: address,
          isConnecting: false,
          isModalOpen: false,
        });

        localStorage.setItem(STORAGE_KEY, detail.info.rdns);

        // Listeners
        const handleAccountsChanged = (accs: string[]) => {
          if (accs.length === 0) {
            get().disconnectWallet();
          } else {
            set({ connectedAddress: accs[0] });
          }
        };

        const handleChainChanged = () => {
          window.location.reload();
        };

        detail.provider.on('accountsChanged', handleAccountsChanged);
        detail.provider.on('chainChanged', handleChainChanged);
      } else {
        throw new Error('No accounts found');
      }
    } catch (err: any) {
      console.error('Wallet connection failed:', err);
      set({
        isConnecting: false,
        error: err.message || 'Failed to connect wallet',
      });
    }
  },

  disconnectWallet: () => {
    const { connectedProvider } = get();
    if (connectedProvider?.provider) {
      // Best-effort cleanup if wallet supports off
      try {
        if (typeof connectedProvider.provider.removeListener === 'function') {
          // We don't keep raw references to handlers, reloading or regular reset works
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    localStorage.removeItem(STORAGE_KEY);
    set({
      connectedProvider: null,
      connectedAddress: null,
      error: null,
    });
  },

  setModalOpen: (open) => set({ isModalOpen: open }),

  initializeDiscovery: () => {
    if (typeof window === 'undefined') return () => {};

    const handleAnnounce = (event: any) => {
      const detail = event.detail as EIP6963ProviderDetail;
      get().addProvider(detail);
    };

    window.addEventListener('eip6963:announceProvider', handleAnnounce as any);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Try immediate auto-connect if providers are already announced/cached in state
    get().autoConnect();

    return () => {
      window.removeEventListener('eip6963:announceProvider', handleAnnounce as any);
    };
  },

  autoConnect: async () => {
    if (typeof window === 'undefined') return;
    const lastRdns = localStorage.getItem(STORAGE_KEY);
    if (!lastRdns) return;

    const matched = get().providers.find((p) => p.info.rdns === lastRdns);
    if (matched && !get().connectedAddress && !get().isConnecting) {
      try {
        const accounts = await matched.provider.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          set({
            connectedProvider: matched,
            connectedAddress: accounts[0],
          });

          matched.provider.on('accountsChanged', (accs: string[]) => {
            if (accs.length === 0) {
              get().disconnectWallet();
            } else {
              set({ connectedAddress: accs[0] });
            }
          });

          matched.provider.on('chainChanged', () => {
            window.location.reload();
          });
        }
      } catch (err) {
        console.warn('Auto-connect check failed:', err);
      }
    }
  },
}));
