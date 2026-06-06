'use client';

import React from 'react';
import Avatar from 'boring-avatars';
import { PoolSummary, weiToGen, stateLabel, truncateAddress, timeRemaining } from '../services/contract';

interface PoolCardProps {
  pool: PoolSummary;
}

export default function PoolCard({ pool }: PoolCardProps) {
  const totals = pool.outcome_totals.map((t) => BigInt(t));
  const totalStake = totals.reduce((a, b) => a + b, 0n);

  // Calculate percentage weight for each outcome staked amount
  const proportions = totals.map((t) => {
    if (totalStake === 0n) return 100 / pool.outcome_count;
    return Number((t * 10000n) / totalStake) / 100;
  });

  // Decide status badge styling classes
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

  // Determine footer contextual status message
  const getContextualText = () => {
    switch (pool.state) {
      case 0:
        const remaining = timeRemaining(pool.join_deadline);
        return remaining === 'closed' ? 'Entries closed' : `Entries close in ${remaining}`;
      case 1:
        return 'In resolution';
      case 2:
        return 'Resolved';
      case 3:
      case 4:
      default:
        return 'Refunded';
    }
  };

  return (
    <div className="relative flex flex-col justify-between p-6 sm:p-7 w-full h-[460px] bg-charcoal-medium/40 dark:bg-charcoal-medium/20 border border-charcoal-light/30 rounded-2xl shadow-xl transition-all duration-300 backdrop-blur-md select-none overflow-hidden">
      
      {/* Top Header Section */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase">
          Pool #{pool.pool_id}
        </span>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${getBadgeStyles(pool.state)}`}>
          {stateLabel(pool.state)}
        </span>
      </div>

      {/* Main content body */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          {/* Question / Short terms */}
          <h3 className="text-lg sm:text-xl font-bold text-foreground leading-snug tracking-tight mb-5 line-clamp-2 min-h-[56px]" title={pool.terms_short}>
            {pool.terms_short}
          </h3>

          {/* Outcomes staked list */}
          <div className="space-y-2.5 mb-5">
            {pool.outcome_labels.map((label, idx) => {
              const isWinner = pool.state === 2 && pool.winning_outcome_index !== 255 && pool.winning_outcome_index === idx;
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-300 ${
                    isWinner
                      ? 'bg-brand-gold/10 border-brand-gold/40 text-brand-gold'
                      : 'bg-charcoal-dark/40 dark:bg-charcoal-dark/60 border-charcoal-light/20 text-foreground/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    {isWinner && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-brand-gold text-charcoal-dark uppercase tracking-wider font-extrabold rounded-md">
                        Winner
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold block">
                      {weiToGen(pool.outcome_totals[idx])} GEN
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Relative Stake proportion bar */}
          <div className="space-y-1.5 mb-6">
            <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-charcoal-light/20">
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
              <span>Relative stake distribution</span>
              <span>{pool.participant_count} {pool.participant_count === 1 ? 'participant' : 'participants'}</span>
            </div>
          </div>
        </div>

        {/* Highlighted Total Pool Section */}
        <div className="bg-charcoal-dark/20 dark:bg-charcoal-dark/40 border border-charcoal-light/25 rounded-xl p-3.5 flex justify-between items-center mb-6">
          <span className="text-xs text-foreground/50 font-medium">
            Total Pool Amount
          </span>
          <span className="text-lg font-bold text-foreground tracking-tight">
            {weiToGen(pool.total_pool)} GEN
          </span>
        </div>
      </div>

      {/* Footer Section */}
      <div className="flex items-center justify-between border-t border-charcoal-light/25 pt-4 mt-auto">
        <div className="flex items-center gap-2 text-foreground/60">
          <div className="flex items-center justify-center rounded-full overflow-hidden w-5.5 h-5.5 border border-charcoal-light/50">
            <Avatar
              size={22}
              name={pool.creator}
              variant="marble"
              colors={['#c9a227', '#b23a6e', '#f1ece3', '#1f1f22', '#0b0b0c']}
            />
          </div>
          <span className="text-[11px] font-medium tracking-wide">
            Creator: {truncateAddress(pool.creator)}
          </span>
        </div>

        <span className="text-xs font-semibold text-brand-gold/90 dark:text-brand-magenta/90 tracking-wide">
          {getContextualText()}
        </span>
      </div>
    </div>
  );
}
