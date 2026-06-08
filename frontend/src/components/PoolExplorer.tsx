'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, HelpCircle } from 'lucide-react';
import { usePoolsStore, selectFilteredPools, selectCategories } from '../store/pools';
import PoolCard from './PoolCard';

export default function PoolExplorer() {
  const pools = usePoolsStore(selectFilteredPools);
  const categories = usePoolsStore(selectCategories);
  const selectedCategory = usePoolsStore((state) => state.selectedCategory);
  const setSelectedCategory = usePoolsStore((state) => state.setSelectedCategory);
  const unfilteredPools = usePoolsStore((state) => state.pools);
  const isLoading = usePoolsStore((state) => state.isLoading);
  const error = usePoolsStore((state) => state.error);
  const loadPools = usePoolsStore((state) => state.loadPools);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Load prediction pools from Bradbury contract on component mount
  useEffect(() => {
    loadPools();
  }, [loadPools]);

  // Reset active index when category changes to start from the first card
  useEffect(() => {
    setActiveIndex(0);
  }, [selectedCategory]);

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

  const count = pools.length;

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
    } else if (isNext) {
      transform = `translate3d(${translateAmount}, 0, -120px) scale(0.88) rotateY(-28deg)`;
      opacity = 0.45;
      zIndex = 20;
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
  if (isLoading) {
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
          Unable to Load Prediction Pools
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

  // Empty state handling
  if (unfilteredPools.length === 0) {
    return (
      <div className="w-full max-w-md mx-auto p-10 bg-charcoal-medium/30 border border-charcoal-light/30 rounded-2xl text-center shadow-lg animate-fade-in">
        <div className="flex justify-center mb-5">
          <div className="p-3 bg-charcoal-light/30 rounded-full text-foreground/50 border border-charcoal-light/50">
            <HelpCircle className="w-6 h-6" />
          </div>
        </div>
        <h4 className="text-lg font-bold text-foreground mb-2">
          No Active Pools Found
        </h4>
        <p className="text-sm text-foreground/50 leading-relaxed font-light mb-6">
          There are currently no prediction pools registered on the live Bradbury contract.
        </p>
        <button
          onClick={loadPools}
          className="flex items-center justify-center gap-2 mx-auto px-5 py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-sm font-semibold text-foreground transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh List
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center select-none animate-fade-in-up">
      {/* Category tabs navigation */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-12 w-full max-w-2xl px-4">
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

      {/* 3D Carousel Stage */}
      <div 
        className="relative w-full max-w-sm sm:max-w-md h-[480px] flex items-center justify-center"
        style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
      >
        {pools.map((pool, idx) => (
          <div key={pool.pool_id} style={getCardStyle(idx)}>
            <PoolCard pool={pool} />
          </div>
        ))}
      </div>

      {/* Navigation Controls (Hidden if only 1 pool) */}
      {count > 1 && (
        <div className="flex items-center gap-6 mt-6">
          <button
            onClick={handlePrev}
            className="p-3 bg-charcoal-medium hover:bg-charcoal-light border border-charcoal-light/30 rounded-full text-foreground/75 hover:text-foreground transition-all shadow-md cursor-pointer"
            title="Previous prediction pool"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase">
            {activeIndex + 1} of {count}
          </span>

          <button
            onClick={handleNext}
            className="p-3 bg-charcoal-medium hover:bg-charcoal-light border border-charcoal-light/30 rounded-full text-foreground/75 hover:text-foreground transition-all shadow-md cursor-pointer"
            title="Next prediction pool"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
