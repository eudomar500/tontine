'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, HelpCircle, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { usePoolsStore, selectFilteredPools, selectCategories } from '../store/pools';
import PoolCard from './PoolCard';
import PoolDetailDrawer from './PoolDetailDrawer';
import CreatePoolModal from './CreatePoolModal';
import DuelCard from './DuelCard';
import CreateDuelModal from './CreateDuelModal';
import { useWalletStore } from '../store/wallet';
import { usePendingWritesStore } from '../store/pendingWrites';
import { getPoolCount } from '../services/contract';

export default function PoolExplorer() {
  const pools = usePoolsStore(selectFilteredPools);
  const categories = usePoolsStore(selectCategories);
  const selectedCategory = usePoolsStore((state) => state.selectedCategory);
  const setSelectedCategory = usePoolsStore((state) => state.setSelectedCategory);
  const setSelectedPoolId = usePoolsStore((state) => state.setSelectedPoolId);
  const unfilteredPools = usePoolsStore((state) => state.pools);
  const isLoading = usePoolsStore((state) => state.isLoading);
  const error = usePoolsStore((state) => state.error);
  const loadPools = usePoolsStore((state) => state.loadPools);
  const viewMode = usePoolsStore((state) => state.viewMode);
  const setViewMode = usePoolsStore((state) => state.setViewMode);
  const loadMyPools = usePoolsStore((state) => state.loadMyPools);
  const myPoolsLoading = usePoolsStore((state) => state.myPoolsLoading);

  const connectedAddress = useWalletStore((state) => state.connectedAddress);
  const setWalletModalOpen = useWalletStore((state) => state.setModalOpen);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [explorerTab, setExplorerTab] = useState<'events' | 'duels'>('events');
  const [isCreateDuelModalOpen, setIsCreateDuelModalOpen] = useState(false);

  const pendingWrites = usePendingWritesStore((state) => state.entries);
  const removePendingWrite = usePendingWritesStore((state) => state.removePendingWrite);
  const addPendingWrite = usePendingWritesStore((state) => state.addPendingWrite);

  const pendingCreate = pendingWrites.find(
    (entry) =>
      entry.action === 'create_pool' &&
      connectedAddress &&
      entry.wallet === connectedAddress.toLowerCase()
  );

  const [isCheckingPending, setIsCheckingPending] = useState(false);

  // Checks on-chain whether the pool count has increased to clear stale writes, resetting the TTL timer if not found
  const handleCheckPendingCreateAgain = async () => {
    if (!pendingCreate) return;
    setIsCheckingPending(true);
    try {
      const currentCount = await getPoolCount();
      const preCount = Number(pendingCreate.metadata?.preCreateCount || 0);
      if (currentCount > preCount) {
        removePendingWrite(pendingCreate.key);
        loadPools().catch(() => {});
      } else {
        // Reset the submission timer to pending state and update timestamp to prevent immediate timeout re-trigger
        addPendingWrite(
          pendingCreate.wallet,
          pendingCreate.action,
          pendingCreate.target,
          pendingCreate.txHash,
          pendingCreate.metadata
        );
      }
    } catch (err) {
      console.warn('Failed to manually check pending create state:', err);
    } finally {
      setIsCheckingPending(false);
    }
  };

  // Load prediction pools from Bradbury contract on component mount
  useEffect(() => {
    loadPools();
  }, [loadPools]);

  // Load user-specific pools when wallet connects or view mode switches to 'mine'
  useEffect(() => {
    if (viewMode === 'mine' && connectedAddress) {
      loadMyPools(connectedAddress);
    }
  }, [viewMode, connectedAddress, loadMyPools]);

  // Reset active index when category or explorer tab changes to start from the first card
  useEffect(() => {
    setActiveIndex(0);
  }, [selectedCategory, explorerTab]);

  // Adjust translations dynamically based on mobile viewports to prevent overflow
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const normalEvents = pools.filter((p) => !p.name || !p.name.trim().toLowerCase().startsWith('duel:'));
  const duels = pools.filter((p) => p.name && p.name.trim().toLowerCase().startsWith('duel:'));

  const activePools = explorerTab === 'events' ? normalEvents : duels;
  const count = activePools.length;

  // Carousel actions
  const handlePrev = () => {
    if (count <= 1) return;
    setActiveIndex((prev) => (prev - 1 + count) % count);
  };

  const handleNext = () => {
    if (count <= 1) return;
    setActiveIndex((prev) => (prev + 1) % count);
  };

  // 3D transform calculations
  const getCardStyle = (index: number): React.CSSProperties => {
    if (count === 1) {
      return {
        transform: 'translate3d(0, 0, 0) scale(1)',
        opacity: 1,
        zIndex: 30,
        pointerEvents: 'auto',
        position: 'absolute',
        inset: 0,
      };
    }

    let offset = index - activeIndex;

    // Support cyclic wrapping for pools count larger than 2
    if (count > 2) {
      let diff = index - activeIndex;
      if (diff < -count / 2) diff += count;
      if (diff > count / 2) diff -= count;
      offset = diff;
    }

    const isActive = offset === 0;
    const isPrev = offset === -1;
    const isNext = offset === 1;
    const isVisible = isActive || isPrev || isNext;

    const translateAmount = isMobile ? '45%' : '105%';
    let transform = 'translate3d(0, 0, -150px) scale(0.85)';
    let opacity = 0;
    let zIndex = 0;
    let pointerEvents: 'auto' | 'none' = 'none';

    if (isActive) {
      transform = 'translate3d(0, 0, 0) scale(1) rotateY(0deg)';
      opacity = 1;
      zIndex = 30;
      pointerEvents = 'auto';
    } else if (isPrev) {
      transform = `translate3d(-${translateAmount}, 0, -120px) scale(0.88) rotateY(28deg)`;
      opacity = 0.45;
      zIndex = 20;
      pointerEvents = 'auto';
    } else if (isNext) {
      transform = `translate3d(${translateAmount}, 0, -120px) scale(0.88) rotateY(-28deg)`;
      opacity = 0.45;
      zIndex = 20;
      pointerEvents = 'auto';
    }

    return {
      transform,
      opacity: isVisible ? opacity : 0,
      zIndex,
      pointerEvents,
      position: 'absolute',
      inset: 0,
      transition: 'all 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
      willChange: 'transform, opacity',
    };
  };

  // Skeletons during loading
  if (isLoading || (viewMode === 'mine' && myPoolsLoading)) {
    return (
      <div className="w-full max-w-sm sm:max-w-md mx-auto p-6 sm:p-7 h-[460px] bg-charcoal-medium/40 dark:bg-charcoal-medium/20 border border-charcoal-light/30 rounded-2xl animate-pulse flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="h-3 w-16 bg-charcoal-light/30 rounded" />
          <div className="h-5 w-16 bg-charcoal-light/30 rounded-full" />
        </div>
        <div className="flex-1 flex flex-col justify-between mt-8">
          <div>
            <div className="h-6 w-3/4 bg-charcoal-light/30 rounded mb-4" />
            <div className="h-6 w-1/2 bg-charcoal-light/30 rounded mb-8" />
            <div className="space-y-3 mb-6">
              <div className="h-10 w-full bg-charcoal-light/30 rounded-xl" />
              <div className="h-10 w-full bg-charcoal-light/30 rounded-xl" />
            </div>
            <div className="h-2 w-full bg-charcoal-light/30 rounded-full" />
          </div>
          <div className="h-12 w-full bg-charcoal-light/20 rounded-xl mt-6" />
        </div>
        <div className="border-t border-charcoal-light/20 pt-4 mt-6 flex justify-between items-center">
          <div className="h-4 w-28 bg-charcoal-light/30 rounded" />
          <div className="h-4 w-20 bg-charcoal-light/30 rounded" />
        </div>
      </div>
    );
  }

  // Elegant Error Display
  if (error) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-charcoal-medium/30 border border-charcoal-light/30 rounded-2xl text-center shadow-lg animate-fade-in">
        <div className="flex justify-center mb-5">
          <div className="p-3 bg-brand-magenta/10 rounded-full text-brand-magenta border border-brand-magenta/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
        <h4 className="text-lg font-bold text-foreground mb-2">
          Unable to Load Prediction Events
        </h4>
        <p className="text-sm text-foreground/50 leading-relaxed mb-6 font-light">
          We encountered an issue reading from the Bradbury contract. The network might be congested.
        </p>
        <button
          onClick={loadPools}
          className="flex items-center justify-center gap-2 mx-auto px-5 py-2.5 bg-foreground hover:bg-warm-white text-background text-sm font-semibold tracking-wide rounded-xl transition-all shadow-md cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center select-none animate-fade-in-up">
      {/* Explorer Mode Switcher */}
      <div className="flex items-center bg-charcoal-medium/30 p-1 border border-charcoal-light/35 rounded-2xl mb-8">
        <button
          onClick={() => {
            setExplorerTab('events');
            setSelectedCategory('All');
          }}
          className={`px-5 py-2 text-xs font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer rounded-xl ${
            explorerTab === 'events'
              ? 'bg-brand-gold text-charcoal-dark shadow-md font-extrabold'
              : 'text-foreground/60 hover:text-foreground'
          }`}
        >
          Prediction Events
        </button>
        <button
          onClick={() => {
            setExplorerTab('duels');
            setSelectedCategory('All');
          }}
          className={`px-5 py-2 text-xs font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer rounded-xl ${
            explorerTab === 'duels'
              ? 'bg-brand-magenta text-foreground shadow-md font-extrabold'
              : 'text-foreground/60 hover:text-foreground'
          }`}
        >
          1v1 Duels
        </button>
      </div>

      {/* Category tabs navigation and Create Pool Trigger */}
      <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-4xl gap-4 mb-12 px-4">
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
          {/* View Mode Toggle: Single My Pools toggle pill */}
          <button
            onClick={() => {
              const nextMode = viewMode === 'mine' ? 'all' : 'mine';
              setViewMode(nextMode);
              if (nextMode === 'mine' && connectedAddress) {
                loadMyPools(connectedAddress);
              }
            }}
            className={`px-4 py-2 text-xs font-semibold tracking-wider uppercase border transition-all duration-200 cursor-pointer ${
              viewMode === 'mine'
                ? 'relative rounded-full overflow-hidden bg-charcoal-medium/75 border-brand-magenta/40 text-brand-magenta'
                : 'rounded-xl bg-charcoal-medium/40 hover:bg-charcoal-medium border-charcoal-light/30 text-foreground/60 hover:text-foreground'
            }`}
          >
            My Events
            {viewMode === 'mine' && (
              <div 
                className="border-beam-container" 
                style={{
                  '--border-beam-width': '1.5px',
                  '--border-beam-dark-opacity': '0.45',
                  '--border-beam-light-opacity': '0.25',
                } as React.CSSProperties}
              />
            )}
          </button>


          {/* Separator element matches the styling guidelines without hardcoding assets */}
          <div className="w-[1px] h-6 bg-charcoal-light/20 mx-2 hidden md:block" />

          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 text-xs font-semibold tracking-wider uppercase rounded-xl border transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-brand-gold text-charcoal-dark border-brand-gold shadow-md'
                    : 'bg-charcoal-medium/40 hover:bg-charcoal-medium border-charcoal-light/30 text-foreground/60 hover:text-foreground'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3.5 shrink-0">
          {pendingCreate ? (
            pendingCreate.status === 'pending' ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/45 text-xs font-bold font-display tracking-wider uppercase shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-brand-gold" />
                <span>Creating Event</span>
                <a
                  href={`https://explorer-bradbury.genlayer.com/tx/${pendingCreate.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/40 hover:text-foreground transition-all ml-1 shrink-0"
                  title="View on explorer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-2.5 bg-brand-magenta/5 border border-brand-magenta/20 rounded-xl shrink-0 animate-fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-brand-magenta shrink-0 animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-brand-magenta uppercase tracking-wider font-display">Creation Stale</span>
                    <span className="text-[9px] text-foreground/50 truncate max-w-[120px]" title={pendingCreate.txHash}>
                      {pendingCreate.txHash.slice(0, 6)}...{pendingCreate.txHash.slice(-4)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`https://explorer-bradbury.genlayer.com/tx/${pendingCreate.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-charcoal-medium hover:bg-charcoal-light border border-charcoal-light/35 rounded-lg text-foreground/60 hover:text-foreground transition-all"
                    title="View on explorer"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={handleCheckPendingCreateAgain}
                    disabled={isCheckingPending}
                    className="px-2 py-1 bg-brand-magenta/10 hover:bg-brand-magenta/20 border border-brand-magenta/30 text-brand-magenta text-[9px] font-bold rounded-lg transition-all cursor-pointer uppercase tracking-wider disabled:opacity-50 font-display"
                  >
                    {isCheckingPending ? 'Checking...' : 'Check Again'}
                  </button>
                  <button
                    onClick={() => removePendingWrite(pendingCreate.key)}
                    className="px-2 py-1 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-foreground text-[9px] font-bold rounded-lg transition-all cursor-pointer uppercase tracking-wider font-display"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="relative overflow-hidden px-4 py-2 flex items-center gap-1.5 bg-brand-gold/10 hover:bg-brand-gold/20 border border-brand-gold/30 text-brand-gold text-xs font-bold rounded-xl transition-all cursor-pointer font-display tracking-wider uppercase shadow-md shrink-0"
              >
                Create Event
                <div 
                  className="border-beam-container" 
                  style={{
                    '--border-beam-width': '1.5px',
                    '--border-beam-dark-opacity': '0.45',
                    '--border-beam-light-opacity': '0.25',
                  } as React.CSSProperties}
                />
              </button>
              <button
                onClick={() => setIsCreateDuelModalOpen(true)}
                className="relative overflow-hidden px-4 py-2 flex items-center gap-1.5 bg-brand-magenta/10 hover:bg-brand-magenta/20 border border-brand-magenta/30 text-brand-magenta text-xs font-bold rounded-xl transition-all cursor-pointer font-display tracking-wider uppercase shadow-md shrink-0"
              >
                Create Duel
                <div 
                  className="border-beam-container" 
                  style={{
                    '--border-beam-width': '1.5px',
                    '--border-beam-dark-opacity': '0.45',
                    '--border-beam-light-opacity': '0.25',
                  } as React.CSSProperties}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'mine' && !connectedAddress ? (
        <div className="w-full max-w-md mx-auto p-10 bg-charcoal-medium/30 border border-charcoal-light/30 rounded-2xl text-center shadow-lg animate-fade-in">
          <div className="flex justify-center mb-5">
            <div className="p-3 bg-charcoal-light/30 rounded-full text-foreground/50 border border-charcoal-light/50">
              <HelpCircle className="w-6 h-6" />
            </div>
          </div>
          <h4 className="text-lg font-bold text-foreground mb-2">
            Wallet Not Connected
          </h4>
          <p className="text-sm text-foreground/50 leading-relaxed font-light mb-6">
            Please connect your wallet to view agreements you created or joined.
          </p>
          <button
            onClick={() => setWalletModalOpen(true)}
            className="px-5 py-2.5 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-bold rounded-xl transition-all cursor-pointer font-display tracking-wider uppercase shadow-md mx-auto"
          >
            Connect Wallet
          </button>
        </div>
      ) : unfilteredPools.length === 0 ? (
        // Empty state handling
        <div className="w-full max-w-md mx-auto p-10 bg-charcoal-medium/30 border border-charcoal-light/30 rounded-2xl text-center shadow-lg animate-fade-in">
          <div className="flex justify-center mb-5">
            <div className="p-3 bg-charcoal-light/30 rounded-full text-foreground/50 border border-charcoal-light/50">
              <HelpCircle className="w-6 h-6" />
            </div>
          </div>
          <h4 className="text-lg font-bold text-foreground mb-2">
            No Active Events Found
          </h4>
          <p className="text-sm text-foreground/50 leading-relaxed font-light mb-6">
            There are currently no prediction events registered on the live Bradbury contract.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-bold rounded-xl transition-all cursor-pointer font-display tracking-wider uppercase shadow-md"
            >
              Create Event
            </button>
            <button
              onClick={loadPools}
              className="flex items-center gap-2 px-5 py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-sm font-semibold text-foreground transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh List
            </button>
          </div>
        </div>
      ) : activePools.length === 0 ? (
        // Category-specific or tab-specific empty state handling
        <div className="w-full max-w-md mx-auto p-10 bg-charcoal-medium/30 border border-charcoal-light/30 rounded-2xl text-center shadow-lg animate-fade-in">
          <div className="flex justify-center mb-5">
            <div className="p-3 bg-charcoal-light/30 rounded-full text-foreground/50 border border-charcoal-light/50">
              <HelpCircle className="w-6 h-6" />
            </div>
          </div>
          <h4 className="text-lg font-bold text-foreground mb-2">
            {explorerTab === 'duels' ? 'No Duels Found' : 'No Events in Category'}
          </h4>
          <p className="text-sm text-foreground/50 leading-relaxed font-light mb-6">
            {viewMode === 'mine'
              ? 'You have not created or participated in any yet.'
              : `There are currently no active ${explorerTab === 'duels' ? 'duels' : 'prediction events'} in the "${selectedCategory}" category.`}
          </p>
          {viewMode === 'mine' ? (
            <button
              onClick={() => setViewMode('all')}
              className="px-5 py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-sm font-semibold text-foreground transition-all cursor-pointer mx-auto"
            >
              Show All
            </button>
          ) : (
            <button
              onClick={() => setSelectedCategory(categories[0] || 'All')}
              className="px-5 py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-sm font-semibold text-foreground transition-all cursor-pointer mx-auto"
            >
              Show All
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 3D Carousel Stage */}
          <div 
            className="relative w-full max-w-sm sm:max-w-md h-[480px] flex items-center justify-center"
            style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
          >
            {activePools.map((pool, idx) => {
              let offset = idx - activeIndex;
              if (count > 2) {
                let diff = idx - activeIndex;
                if (diff < -count / 2) diff += count;
                if (diff > count / 2) diff -= count;
                offset = diff;
              }
              const isActive = offset === 0 || count === 1;

              return (
                <div 
                  key={pool.pool_id} 
                  style={getCardStyle(idx)}
                  onClick={() => {
                    if (isActive) {
                      setSelectedPoolId(pool.pool_id);
                    } else {
                      setActiveIndex(idx);
                    }
                  }}
                >
                  {explorerTab === 'events' ? (
                    <PoolCard pool={pool} isActive={isActive} displayIndex={idx + 1} />
                  ) : (
                    <DuelCard
                      pool={pool}
                      isActive={isActive}
                      displayIndex={idx + 1}
                      onClick={() => {
                        if (isActive) {
                          setSelectedPoolId(pool.pool_id);
                        }
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Navigation Controls (Hidden if only 1 pool) */}
          {count > 1 && (
            <div className="flex items-center gap-6 mt-6">
              <button
                onClick={handlePrev}
                className="p-3 bg-charcoal-medium hover:bg-charcoal-light border border-charcoal-light/30 rounded-full text-foreground/75 hover:text-foreground transition-all shadow-md cursor-pointer"
                title={explorerTab === 'events' ? "Previous prediction event" : "Previous duel"}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase">
                {activeIndex + 1} of {count}
              </span>

              <button
                onClick={handleNext}
                className="p-3 bg-charcoal-medium hover:bg-charcoal-light border border-charcoal-light/30 rounded-full text-foreground/75 hover:text-foreground transition-all shadow-md cursor-pointer"
                title={explorerTab === 'events' ? "Next prediction event" : "Next duel"}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Sliding side drawer panel */}
      <PoolDetailDrawer />

      {/* Create Pool modal form */}
      <CreatePoolModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Create Duel modal form */}
      <CreateDuelModal
        isOpen={isCreateDuelModalOpen}
        onClose={() => setIsCreateDuelModalOpen(false)}
      />
    </div>
  );
}
