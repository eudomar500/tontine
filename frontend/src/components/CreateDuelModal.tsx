'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, ExternalLink, HelpCircle } from 'lucide-react';
import { useWalletStore } from '../store/wallet';
import { useTrackedContractWrite } from '../hooks/useTrackedContractWrite';
import ConfirmModal from './ConfirmModal';
import { getCreationFee, hexToBytes, CONTRACT_ADDRESS, weiToGen, getPoolCount } from '../services/contract';
import { CalldataAddress } from 'genlayer-js/types';
import { usePoolsStore } from '../store/pools';

/**
 * Converts GEN decimal string amount to BigInt in wei units.
 * Formatted to prevent precision errors when performing math operations.
 */
function genToWei(genAmount: string): bigint {
  const clean = genAmount.trim();
  if (!clean) return 0n;

  const parts = clean.split('.');
  const integerPart = parts[0] || '0';
  let fractionPart = parts[1] || '';

  fractionPart = fractionPart.slice(0, 18).padEnd(18, '0');

  const integerWei = BigInt(integerPart) * 1000000000000000000n;
  const fractionWei = BigInt(fractionPart);

  return integerWei + fractionWei;
}

interface CreateDuelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateDuelModal({ isOpen, onClose }: CreateDuelModalProps) {
  const connectedAddress = useWalletStore((state) => state.connectedAddress);
  const setWalletModalOpen = useWalletStore((state) => state.setModalOpen);
  const loadPools = usePoolsStore((state) => state.loadPools);

  const [creationFee, setCreationFee] = useState<bigint | null>(null);
  const [isFeeLoading, setIsFeeLoading] = useState<boolean>(true);

  // Simplified Duel Form State
  const [duelTitle, setDuelTitle] = useState<string>('');
  const [terms, setTerms] = useState<string>('');
  const [resolutionDate, setResolutionDate] = useState<string>('');
  const [opponentAddress, setOpponentAddress] = useState<string>('');
  const [yourOutcomeLabel, setYourOutcomeLabel] = useState<string>('');
  const [opponentOutcomeLabel, setOpponentOutcomeLabel] = useState<string>('');
  const [creatorStake, setCreatorStake] = useState<string>('');
  const [sources, setSources] = useState<string[]>(['', '']);
  const [isOpenDuel, setIsOpenDuel] = useState<boolean>(false);

  // Offsets set to 24h as standard baseline defaults
  const [joinOffsetType] = useState<string>('24h');
  const [resolutionOffsetType] = useState<string>('24h');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  const { write, status: writeStatus, txHash, error: writeError, reset: resetWrite } = useTrackedContractWrite({
    onSuccess: () => {
      loadPools();
    },
  });

  // Query live creation fee on mount/open
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    async function loadFee() {
      setIsFeeLoading(true);
      try {
        const fee = await getCreationFee();
        if (active) {
          setCreationFee(fee);
        }
      } catch (err) {
        console.error('Failed to load creation fee:', err);
      } finally {
        if (active) {
          setIsFeeLoading(false);
        }
      }
    }

    loadFee();
    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleReset = useCallback(() => {
    setDuelTitle('');
    setTerms('');
    setResolutionDate('');
    setOpponentAddress('');
    setYourOutcomeLabel('');
    setOpponentOutcomeLabel('');
    setCreatorStake('');
    setSources(['', '']);
    setIsOpenDuel(false);
    setValidationError(null);
    setIsConfirmOpen(false);
    resetWrite();
  }, [resetWrite]);

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const getJoinOffsetSeconds = (): number => 86400; // Fixed 24h join deadline offset
  const getResolutionGapSeconds = (): number => 86400; // Fixed 24h gap after join deadline

  const validateForm = (): boolean => {
    if (!connectedAddress) {
      setValidationError('Wallet must be connected');
      return false;
    }
    if (isFeeLoading || creationFee === null) {
      setValidationError('Creation fee not loaded');
      return false;
    }
    if (!duelTitle.trim()) {
      setValidationError('Duel title is required');
      return false;
    }
    if (duelTitle.trim().length > 50) {
      setValidationError('Duel title cannot exceed 50 characters');
      return false;
    }
    if (!terms.trim()) {
      setValidationError('Agreement terms are required');
      return false;
    }
    if (!resolutionDate.trim()) {
      setValidationError('Resolution date or reference is required');
      return false;
    }
    
    // Validate Opponent Wallet Address (only for directed duels)
    if (!isOpenDuel) {
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      const oppClean = opponentAddress.trim();
      if (!oppClean) {
        setValidationError('Opponent wallet address is required');
        return false;
      }
      if (!addressRegex.test(oppClean)) {
        setValidationError('Opponent address is not a valid hex address');
        return false;
      }
      if (oppClean.toLowerCase() === connectedAddress.toLowerCase()) {
        setValidationError('You cannot challenge your own connected address');
        return false;
      }
    }

    // Validate Head-to-Head Outcomes
    const lblYou = yourOutcomeLabel.trim();
    const lblOpp = opponentOutcomeLabel.trim();
    if (!lblYou) {
      setValidationError('Your outcome label is required');
      return false;
    }
    if (!lblOpp) {
      setValidationError('Opponent outcome label is required');
      return false;
    }
    if (lblYou.toLowerCase() === lblOpp.toLowerCase()) {
      setValidationError('Outcome labels must be distinct');
      return false;
    }

    // Validate Sources
    if (sources.length < 2 || sources.length > 5) {
      setValidationError('Between 2 and 5 resolution sources are required');
      return false;
    }
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]?.trim();
      if (!src) {
        setValidationError(`Verification source #${i + 1} cannot be empty`);
        return false;
      }
      if (!src.startsWith('https://')) {
        setValidationError(`Verification source #${i + 1} must start with https://`);
        return false;
      }
      for (let j = i + 1; j < sources.length; j++) {
        if (sources[j]?.trim().toLowerCase() === src.toLowerCase()) {
          setValidationError('Duplicate verification source URLs are not allowed');
          return false;
        }
      }
    }

    // Validate Stake
    const stakeVal = parseFloat(creatorStake);
    if (isNaN(stakeVal) || stakeVal < 0.01) {
      setValidationError('Minimum stake amount is 0.01 GEN');
      return false;
    }

    setValidationError(null);
    return true;
  };

  const handleCreateClick = () => {
    if (validateForm()) {
      setIsConfirmOpen(true);
    }
  };

  const handleConfirmCreate = async () => {
    if (!creationFee) return;
    setIsConfirmOpen(false);

    const joinOffset = getJoinOffsetSeconds();
    const resolutionOffset = joinOffset + getResolutionGapSeconds();

    const challenger = connectedAddress;
    if (!challenger) return;

    // Map outcomes and whitelist to enforce 1v1 duel structure
    const displayOutcomes = [yourOutcomeLabel.trim(), opponentOutcomeLabel.trim()];
    const whitelist = isOpenDuel ? [challenger] : [challenger, opponentAddress.trim()];
    const whitelistAsCalldataAddresses = whitelist.map((addr) => new CalldataAddress(hexToBytes(addr)));

    const creatorStakeWei = genToWei(creatorStake);
    const totalValueWei = creationFee + creatorStakeWei;

    const combinedTerms = `${terms.trim()} (Resolution reference: ${resolutionDate.trim()})`;
    const createNonce = Date.now().toString() + Math.random().toString(36).substring(2, 9);

    setIsSubmittingCreate(true);
    try {
      const preCount = Number(await getPoolCount());
      await write({
        address: CONTRACT_ADDRESS,
        // Duel is created via the same standard contract function
        functionName: 'create_pool',
        args: [
          combinedTerms,
          displayOutcomes,
          sources.map((s) => s.trim()),
          whitelistAsCalldataAddresses,
          BigInt(joinOffset),
          BigInt(resolutionOffset),
          0, // creator_outcome_index is fixed to 0 (Your Outcome)
          'Duel', // category is set to 'Duel' to group them cleanly
          'duel:' + duelTitle.trim(), // prefix name to identify it as a Duel
          isOpenDuel, // open/directed duel flag
        ],
        value: totalValueWei,
        trackAction: 'create_pool',
        trackTarget: createNonce,
        trackMetadata: { preCreateCount: preCount },
      });
    } catch (err) {
      // Handled inside useTrackedContractWrite
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          onClick={handleClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
        />

        <div className="relative w-full max-w-2xl bg-charcoal-medium border border-charcoal-light rounded-2xl shadow-2xl flex flex-col max-h-[90vh] z-10 animate-fade-in overflow-hidden">
          <div
            className="border-beam-container"
            style={{
              '--border-beam-width': '1.5px',
              '--border-beam-dark-opacity': '0.3',
              '--border-beam-light-opacity': '0.15',
            } as React.CSSProperties}
          />

          <div className="flex items-center justify-between p-5 border-b border-charcoal-light bg-charcoal-dark/20">
            <div>
              <h3 className="text-sm font-semibold text-brand-magenta tracking-wide uppercase font-display">
                Create 1v1 Duel
              </h3>
              <p className="text-[11px] text-foreground/45 mt-0.5 font-light">
                Challenge an opponent to a direct head-to-head prediction duel resolved by LLM consensus.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-charcoal-light rounded-lg text-foreground/60 hover:text-foreground transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto flex-1 space-y-6">
            {writeStatus !== 'idle' ? (
              <div className="bg-charcoal-medium/30 border border-charcoal-light/35 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase">
                    Transaction Tracking
                  </span>
                  {writeStatus === 'signing' && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Signing
                    </span>
                  )}
                  {writeStatus === 'pending' && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full animate-pulse">
                      Submitting
                    </span>
                  )}
                  {writeStatus === 'accepted' && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Accepted
                    </span>
                  )}
                  {writeStatus === 'finalized' && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Finalized
                    </span>
                  )}
                  {writeStatus === 'error' && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-magenta bg-brand-magenta/10 border border-brand-magenta/25 px-2.5 py-0.5 rounded-full">
                      Failed
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {writeStatus === 'signing' && (
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-brand-gold animate-spin shrink-0" />
                      <span className="text-sm font-medium text-foreground/80">
                        Awaiting signature in your wallet...
                      </span>
                    </div>
                  )}

                  {writeStatus === 'pending' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-brand-gold animate-spin shrink-0" />
                        <span className="text-sm font-medium text-foreground/80">
                          Transaction submitted. Awaiting block acceptance.
                        </span>
                      </div>
                      {txHash && (
                        <div className="text-[11px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2 py-1.5 rounded-lg select-all">
                          <span className="truncate">{txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {writeStatus === 'accepted' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-brand-gold shrink-0" />
                        <span className="text-sm font-semibold text-foreground/95">
                          Duel transaction accepted!
                        </span>
                      </div>
                      <p className="text-xs text-foreground/50 leading-relaxed font-light">
                        Your duel creation has been accepted by validator consensus. Bradbury finality takes 25 to 40 minutes. You can close this form now, and the duel will appear once finalized.
                      </p>
                      {txHash && (
                        <div className="text-[11px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2 py-1.5 rounded-lg select-all">
                          <span className="truncate">{txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                      <button
                        onClick={handleClose}
                        className="w-full py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Close Window
                      </button>
                    </div>
                  )}

                  {writeStatus === 'finalized' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-brand-gold shrink-0" />
                        <span className="text-sm font-semibold text-foreground/95">
                          Duel transaction finalized!
                        </span>
                      </div>
                      {txHash && (
                        <div className="text-[11px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2 py-1.5 rounded-lg select-all">
                          <span className="truncate">{txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                      <button
                        onClick={handleClose}
                        className="w-full py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Close Window
                      </button>
                    </div>
                  )}

                  {writeStatus === 'error' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-brand-magenta shrink-0" />
                        <span className="text-sm font-semibold text-foreground/90">
                          Transaction failed
                        </span>
                      </div>
                      <p className="text-xs text-brand-magenta/80 leading-relaxed max-h-24 overflow-y-auto font-mono bg-brand-magenta/5 border border-brand-magenta/10 p-2.5 rounded-lg select-text">
                        {writeError?.message || 'Transaction was rejected or reverted.'}
                      </p>
                      <button
                        onClick={resetWrite}
                        className="w-full py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {!connectedAddress ? (
                  <div className="p-4 bg-charcoal-medium/20 border border-charcoal-light/20 rounded-xl flex flex-col items-center text-center space-y-3">
                    <p className="text-xs text-foreground/60 leading-relaxed font-light">
                      Connect your wallet to configure and launch a prediction duel.
                    </p>
                    <button
                      onClick={() => setWalletModalOpen(true)}
                      className="px-4 py-2 bg-brand-magenta hover:bg-brand-magenta/90 text-foreground text-xs font-semibold rounded-xl transition-all cursor-pointer"
                    >
                      Connect Wallet
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Duel Title
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. SpaceX Flight 6 Launch, Chess Finals, etc."
                        value={duelTitle}
                        onChange={(e) => {
                          setDuelTitle(e.target.value);
                          setValidationError(null);
                        }}
                        className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Agreement Terms
                      </label>
                      <textarea
                        placeholder="Describe the exact duel condition that can be resolved by the LLM oracle..."
                        value={terms}
                        onChange={(e) => {
                          setTerms(e.target.value);
                          setValidationError(null);
                        }}
                        className="w-full h-24 px-3.5 py-3 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 leading-relaxed resize-none"
                        maxLength={2000}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Resolution Date or Moment
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. on launch completion, at end of June 2026, or on [date]"
                        value={resolutionDate}
                        onChange={(e) => {
                          setResolutionDate(e.target.value);
                          setValidationError(null);
                        }}
                        className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold"
                      />
                    </div>

                    <div className="flex items-center gap-2 px-4 py-3 bg-charcoal-dark/40 border border-charcoal-light/10 rounded-xl mb-4">
                      <input
                        type="checkbox"
                        id="isOpenDuel"
                        checked={isOpenDuel}
                        onChange={(e) => {
                          setIsOpenDuel(e.target.checked);
                          if (e.target.checked) {
                            setOpponentAddress('');
                          }
                          setValidationError(null);
                        }}
                        className="rounded border-charcoal-light bg-charcoal-dark text-brand-magenta focus:ring-brand-magenta focus:ring-opacity-25 cursor-pointer"
                      />
                      <label htmlFor="isOpenDuel" className="text-xs font-semibold text-foreground/80 cursor-pointer select-none">
                        Open duel: let any wallet challenge
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left Side: Creator */}
                      <div className="p-4 bg-charcoal-dark/40 border border-charcoal-light/10 rounded-2xl space-y-4">
                        <span className="text-[10px] uppercase font-extrabold tracking-widest text-brand-gold block">
                          Challenger (You)
                        </span>
                        <div className="text-xs text-foreground/50 truncate bg-charcoal-medium/30 p-2.5 border border-charcoal-light/10 rounded-xl">
                          {connectedAddress}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase font-bold tracking-widest text-foreground/40 block">
                            Your Outcome Choice
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Orbit achieved"
                            value={yourOutcomeLabel}
                            onChange={(e) => {
                              setYourOutcomeLabel(e.target.value);
                              setValidationError(null);
                            }}
                            className="w-full px-3 py-2 bg-charcoal-dark border border-charcoal-light/20 focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none placeholder-foreground/20"
                          />
                        </div>
                      </div>

                      {/* Right Side: Opponent */}
                      <div className="p-4 bg-charcoal-dark/40 border border-charcoal-light/10 rounded-2xl space-y-4">
                        <span className="text-[10px] uppercase font-extrabold tracking-widest text-brand-magenta block">
                          Challenged Opponent
                        </span>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase font-bold tracking-widest text-foreground/40 block">
                            Opponent Wallet Address
                          </label>
                          <input
                            type="text"
                            placeholder={isOpenDuel ? 'Any wallet can challenge' : '0x...'}
                            disabled={isOpenDuel}
                            value={isOpenDuel ? '' : opponentAddress}
                            onChange={(e) => {
                              setOpponentAddress(e.target.value);
                              setValidationError(null);
                            }}
                            className={`w-full px-3 py-2 bg-charcoal-dark border rounded-xl text-xs text-foreground focus:outline-none placeholder-foreground/20 ${isOpenDuel ? 'border-charcoal-light/10 opacity-50 cursor-not-allowed text-foreground/40' : 'border-charcoal-light/20 focus:border-foreground/15 text-foreground'}`}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase font-bold tracking-widest text-foreground/40 block">
                            Opponent Outcome Choice
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Orbital failure or abort"
                            value={opponentOutcomeLabel}
                            onChange={(e) => {
                              setOpponentOutcomeLabel(e.target.value);
                              setValidationError(null);
                            }}
                            className="w-full px-3 py-2 bg-charcoal-dark border border-charcoal-light/20 focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none placeholder-foreground/20"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Your Initial Stake (GEN)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          value={creatorStake}
                          onChange={(e) => {
                            setCreatorStake(e.target.value);
                            setValidationError(null);
                          }}
                          className="w-full px-4 py-3 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-sm text-foreground focus:outline-none pr-12 placeholder-foreground/20 font-semibold"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-foreground/40">
                          GEN
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-foreground/45">
                        <span>Minimum stake: 0.01 GEN</span>
                        {creationFee !== null && (
                          <span>Creation Fee: {weiToGen(creationFee.toString())} GEN</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Verification Sources
                      </label>
                      {sources.map((src, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="https://..."
                            value={src}
                            onChange={(e) => {
                              const updated = [...sources];
                              updated[index] = e.target.value;
                              setSources(updated);
                              setValidationError(null);
                            }}
                            className="flex-1 px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold"
                          />
                          {sources.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSources(sources.filter((_, idx) => idx !== index));
                                setValidationError(null);
                              }}
                              className="p-2.5 hover:bg-brand-magenta/10 border border-charcoal-light hover:border-brand-magenta/25 rounded-xl text-foreground/50 hover:text-brand-magenta transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {sources.length < 5 && (
                        <button
                          type="button"
                          onClick={() => setSources([...sources, ''])}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-foreground/70 hover:text-foreground bg-charcoal-dark border border-charcoal-light/30 rounded-xl hover:border-charcoal-light transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Verification Source
                        </button>
                      )}
                    </div>

                    {validationError && (
                      <p className="text-xs text-brand-magenta font-semibold">{validationError}</p>
                    )}

                    <button
                      type="button"
                      onClick={handleCreateClick}
                      className="w-full py-3 bg-brand-magenta hover:bg-brand-magenta/90 text-foreground font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                    >
                      Issue Challenge
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmCreate}
        title="Confirm Challenge Submission"
      >
        <div>
          <p className="mb-3">Please review the duel parameters before signing the transaction:</p>
          <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-foreground/45">Duel Title</span>
              <span className="font-semibold text-foreground">{duelTitle}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-foreground/45">Opponent Wallet</span>
              <span className="font-semibold text-brand-magenta font-mono">
                {isOpenDuel ? 'Open (Any Wallet)' : `${opponentAddress.slice(0, 6)}...${opponentAddress.slice(-4)}`}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-foreground/45">Initial Stake</span>
              <span className="font-bold text-foreground">{creatorStake} GEN</span>
            </div>
          </div>
          <p className="text-xs text-foreground/75 leading-relaxed font-light">
            {isOpenDuel
              ? 'Once submitted, your initial stake and the creation fee are sent to the contract. Any wallet can challenge you by staking on the opponent outcome.'
              : 'Once submitted, your initial stake and the creation fee are sent to the contract. The challenged player is whitelisted for the opponent outcome.'}
          </p>
        </div>
      </ConfirmModal>
    </>
  );
}
