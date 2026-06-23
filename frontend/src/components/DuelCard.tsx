'use client';

import React from 'react';
import Avatar from 'boring-avatars';
import { PoolSummary, weiToGen, stateLabel, truncateAddress, timeRemaining } from '../services/contract';
import { useThemeStore } from '../store/theme';

interface DuelCardProps {
  pool: PoolSummary;
  isActive?: boolean;
  onClick?: () => void;
}

export default function DuelCard({ pool, isActive = true, onClick }: DuelCardProps) {
  const theme = useThemeStore((state) => state.theme);

  // Strip prefix for clean title presentation
  const duelTitle = pool.name.toLowerCase().startsWith('duel:')
    ? pool.name.slice(5)
    : pool.name;

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

  const getContextualText = () => {
    switch (pool.state) {
      case 0:
        const remaining = timeRemaining(pool.join_deadline);
        return remaining === 'closed' ? 'Entries closed' : `Closes in ${remaining}`;
      case 1:
        return 'Resolving';
      case 2:
        return 'Resolved';
      case 3:
      case 4:
      default:
        return 'Refunded';
    }
  };

  // Determine indices without contract read
  const p1StakeAmt = BigInt(pool.outcome_totals[0] || '0');
  const p2StakeAmt = BigInt(pool.outcome_totals[1] || '0');
  let p1OutcomeIndex = 0;
  if (p1StakeAmt === 0n && p2StakeAmt > 0n) {
    p1OutcomeIndex = 1;
  }
  const p2OutcomeIndex = 1 - p1OutcomeIndex;

  const p1Address = pool.creator;
  const p1OutcomeLabel = pool.outcome_labels[p1OutcomeIndex] || 'Outcome A';
  const p2OutcomeLabel = pool.outcome_labels[p2OutcomeIndex] || 'Outcome B';

  const p1Stake = BigInt(pool.outcome_totals[p1OutcomeIndex] || '0');
  const p2Stake = BigInt(pool.outcome_totals[p2OutcomeIndex] || '0');

  const p2Joined = p2Stake > 0n;

  const p1Won = pool.state === 2 && pool.winning_outcome_index === p1OutcomeIndex;
  const p2Won = pool.state === 2 && pool.winning_outcome_index === p2OutcomeIndex;

  return (
    <div 
      onClick={isActive ? onClick : undefined}
      className={`relative flex flex-col justify-between p-6 w-full min-h-[380px] bg-charcoal-medium/40 dark:bg-charcoal-medium/20 border border-charcoal-light/30 rounded-2xl shadow-xl transition-all duration-300 backdrop-blur-md overflow-hidden ${isActive ? 'cursor-pointer hover:border-charcoal-light/60 hover:shadow-brand-magenta/5' : 'cursor-default'}`}
    >
      <div 
        className="border-beam-container" 
        style={{
          '--border-beam-width': '1.2px',
          '--border-beam-dark-opacity': '0.22',
          '--border-beam-light-opacity': '0.12',
        } as React.CSSProperties}
      />

      <div className="flex items-center justify-between mb-4">
        <span
          className="text-xs font-semibold tracking-widest uppercase"
          style={{
            color: theme === 'dark' ? '#9FFF3C' : '#478A00',
            textShadow: theme === 'dark' ? '0 0 8px rgba(159, 255, 60, 0.4)' : '0 0 8px rgba(71, 138, 0, 0.25)',
          }}
        >
          Duel #{pool.pool_id}
        </span>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${getBadgeStyles(pool.state)}`}>
          {stateLabel(pool.state)}
        </span>
      </div>

      {/* Head-to-Head 1v1 Display Section */}
      <div className="flex items-center justify-between px-2 py-4 bg-charcoal-dark/25 border border-charcoal-light/10 rounded-2xl mb-4 relative overflow-hidden">
        {/* Left Side: Challenger */}
        <div className="flex-1 flex flex-col items-center text-center space-y-2 max-w-[45%]">
          <div className="relative">
            <div className={`flex items-center justify-center rounded-full overflow-hidden w-11 h-11 border-2 ${p1Won ? 'border-brand-gold animate-pulse' : 'border-charcoal-light/40'}`}>
              <Avatar
                size={44}
                name={p1Address}
                variant="marble"
                colors={['#c9a227', '#b23a6e', '#f1ece3', '#1f1f22', '#0b0b0c']}
              />
            </div>
            {p1Won && (
              <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 py-0.5 bg-brand-gold text-charcoal-dark rounded uppercase tracking-wider">
                Won
              </span>
            )}
          </div>
          <span className="text-[10px] text-foreground/45 font-mono truncate w-24">
            {truncateAddress(p1Address)}
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground truncate w-24" title={p1OutcomeLabel}>
              {p1OutcomeLabel}
            </span>
            <span className="text-[10px] font-semibold text-brand-gold mt-0.5">
              {weiToGen(p1Stake.toString())} GEN
            </span>
          </div>
        </div>

        {/* Center VS Divider */}
        <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-charcoal-medium border border-charcoal-light/45 text-foreground/40 font-black text-xs shrink-0 select-none shadow-inner">
          <div className="absolute inset-0 rounded-full border-beam-container" style={{ opacity: 0.5 }} />
          VS
        </div>

        {/* Right Side: Opponent */}
        <div className="flex-1 flex flex-col items-center text-center space-y-2 max-w-[45%]">
          {p2Joined ? (
            <>
              <div className="relative">
                <div className={`flex items-center justify-center rounded-full overflow-hidden w-11 h-11 border-2 ${p2Won ? 'border-brand-gold animate-pulse' : 'border-charcoal-light/40'}`}>
                  <Avatar
                    size={44}
                    name={pool.pool_id + '-opponent'}
                    variant="marble"
                    colors={['#c9a227', '#b23a6e', '#f1ece3', '#1f1f22', '#0b0b0c']}
                  />
                </div>
                {p2Won && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 py-0.5 bg-brand-gold text-charcoal-dark rounded uppercase tracking-wider">
                    Won
                  </span>
                )}
              </div>
              <span className="text-[10px] text-foreground/45 font-mono truncate w-24">
                Opponent
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground truncate w-24" title={p2OutcomeLabel}>
                  {p2OutcomeLabel}
                </span>
                <span className="text-[10px] font-semibold mt-0.5 text-brand-gold">
                  {weiToGen(p2Stake.toString())} GEN
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <div className="w-11 h-11 rounded-full border border-dashed border-charcoal-light flex items-center justify-center text-foreground/20 text-lg">
                ?
              </div>
              <span className="text-[10px] text-foreground/30 font-light">
                {pool.is_open_duel ? 'Awaiting Challenger' : 'Awaiting Join'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground/90 tracking-wide line-clamp-1 mb-1">
            {duelTitle}
          </h3>
          <p className="text-xs text-foreground/50 leading-relaxed font-light line-clamp-2" title={pool.terms_short}>
            {pool.terms_short}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-charcoal-light/25 pt-3.5 mt-4">
          <span className="text-[10px] text-foreground/40 font-medium">
            Pot: <span className="font-bold text-foreground/80">{weiToGen(pool.total_pool)} GEN</span>
          </span>
          <span className="text-[10px] font-semibold text-brand-magenta tracking-wide">
            {getContextualText()}
          </span>
        </div>
      </div>
    </div>
  );
}
