'use client';

import React, { useState, useEffect } from 'react';
import { Activity, ChevronDown, ChevronUp, ExternalLink, Plus, Trash2, HelpCircle, CheckCircle2, Clock } from 'lucide-react';
import { useTxStore, TrackedTx, TxStatus } from '../store/transactions';

export default function NetworkStatus() {
  const { transactions, addTransaction, removeTransaction, tickElapsed, updateStatuses } = useTxStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [inputHash, setInputHash] = useState('');
  const [error, setError] = useState('');

  // 1. Tick elapsed time every second
  useEffect(() => {
    tickElapsed();
    const interval = setInterval(() => {
      tickElapsed();
    }, 1000);
    return () => clearInterval(interval);
  }, [tickElapsed]);

  // 2. Poll RPC for status updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      updateStatuses().catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [updateStatuses]);

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const hash = inputHash.trim();
    if (!hash) return;

    if (!hash.startsWith('0x') || hash.length < 10) {
      setError('Invalid transaction hash format');
      return;
    }

    addTransaction(hash, false);
    setInputHash('');
  };

  const handleTrackDemo = () => {
    const demoHash = `0xdemo_${Math.random().toString(36).substring(2, 10)}`;
    addTransaction(demoHash, true);
  };

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const truncateHash = (hash: string) => {
    if (hash.startsWith('0xdemo_')) {
      return `Demo Tx (${hash.slice(-4)})`;
    }
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  const activeCount = transactions.filter((tx) => tx.status !== 'finalized').length;

  if (transactions.length === 0 && isCollapsed) {
    setIsCollapsed(false);
  }

  // Floating collapsed bubble state
  if (isCollapsed) {
    return (
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 px-4 py-3 bg-charcoal-medium border border-charcoal-light hover:border-foreground/25 rounded-2xl shadow-xl text-sm font-semibold tracking-wide text-foreground transition-all cursor-pointer"
        >
          <Activity className={`w-4 h-4 text-brand-gold ${activeCount > 0 ? 'animate-pulse' : ''}`} />
          <span>Trackers ({transactions.length})</span>
          {activeCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-brand-gold animate-ping" />
          )}
          <ChevronUp className="w-4 h-4 text-foreground/50 ml-1" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-full max-w-sm bg-charcoal-medium/95 backdrop-blur-md border border-charcoal-light rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[480px] animate-fade-in">
      {/* Widget Header */}
      <div className="flex items-center justify-between p-4 border-b border-charcoal-light bg-charcoal-dark/20">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-gold" />
          <span className="text-sm font-semibold text-foreground tracking-wide">Network Status</span>
        </div>
        <div className="flex items-center gap-2">
          {transactions.length > 0 && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 hover:bg-charcoal-light rounded text-foreground/50 hover:text-foreground transition-colors cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Widget Body */}
      <div className="p-4 overflow-y-auto flex-1 space-y-4">
        {/* Track Custom Transaction Form */}
        <form onSubmit={handleAddTx} className="space-y-2">
          <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider block">
            Track Bradbury Transaction
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x..."
              value={inputHash}
              onChange={(e) => setInputHash(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground placeholder-foreground/30 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              className="p-1.5 bg-charcoal-light hover:bg-charcoal-dark border border-charcoal-light rounded-xl text-foreground hover:text-brand-gold transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {error && <p className="text-[10px] text-brand-magenta">{error}</p>}
        </form>

        {/* Transaction Trackers List */}
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-charcoal-light rounded-xl space-y-3">
              <p className="text-xs text-foreground/40 leading-relaxed">No transactions tracked in this session.</p>
              <button
                onClick={handleTrackDemo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-charcoal-light hover:bg-charcoal-dark border border-charcoal-light rounded-lg text-xs font-semibold text-foreground transition-colors cursor-pointer"
              >
                Launch Demo Tracker
              </button>
            </div>
          ) : (
            transactions.map((tx) => {
              const isSubmitted = tx.status === 'submitted' || tx.status === 'accepted' || tx.status === 'finalized';
              const isAccepted = tx.status === 'accepted' || tx.status === 'finalized';
              const isFinalized = tx.status === 'finalized';

              return (
                <div key={tx.hash} className="bg-charcoal-dark/40 border border-charcoal-light rounded-xl p-3 space-y-3 relative group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold tracking-wide text-foreground/80">
                        {truncateHash(tx.hash)}
                      </span>
                      {!tx.isDemo && (
                        <a
                          href={`https://explorer-bradbury.genlayer.com/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground/40 hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-foreground/55 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatElapsed(tx.elapsedSeconds)}
                      </span>
                      <button
                        onClick={() => removeTransaction(tx.hash)}
                        className="p-1 text-foreground/30 hover:text-brand-magenta hover:bg-charcoal-light rounded transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* 3-State Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="relative flex items-center justify-between w-full px-2">
                      {/* Connecting Line */}
                      <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-charcoal-light z-0">
                        <div
                          className="h-full bg-brand-gold transition-all duration-500"
                          style={{
                            width: isFinalized ? '100%' : isAccepted ? '50%' : '0%',
                          }}
                        />
                      </div>

                      {/* Submitted Node */}
                      <div className="flex flex-col items-center z-10 relative">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-extrabold transition-all duration-300 ${
                            isSubmitted
                              ? 'bg-brand-gold border-brand-gold text-charcoal-dark shadow-lg shadow-brand-gold/20'
                              : 'bg-charcoal-medium border-charcoal-light text-foreground/30'
                          }`}
                        >
                          {isAccepted ? <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={4}><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg> : '1'}
                        </div>
                        <span className={`text-[9px] font-semibold mt-1 tracking-wider ${isSubmitted ? 'text-brand-gold' : 'text-foreground/35'}`}>
                          Submitted
                        </span>
                      </div>

                      {/* Accepted Node */}
                      <div className="flex flex-col items-center z-10 relative">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-extrabold transition-all duration-300 ${
                            isAccepted
                              ? 'bg-brand-gold border-brand-gold text-charcoal-dark shadow-lg shadow-brand-gold/20'
                              : 'bg-charcoal-medium border-charcoal-light text-foreground/30'
                          }`}
                        >
                          {isFinalized ? <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={4}><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg> : '2'}
                        </div>
                        <span className={`text-[9px] font-semibold mt-1 tracking-wider ${isAccepted ? 'text-brand-gold' : 'text-foreground/35'}`}>
                          Accepted
                        </span>
                      </div>

                      {/* Finalized Node */}
                      <div className="flex flex-col items-center z-10 relative">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-extrabold transition-all duration-300 ${
                            isFinalized
                              ? 'bg-brand-gold border-brand-gold text-charcoal-dark shadow-lg shadow-brand-gold/20'
                              : 'bg-charcoal-medium border-charcoal-light text-foreground/30'
                          }`}
                        >
                          3
                        </div>
                        <span className={`text-[9px] font-semibold mt-1 tracking-wider ${isFinalized ? 'text-brand-gold' : 'text-foreground/35'}`}>
                          Finalized
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Context Info (Reflecting 25 to 40 mins finality window) */}
                  <div className="bg-charcoal-medium/40 rounded-lg p-2 text-[10px] text-foreground/45 leading-relaxed flex items-start gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-gold" />
                    <div>
                      {tx.status === 'submitted' && 'Transaction is sent to consensus nodes. Awaiting block acceptance.'}
                      {tx.status === 'accepted' && 'Accepted on-chain. Finality on Bradbury takes 25 to 40 minutes.'}
                      {tx.status === 'finalized' && 'Transaction reached finality. Outcome immutable.'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
