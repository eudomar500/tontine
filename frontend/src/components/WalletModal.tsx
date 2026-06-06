'use client';

import React, { useEffect, useRef } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { useWalletStore, EIP6963ProviderDetail } from '../store/wallet';

interface WalletOption {
  name: string;
  rdns: string;
  url: string;
  iconSvg: React.ReactNode;
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    name: 'Rabby Wallet',
    rdns: 'io.rabby',
    url: 'https://rabby.io',
    iconSvg: (
      <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="#3F6DF6" />
        <path d="M9 16C9 12.134 12.134 9 16 9C19.866 9 23 12.134 23 16C23 19.866 19.866 23 16 23" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="16" cy="16" r="3" fill="white" />
      </svg>
    ),
  },
  {
    name: 'MetaMask',
    rdns: 'io.metamask',
    url: 'https://metamask.io',
    iconSvg: (
      <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M26.9 7.9L16.2 3.1 5.5 7.9c-.6.3-1 .9-1 1.6l1 12.8c0 .8.5 1.5 1.2 1.8l9.5 4.3c.7.3 1.4.3 2.1 0l9.5-4.3c.7-.3 1.2-1 1.2-1.8l1-12.8c0-.7-.4-1.3-1.1-1.6z" fill="#E2761B" />
        <path d="M16 32l9.5-4.3c.7-.3 1.2-1 1.2-1.8l1-12.8c0-.7-.4-1.3-1.1-1.6L16 7v25z" fill="#E17112" />
        <path d="M16 16.5l-6.8-5.3 1.5-3.3 5.3 2.3v6.3z" fill="#E47622" />
        <path d="M16 16.5l6.8-5.3-1.5-3.3-5.3 2.3v6.3z" fill="#D5680E" />
      </svg>
    ),
  },
  {
    name: 'Phantom',
    rdns: 'app.phantom',
    url: 'https://phantom.app',
    iconSvg: (
      <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="#4E44CE" />
        <path d="M16 8C11.581 8 8 11.581 8 16C8 19.103 9.771 21.794 12.373 23.136C12.812 23.36 13.35 23.12 13.486 22.636C13.626 22.14 13.358 21.624 12.88 21.439C10.963 20.697 9.6 18.513 9.6 16C9.6 12.465 12.465 9.6 16 9.6C19.535 9.6 22.4 12.465 22.4 16C22.4 18.513 21.037 20.697 19.12 21.439C18.642 21.624 18.374 22.14 18.514 22.636C18.65 23.12 19.188 23.36 19.627 23.136C22.229 21.794 24 19.103 24 16C24 11.581 20.419 8 16 8Z" fill="white" />
      </svg>
    ),
  },
  {
    name: 'Backpack',
    rdns: 'app.backpack', // We also search co.backpack or matching name
    url: 'https://backpack.app',
    iconSvg: (
      <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="#1C1C1E" />
        <path d="M10 12C10 10.8954 10.8954 10 12 10H20C21.1046 10 22 10.8954 22 12V22C22 23.1046 21.1046 24 20 24H12C10.8954 24 10 23.1046 10 22V12Z" stroke="white" strokeWidth="2" />
        <path d="M14 10V8C14 7.44772 14.4477 7 15 7H17C17.5523 7 18 7.44772 18 8V10" stroke="white" strokeWidth="2" />
      </svg>
    ),
  },
];

export default function WalletModal() {
  const { isModalOpen, setModalOpen, providers, connectWallet, isConnecting, error } = useWalletStore();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false);
      }
    };
    if (isModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, setModalOpen]);

  if (!isModalOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      setModalOpen(false);
    }
  };

  // Maps discovered EIP-6963 providers to our list of target wallets
  const getDiscoveredProvider = (opt: WalletOption): EIP6963ProviderDetail | undefined => {
    return providers.find(
      (p) =>
        p.info.rdns.toLowerCase().trim() === opt.rdns.toLowerCase().trim() ||
        p.info.name.toLowerCase().includes(opt.name.split(' ')[0].toLowerCase())
    );
  };

  const handleWalletSelect = async (opt: WalletOption) => {
    if (isConnecting) return;
    const providerDetail = getDiscoveredProvider(opt);

    if (providerDetail) {
      // Connect to detected wallet
      await connectWallet(providerDetail);
    } else {
      // Redirect to download page if not detected
      window.open(opt.url, '_blank', 'noopener,noreferrer');
    }
  };

  // Find providers that are announced but not in our main list
  const otherProviders = providers.filter((p) => {
    const isTarget = WALLET_OPTIONS.some(
      (opt) =>
        p.info.rdns.toLowerCase().trim() === opt.rdns.toLowerCase().trim() ||
        p.info.name.toLowerCase().includes(opt.name.split(' ')[0].toLowerCase())
    );
    return !isTarget;
  });

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-charcoal-medium border border-charcoal-light rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-charcoal-light">
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-wide">Connect Wallet</h2>
            <p className="text-xs text-foreground/50 mt-1">Select a wallet to access GenLayer Bradbury testnet</p>
          </div>
          <button
            onClick={() => setModalOpen(false)}
            disabled={isConnecting}
            className="p-1.5 hover:bg-charcoal-light rounded-lg text-foreground/60 hover:text-foreground transition-all cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="flex items-start gap-3 p-3 bg-brand-magenta/10 border border-brand-magenta/30 rounded-xl text-xs text-brand-magenta">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* List of Main Wallets */}
          <div className="space-y-2">
            {WALLET_OPTIONS.map((opt) => {
              const discovered = getDiscoveredProvider(opt);
              const isInstalled = !!discovered;

              return (
                <button
                  key={opt.rdns}
                  onClick={() => handleWalletSelect(opt)}
                  disabled={isConnecting}
                  className="w-full flex items-center justify-between p-3.5 bg-charcoal-dark/40 hover:bg-charcoal-light border border-charcoal-light hover:border-foreground/15 rounded-xl transition-all text-left cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    {/* Wallet Icon (uses announced icon if present, otherwise custom brand logo) */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-charcoal-medium border border-charcoal-light group-hover:border-foreground/10 transition-colors shrink-0">
                      {isInstalled ? (
                        <img
                          src={discovered.info.icon}
                          alt={discovered.info.name}
                          className="w-8 h-8 object-contain"
                        />
                      ) : (
                        opt.iconSvg
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground tracking-wide">
                        {isInstalled ? discovered.info.name : opt.name}
                      </div>
                      <div className="text-xs text-foreground/45 mt-0.5">
                        {isInstalled ? 'EIP-6963 Provider Detected' : 'Not installed'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isInstalled ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2 py-0.5 rounded-full">
                        Detected
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40 bg-charcoal-medium border border-charcoal-light px-2 py-0.5 rounded-full group-hover:border-foreground/10 group-hover:text-foreground/60 transition-colors">
                        Get Wallet
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Discovered Other Wallets Section (Production-Grade EIP-6963 compatibility) */}
          {otherProviders.length > 0 && (
            <div className="mt-4 pt-4 border-t border-charcoal-light">
              <h3 className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-2">Other Detected Wallets</h3>
              <div className="space-y-2">
                {otherProviders.map((providerDetail) => (
                  <button
                    key={providerDetail.info.uuid}
                    onClick={() => connectWallet(providerDetail)}
                    disabled={isConnecting}
                    className="w-full flex items-center justify-between p-3 bg-charcoal-dark/20 hover:bg-charcoal-light border border-charcoal-light hover:border-foreground/15 rounded-xl transition-all text-left cursor-pointer group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-charcoal-medium border border-charcoal-light shrink-0">
                        <img
                          src={providerDetail.info.icon}
                          alt={providerDetail.info.name}
                          className="w-6 h-6 object-contain"
                        />
                      </div>
                      <div className="text-sm font-semibold text-foreground tracking-wide">
                        {providerDetail.info.name}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2 py-0.5 rounded-full">
                      Connect
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer/Loading state overlay */}
        {isConnecting && (
          <div className="p-4 bg-charcoal-dark/60 border-t border-charcoal-light flex items-center justify-center gap-2 text-sm text-foreground/75 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
            Connecting to wallet...
          </div>
        )}
      </div>
    </div>
  );
}
