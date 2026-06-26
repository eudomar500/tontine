'use client';

import React from 'react';
import Avatar from 'boring-avatars';
import { PoolSummary, weiToGen, stateLabel, truncateAddress, timeRemaining, cleanTerms } from '../services/contract';
import { useThemeStore } from '../store/theme';

interface PoolCardProps {
  pool: PoolSummary;
  isActive?: boolean;
  displayIndex: number;
}

export default function PoolCard({ pool, isActive = true, displayIndex }: PoolCardProps) {
  const theme = useThemeStore((state) => state.theme);
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
    <div className={`relative flex flex-col justify-between p-5 sm:p-6 w-full h-[460px] bg-charcoal-medium/40 dark:bg-charcoal-medium/20 border border-charcoal-light/30 rounded-2xl shadow-xl transition-all duration-300 backdrop-blur-md select-none overflow-hidden ${isActive ? 'cursor-pointer hover:border-charcoal-light/60 shadow-brand-gold/5 dark:hover:shadow-brand-magenta/5' : 'cursor-default'}`}>

      {/* Border Beam */}
      <div
        className="border-beam-container"
        style={{
          '--border-beam-width': '1.2px',
          '--border-beam-dark-opacity': '0.22',
          '--border-beam-light-opacity': '0.12',
        } as React.CSSProperties}
      />

      {/* Top Header Section */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold tracking-widest uppercase"
              style={{
                color: theme === 'dark' ? '#9FFF3C' : '#478A00',
                textShadow: theme === 'dark' ? '0 0 8px rgba(159, 255, 60, 0.4)' : '0 0 8px rgba(71, 138, 0, 0.25)',
              }}
            >
              Event #{displayIndex}
            </span>
            {pool.category && pool.category.trim() !== '' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-charcoal-light/30 text-foreground/60 border border-charcoal-light/20 uppercase tracking-wider">
                {pool.category}
              </span>
            )}
            {pool.is_open && Math.floor(Date.now() / 1000) < pool.join_deadline && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-gold/10 text-brand-gold border border-brand-gold/20 uppercase tracking-wider"
                style={{
                  textShadow: theme === 'dark' ? '0 0 8px rgba(201, 162, 39, 0.45)' : '0 0 8px rgba(201, 162, 39, 0.25)',
                }}
              >
                Open
              </span>
            )}
          </div>
          {pool.name && pool.name.trim() !== '' && (
            <span className="text-xs font-semibold text-foreground/60">
              Room: <span className="text-foreground/80 font-normal">{pool.name}</span>
            </span>
          )}
        </div>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${getBadgeStyles(pool.state)}`}>
          {stateLabel(pool.state)}
        </span>
      </div>

      {/* Main content body */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          {/* Question / Short terms */}
          <h3 className="text-base font-bold text-foreground leading-snug tracking-tight mb-3 line-clamp-2 min-h-[40px]" title={pool.terms_short}>
            {cleanTerms(pool.terms_short) || pool.name || 'Untitled'}
          </h3>

          {/* Outcomes staked list */}
          <div className="space-y-1.5 mb-4">
            {(() => {
              const totalOutcomes = pool.outcome_labels.length;
              const showAll = totalOutcomes <= 5;
              const displayCount = showAll ? totalOutcomes : 4;

              const rows = [];
              for (let idx = 0; idx < displayCount; idx++) {
                const label = pool.outcome_labels[idx];
                const isWinner = pool.state === 2 && pool.winning_outcome_index !== 255 && pool.winning_outcome_index === idx;
                rows.push(
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-3 py-1 rounded-xl border transition-all duration-300 ${
                      isWinner
                        ? 'bg-brand-gold/10 border-brand-gold/40 text-brand-gold'
                        : 'bg-charcoal-dark/40 dark:bg-charcoal-dark/60 border-charcoal-light/20 text-foreground/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-medium truncate block max-w-[160px] sm:max-w-[200px]" title={label}>{label}</span>
                      {isWinner && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-brand-gold text-charcoal-dark uppercase tracking-wider font-extrabold rounded-md shrink-0">
                          Winner
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold block">
                        {weiToGen(pool.outcome_totals[idx])} GEN
                      </span>
                    </div>
                  </div>
                );
              }

              if (!showAll) {
                rows.push(
                  <div
                    key="more-indicator"
                    className="flex items-center justify-center px-3 py-1 rounded-xl border border-dashed border-brand-gold/30 bg-brand-gold/5 text-brand-gold hover:border-brand-gold/50 transition-all duration-300"
                  >
                    <span className="text-xs font-bold font-display uppercase tracking-wider">
                      + {totalOutcomes - 4} more outcomes
                    </span>
                  </div>
                );
              }

              return rows;
            })()}
          </div>

          {/* Relative Stake proportion bar */}
          <div className="space-y-1.5 mb-4">
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

        {/* Highlighted Total Event Section */}
        <div className="bg-charcoal-dark/20 dark:bg-charcoal-dark/40 border border-charcoal-light/25 rounded-xl p-2.5 flex justify-between items-center mb-4">
          <span className="text-xs text-foreground/50 font-medium">
            Total Event Amount
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
