'use client';

import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Clock, Users, Globe, User, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { usePoolsStore } from '../store/pools';
import { getPool, Pool, weiToGen, stateLabel, truncateAddress } from '../services/contract';

export default function PoolDetailDrawer() {
  const selectedPoolId = usePoolsStore((state) => state.selectedPoolId);
  const setSelectedPoolId = usePoolsStore((state) => state.setSelectedPoolId);
  const [pool, setPool] = useState<Pool | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc key closes the drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPoolId(null);
      }
    };
    if (selectedPoolId) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPoolId, setSelectedPoolId]);

  // Fetch pool details dynamically upon selection changes
  useEffect(() => {
    if (!selectedPoolId) {
      setPool(null);
      return;
    }

    let isMounted = true;
    const fetchPoolDetail = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const detail = await getPool(selectedPoolId);
        if (isMounted) {
          setPool(detail);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to retrieve pool details.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPoolDetail();

    return () => {
      isMounted = false;
    };
  }, [selectedPoolId]);

  const formatDate = (unix: number) => {
    return new Date(unix * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getBadgeStyles = (state: number) => {
    switch (state) {
      case 0: // Open
        return 'bg-foreground/5 text-foreground/80 border-foreground/15';
      case 1: // Resolving
        return 'bg-brand-gold/10 text-brand-gold border-brand-gold/20';
      case 2: // Settled
        return 'bg-brand-magenta/10 text-brand-magenta border-brand-magenta/20';
      case 3: // Refunded
      case 4: // Emergency
      default:
        return 'bg-charcoal-medium border-charcoal-light text-foreground/50';
    }
  };

  const totals = pool?.outcomes.map((o) => BigInt(o.total_staked)) || [];
  const totalStake = totals.reduce((a, b) => a + b, 0n);
  const proportions = pool ? totals.map((t) => {
    if (totalStake === 0n) return 100 / pool.outcomes.length;
    return Number((t * 10000n) / totalStake) / 100;
  }) : [];

  const isResolved = pool && (pool.state === 2 || pool.winning_outcome_index !== 255);

  return (
    <>
      {/* Background Overlay */}
      <div
        onClick={() => setSelectedPoolId(null)}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          selectedPoolId ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer Container */}
      <div
        className={`fixed inset-y-0 right-0 w-full max-w-lg bg-charcoal-dark border-l border-charcoal-light/30 z-50 shadow-2xl transition-transform duration-300 ease-in-out transform flex flex-col ${
          selectedPoolId ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Fixed Header Section */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-charcoal-light/25 bg-charcoal-medium/20">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase">
                Pool #{selectedPoolId}
              </span>
              {pool?.category && pool.category.trim() !== '' && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-charcoal-light/30 text-foreground/60 border border-charcoal-light/20 uppercase tracking-wider">
                  {pool.category}
                </span>
              )}
            </div>
            {pool && (
              <div>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${getBadgeStyles(pool.state)}`}>
                  {stateLabel(pool.state)}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setSelectedPoolId(null)}
            className="p-2 hover:bg-charcoal-medium border border-charcoal-light/35 rounded-xl text-foreground/50 hover:text-foreground transition-all cursor-pointer"
            title="Close details panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8 space-y-8">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
              <span className="text-sm text-foreground/50 font-light">Loading pool details...</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center text-center py-16 px-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl">
              <AlertCircle className="w-8 h-8 text-brand-magenta mb-3" />
              <h4 className="text-sm font-bold text-foreground mb-1">Failed to Load Details</h4>
              <p className="text-xs text-foreground/50 mb-4">{error}</p>
              <button
                onClick={() => selectedPoolId && getPool(selectedPoolId).then(setPool).catch((err) => setError(err.message))}
                className="px-4 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-xs font-semibold text-foreground transition-all cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && pool && (
            <>
              {/* Resolution Evidence Box (Rendered at top of details if resolved) */}
              {isResolved && (
                <div className="bg-brand-gold/10 border border-brand-gold/25 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-brand-gold mb-3 font-semibold text-sm font-display tracking-wide uppercase">
                    <CheckCircle2 className="w-4 h-4" />
                    Consensus Resolution
                  </div>
                  <div className="space-y-3.5">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block mb-1">Winning Outcome</span>
                      <span className="text-sm font-bold text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-1 rounded-lg inline-block">
                        {pool.outcomes[pool.winning_outcome_index]?.label || `Index #${pool.winning_outcome_index}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block mb-1.5">LLM Verdict Evidence</span>
                      <p className="text-xs text-foreground/80 leading-relaxed font-mono bg-charcoal-dark/50 border border-charcoal-light/15 p-3 rounded-xl whitespace-pre-wrap select-text">
                        {pool.resolution_evidence}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Full Terms Text */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground/45 tracking-widest uppercase">
                  <FileText className="w-3.5 h-3.5" />
                  Agreement Terms
                </div>
                <p className="text-base text-foreground/85 leading-relaxed font-light select-text">
                  {pool.terms}
                </p>
              </div>

              {/* Outcomes and Stakes */}
              <div className="space-y-4">
                <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                  Outcomes & Stakes
                </span>

                {/* Staked Proportion Bar */}
                <div className="space-y-2">
                  <div className="h-2 w-full rounded-full overflow-hidden flex bg-charcoal-light/20">
                    {proportions.map((percentage, index) => {
                      let bgColor = 'bg-foreground/20';
                      if (index === 0) bgColor = 'bg-brand-gold';
                      else if (index === 1) bgColor = 'bg-brand-magenta';
                      else if (index === 2) bgColor = 'bg-foreground/55';

                      return (
                        <div
                          key={index}
                          style={{ width: `${percentage}%` }}
                          className={`h-full transition-all duration-500 ${bgColor}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-foreground/40 uppercase tracking-wider">
                    <span>Relative distribution</span>
                    <span>{weiToGen(pool.total_pool)} GEN Staked</span>
                  </div>
                </div>

                {/* Outcomes Table */}
                <div className="space-y-2.5">
                  {pool.outcomes.map((outcome, idx) => {
                    const isWinner = pool.state === 2 && pool.winning_outcome_index !== 255 && pool.winning_outcome_index === idx;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300 ${
                          isWinner
                            ? 'bg-brand-gold/10 border-brand-gold/45 text-brand-gold'
                            : 'bg-charcoal-medium/40 border-charcoal-light/15 text-foreground/80'
                        }`}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{outcome.label}</span>
                            {isWinner && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-brand-gold text-charcoal-dark uppercase tracking-wider font-extrabold rounded-md">
                                Winner
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-foreground/40 mt-0.5">
                            {Number(outcome.participants_count)} {Number(outcome.participants_count) === 1 ? 'participant' : 'participants'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold block">
                            {weiToGen(outcome.total_staked)} GEN
                          </span>
                          <span className="text-[10px] text-foreground/45">
                            {proportions[idx]?.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timeline Deadlines */}
              <div className="space-y-3.5 border-t border-charcoal-light/20 pt-6">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground/45 tracking-widest uppercase">
                  <Clock className="w-3.5 h-3.5" />
                  Timeline
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-start justify-between bg-charcoal-medium/20 border border-charcoal-light/15 p-3 rounded-xl">
                    <span className="text-xs font-semibold text-foreground/50">Entries Close</span>
                    <span className="text-xs font-medium text-foreground/80">{formatDate(pool.join_deadline)}</span>
                  </div>
                  <div className="flex items-start justify-between bg-charcoal-medium/20 border border-charcoal-light/15 p-3 rounded-xl">
                    <span className="text-xs font-semibold text-foreground/50">Resolution Target</span>
                    <span className="text-xs font-medium text-foreground/80">{formatDate(pool.resolution_deadline)}</span>
                  </div>
                  <div className="flex items-start justify-between bg-charcoal-medium/20 border border-charcoal-light/15 p-3 rounded-xl">
                    <span className="text-xs font-semibold text-foreground/50">Timeout Limit</span>
                    <span className="text-xs font-medium text-foreground/80">{formatDate(pool.timeout_deadline)}</span>
                  </div>
                </div>
              </div>

              {/* Whitelist Details */}
              <div className="space-y-3.5 border-t border-charcoal-light/20 pt-6">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground/45 tracking-widest uppercase">
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Whitelist
                  </span>
                  <span className="text-foreground/40 font-bold lowercase">
                    {pool.whitelist.length} participants
                  </span>
                </div>
                <div className="max-h-28 overflow-y-auto border border-charcoal-light/15 rounded-xl bg-charcoal-medium/10 divide-y divide-charcoal-light/15 px-3">
                  {pool.whitelist.map((addr, idx) => (
                    <div key={idx} className="flex justify-between py-2 text-xs font-mono text-foreground/60 select-all">
                      {truncateAddress(addr)}
                      <a
                        href={`https://explorer-bradbury.genlayer.com/address/${addr}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground/40 hover:text-foreground transition-all"
                        title="View address on explorer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resolution Web Sources */}
              <div className="space-y-3 border-t border-charcoal-light/20 pt-6">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground/45 tracking-widest uppercase">
                  <Globe className="w-3.5 h-3.5" />
                  Verification Sources
                </div>
                <div className="space-y-2">
                  {pool.resolution_sources.map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl bg-charcoal-medium/30 hover:bg-charcoal-medium border border-charcoal-light/20 text-xs text-foreground/70 hover:text-foreground transition-all truncate"
                    >
                      <span className="truncate pr-4">{url}</span>
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-foreground/40" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Origin / Creator details */}
              <div className="flex items-center justify-between text-[11px] text-foreground/40 border-t border-charcoal-light/25 pt-4">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Creator: {truncateAddress(pool.creator)}
                </span>
                <span>Created: {new Date(pool.created_at * 1000).toLocaleDateString()}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
