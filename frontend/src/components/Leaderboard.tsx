'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, Trophy, ExternalLink } from 'lucide-react';
import { getLeaderboardSize, getLeaderboardRange, truncateAddress, LeaderboardEntry } from '../services/contract';

export default function Leaderboard() {
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'populated' | 'error'>('idle');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasTriggered, setHasTriggered] = useState(false);

  // IntersectionObserver to ensure no network calls fire until the component is scrolled into view
  useEffect(() => {
    if (hasTriggered) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasTriggered(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.05,
        rootMargin: '100px 0px 100px 0px',
      }
    );

    const current = containerRef.current;
    if (current) {
      observer.observe(current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasTriggered]);

  const loadLeaderboard = async () => {
    setState('loading');
    try {
      const size = await getLeaderboardSize();
      if (size === 0) {
        setEntries([]);
        setState('empty');
        return;
      }

      // Fetch entries up to a practical limit of 100 to allow complete client-side sorting of top performers
      const data = await getLeaderboardRange(0, Math.min(size, 100));
      if (data.length === 0) {
        setState('empty');
        return;
      }

      // Client-side sort by pools_won descending (primary), and win_rate_bps descending (secondary)
      const sorted = [...data].sort((a, b) => {
        if (b.pools_won !== a.pools_won) {
          return b.pools_won - a.pools_won;
        }
        return b.win_rate_bps - a.win_rate_bps;
      });

      setEntries(sorted);
      setState('populated');
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      setState('error');
    }
  };

  useEffect(() => {
    if (hasTriggered) {
      loadLeaderboard();
    }
  }, [hasTriggered]);

  // Idle state renders an empty spacer with layout presence to trigger the IntersectionObserver
  if (state === 'idle') {
    return <div ref={containerRef} className="w-full h-24" />;
  }

  return (
    <div
      ref={containerRef}
      className="w-full max-w-4xl mx-auto mt-24 mb-16 px-4 animate-fade-in"
    >
      <div className="text-center mb-10">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-3 font-display">
          Reputation Leaderboard
        </h2>
        <p className="text-xs sm:text-sm text-foreground/50 max-w-md mx-auto font-light leading-relaxed">
          Rankings of top-performing participant wallets based on finalized prediction agreements.
        </p>
      </div>

      {state === 'loading' && (
        <div className="w-full bg-charcoal-medium/20 border border-charcoal-light/30 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-brand-gold mb-4" />
          <p className="text-sm text-foreground/50 font-light">Loading rankings...</p>
        </div>
      )}

      {state === 'error' && (
        <div className="w-full bg-charcoal-medium/20 border border-charcoal-light/30 rounded-2xl p-8 text-center min-h-[300px] flex flex-col items-center justify-center">
          <div className="p-3 bg-brand-magenta/10 rounded-full text-brand-magenta border border-brand-magenta/20 mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-foreground mb-2">
            Failed to Load Leaderboard
          </h4>
          <p className="text-xs text-foreground/50 leading-relaxed max-w-sm mb-6 font-light">
            We were unable to retrieve the leaderboard data from the contract. This may be due to temporary RPC network latency.
          </p>
          <button
            onClick={loadLeaderboard}
            className="px-5 py-2.5 bg-foreground hover:bg-warm-white text-background text-xs font-semibold tracking-wide rounded-xl transition-all cursor-pointer shadow-md"
          >
            Retry Connection
          </button>
        </div>
      )}

      {state === 'empty' && (
        <div className="w-full bg-charcoal-medium/20 border border-charcoal-light/30 rounded-2xl p-12 text-center min-h-[250px] flex flex-col items-center justify-center">
          <div className="p-3 bg-charcoal-light/10 rounded-full text-foreground/40 border border-charcoal-light/20 mb-4">
            <Trophy className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-foreground mb-2">
            Leaderboard is Empty
          </h4>
          <p className="text-xs text-foreground/50 max-w-xs font-light">
            Rankings will appear here as events settle. Currently, no prediction pools have been finalized.
          </p>
        </div>
      )}

      {state === 'populated' && (
        <div className="relative overflow-hidden bg-charcoal-medium/20 border border-charcoal-light/30 rounded-2xl shadow-xl backdrop-blur-md">
          {/* Border Beam Accent */}
          <div
            className="border-beam-container"
            style={{
              '--border-beam-width': '1.2px',
              '--border-beam-dark-opacity': '0.15',
              '--border-beam-light-opacity': '0.08',
            } as React.CSSProperties}
          />

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-charcoal-light/20 text-xs font-bold text-foreground/45 uppercase tracking-wider bg-charcoal-medium/35">
                  <th className="py-4 px-6 w-20">Rank</th>
                  <th className="py-4 px-6">Participant</th>
                  <th className="py-4 px-6 text-right">Pools Won</th>
                  <th className="py-4 px-6 text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-light/15">
                {entries.map((entry, idx) => {
                  const rank = idx + 1;
                  const winRate = (entry.win_rate_bps / 100).toFixed(2);
                  
                  return (
                    <tr
                      key={entry.wallet}
                      className="hover:bg-charcoal-medium/30 transition-all group"
                    >
                      <td className="py-4 px-6 font-display font-bold">
                        {rank === 1 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs bg-brand-gold/15 text-brand-gold border border-brand-gold/30">
                            1
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs bg-foreground/10 text-foreground/80 border border-foreground/20">
                            2
                          </span>
                        ) : rank === 3 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs bg-brand-magenta/15 text-brand-magenta border border-brand-magenta/30">
                            3
                          </span>
                        ) : (
                          <span className="text-foreground/40 pl-2">{rank}</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground tracking-wide font-mono">
                            {truncateAddress(entry.wallet)}
                          </span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/address/${entry.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-charcoal-medium rounded text-foreground/45 hover:text-foreground transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="View on explorer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right font-display font-semibold text-sm text-foreground">
                        {entry.pools_won}
                      </td>
                      <td className="py-4 px-6 text-right text-xs text-foreground/50 font-light">
                        {winRate}%
                        <span className="text-[10px] text-foreground/30 ml-1.5">
                          ({entry.pools_resolved} settled)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
