'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, ExternalLink, HelpCircle } from 'lucide-react';
import { useWalletStore } from '../store/wallet';
import { useTrackedContractWrite } from '../hooks/useTrackedContractWrite';
import ConfirmModal from './ConfirmModal';
import { getCreationFee, hexToBytes, CONTRACT_ADDRESS, weiToGen, CATEGORIES, getPoolCount } from '../services/contract';
import { CalldataAddress } from 'genlayer-js/types';
import { usePoolsStore } from '../store/pools';

import { CURATED_PRESETS } from '../services/presets';

interface WeatherLocation {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

/**
 * Parses GEN decimal string amount and converts it to a BigInt representation in wei units.
 * Prevents precision errors with floating-point calculations.
 */
function genToWei(genAmount: string): bigint {
  const clean = genAmount.trim();
  if (!clean) return 0n;

  const parts = clean.split('.');
  const integerPart = parts[0] || '0';
  let fractionPart = parts[1] || '';

  // Pad/truncate fractional part to exactly 18 decimals
  fractionPart = fractionPart.slice(0, 18).padEnd(18, '0');

  const integerWei = BigInt(integerPart) * 1000000000000000000n;
  const fractionWei = BigInt(fractionPart);

  return integerWei + fractionWei;
}

interface CreatePoolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreatePoolModal({ isOpen, onClose }: CreatePoolModalProps) {
  const connectedAddress = useWalletStore((state) => state.connectedAddress);
  const setWalletModalOpen = useWalletStore((state) => state.setModalOpen);
  const loadPools = usePoolsStore((state) => state.loadPools);

  // Live creation fee state
  const [creationFee, setCreationFee] = useState<bigint | null>(null);
  const [isFeeLoading, setIsFeeLoading] = useState<boolean>(true);

  // Form states
  const [terms, setTerms] = useState<string>('');
  const [resolutionDate, setResolutionDate] = useState<string>('');
  const [isMultiOutcome, setIsMultiOutcome] = useState<boolean>(false);
  const [customOutcomes, setCustomOutcomes] = useState<string[]>(['', '']);
  const [sources, setSources] = useState<string[]>(['', '']);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [joinOffsetType, setJoinOffsetType] = useState<string>('24h');
  const [joinOffsetCustom, setJoinOffsetCustom] = useState<string>('');
  const [resolutionOffsetType, setResolutionOffsetType] = useState<string>('24h');
  const [resolutionOffsetCustom, setResolutionOffsetCustom] = useState<string>('');
  const [creatorOutcomeIndex, setCreatorOutcomeIndex] = useState<number>(0);
  const [creatorStake, setCreatorStake] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [roomName, setRoomName] = useState<string>('');

  // Weather source builder states
  const [weatherSearchQuery, setWeatherSearchQuery] = useState<string>('');
  const [weatherSearchResults, setWeatherSearchResults] = useState<WeatherLocation[]>([]);
  const [weatherSelectedCity, setWeatherSelectedCity] = useState<WeatherLocation | null>(null);
  const [weatherMetric, setWeatherMetric] = useState<string>('temperature_2m_max');
  const [weatherTempUnit, setWeatherTempUnit] = useState<'celsius' | 'fahrenheit'>('celsius');
  const [isSearchingWeather, setIsSearchingWeather] = useState<boolean>(false);
  const [weatherSearchError, setWeatherSearchError] = useState<string | null>(null);

  const handleAddPreset = (url: string) => {
    const cleanUrl = url.trim();
    const isDuplicate = sources.some((s) => s.trim().toLowerCase() === cleanUrl.toLowerCase());
    if (isDuplicate) {
      setValidationError('This source URL is already added to the list');
      return;
    }

    setValidationError(null);

    const emptyIndex = sources.findIndex((s) => !s.trim());
    if (emptyIndex !== -1) {
      setSources((prev) => {
        const updated = [...prev];
        updated[emptyIndex] = cleanUrl;
        return updated;
      });
    } else if (sources.length < 5) {
      setSources((prev) => [...prev, cleanUrl]);
    } else {
      setValidationError('Maximum of 5 verification sources allowed. Remove or edit an existing URL to add this preset.');
    }
  };

  const handleAddWeatherUrls = (urls: string[]) => {
    setValidationError(null);

    const uniqueNewUrls = urls.filter(
      (url) => !sources.some((s) => s.trim().toLowerCase() === url.trim().toLowerCase())
    );

    if (uniqueNewUrls.length === 0) {
      setValidationError('These weather source URLs are already added to the list.');
      return;
    }

    const currentFilledCount = sources.filter((s) => s.trim()).length;

    if (currentFilledCount + uniqueNewUrls.length > 5) {
      setValidationError(
        `Cannot add weather sources: adding ${uniqueNewUrls.length} new source URL(s) would exceed the maximum limit of 5 verification sources (currently using ${currentFilledCount}).`
      );
      return;
    }

    setSources((prev) => {
      const nextSources = [...prev];
      for (const url of uniqueNewUrls) {
        const emptyIndex = nextSources.findIndex((s) => !s.trim());
        if (emptyIndex !== -1) {
          nextSources[emptyIndex] = url;
        } else {
          nextSources.push(url);
        }
      }
      return nextSources;
    });
  };

  // UI state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);

  const displayOutcomes = isMultiOutcome
    ? [...customOutcomes.map((o) => o.trim()), 'Other / None of the above']
    : ['YES', 'NO'];

  // Keep creator index in bounds when outcomes change
  useEffect(() => {
    if (creatorOutcomeIndex >= displayOutcomes.length) {
      setCreatorOutcomeIndex(0);
    }
  }, [displayOutcomes.length, creatorOutcomeIndex]);

  // Fetch live fee on load/open
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

  // Keep whitelist's first element updated with connected address
  useEffect(() => {
    if (connectedAddress) {
      setWhitelist((prev) => {
        const updated = [...prev];
        updated[0] = connectedAddress;
        return updated;
      });
    } else {
      setWhitelist([]);
    }
  }, [connectedAddress]);

  // Fetch city coordinates from Open-Meteo search API with debounce
  useEffect(() => {
    const query = weatherSearchQuery.trim();
    if (query.length < 2) {
      setWeatherSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsSearchingWeather(true);
      setWeatherSearchError(null);
      try {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`
        );
        if (!response.ok) {
          throw new Error('Geocoding service returned an error');
        }
        const data = await response.json();
        setWeatherSearchResults(data.results || []);
      } catch (err) {
        setWeatherSearchError('Failed to search for cities');
      } finally {
        setIsSearchingWeather(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [weatherSearchQuery]);

  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  const { write, status: writeStatus, txHash, error: writeError, reset: resetWrite } = useTrackedContractWrite({
    onSuccess: () => {
      loadPools();
    },
  });

  // Reset local form state
  const handleReset = useCallback(() => {
    setTerms('');
    setResolutionDate('');
    setIsMultiOutcome(false);
    setCustomOutcomes(['', '']);
    setSources(['', '']);
    setWhitelist(connectedAddress ? [connectedAddress] : []);
    setJoinOffsetType('24h');
    setJoinOffsetCustom('');
    setResolutionOffsetType('24h');
    setResolutionOffsetCustom('');
    setCreatorOutcomeIndex(0);
    setCreatorStake('');
    setCategory('');
    setRoomName('');
    setWeatherSearchQuery('');
    setWeatherSearchResults([]);
    setWeatherSelectedCity(null);
    setWeatherMetric('temperature_2m_max');
    setWeatherTempUnit('celsius');
    setIsSearchingWeather(false);
    setWeatherSearchError(null);
    setValidationError(null);
    setValidationWarning(null);
    setIsConfirmOpen(false);
    resetWrite();
  }, [connectedAddress, resetWrite]);

  // Handle modal close
  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Convert offset types to seconds
  const getJoinOffsetSeconds = useCallback((): number => {
    switch (joinOffsetType) {
      case '1h':
        return 3600;
      case '6h':
        return 21600;
      case '24h':
        return 86400;
      case '48h':
        return 172800;
      case '7d':
        return 604800;
      case 'custom':
        const parsed = parseFloat(joinOffsetCustom);
        return isNaN(parsed) ? 0 : Math.floor(parsed * 3600);
      default:
        return 0;
    }
  }, [joinOffsetType, joinOffsetCustom]);

  const getResolutionGapSeconds = useCallback((): number => {
    switch (resolutionOffsetType) {
      case '1h':
        return 3600;
      case '6h':
        return 21600;
      case '24h':
        return 86400;
      case '7d':
        return 604800;
      case 'custom':
        const parsed = parseFloat(resolutionOffsetCustom);
        return isNaN(parsed) ? 0 : Math.floor(parsed * 3600);
      default:
        return 0;
    }
  }, [resolutionOffsetType, resolutionOffsetCustom]);

  // Live validation warning check
  useEffect(() => {
    if (!terms.trim() || !resolutionDate.trim()) {
      setValidationWarning(null);
      return;
    }

    // Check 1: Verifiable condition keywords (soft warning only, non-blocking)
    const lowerTerms = terms.toLowerCase();
    const keywords = [
      'will', 'close', 'above', 'below', 'price', 'reach', 'equal', 'win', 'lose',
      'happen', 'total', 'higher', 'lower', 'more', 'less', 'at least', 'before',
      'after', 'by', 'succeed', 'fail', 'team', 'match', 'score', 'market', 'cap'
    ];
    const hasKeyword = keywords.some((kw) => lowerTerms.includes(kw));
    const hasNumber = /\d+/.test(lowerTerms);

    if (!hasKeyword && !hasNumber) {
      setValidationWarning('Agreement terms may lack a clear, objective condition. Ensure the outcome is testable.');
      return;
    }

    // Check 2: Resolution date vs on-chain resolution window
    const parsedDate = Date.parse(resolutionDate);
    if (!isNaN(parsedDate)) {
      const joinSec = getJoinOffsetSeconds();
      const gapSec = getResolutionGapSeconds();
      // On-chain resolution becomes available at resolution_deadline = joinOffset + gapOffset from deployment
      const resolutionDeadlineMs = Date.now() + (joinSec + gapSec) * 1000;
      if (parsedDate > resolutionDeadlineMs) {
        setValidationWarning('Resolution date is after the on-chain resolution window starts. Users may request resolution before the target event occurs.');
        return;
      }
    }

    setValidationWarning(null);
  }, [terms, resolutionDate, getJoinOffsetSeconds, getResolutionGapSeconds]);

  // Field validation checks
  const validateForm = (): boolean => {
    if (!connectedAddress) {
      setValidationError('Wallet must be connected');
      return false;
    }
    if (isFeeLoading || creationFee === null) {
      setValidationError('Creation fee not loaded');
      return false;
    }
    if (!terms.trim()) {
      setValidationError('Agreement terms are required');
      return false;
    }
    if (!resolutionDate.trim()) {
      setValidationError('Resolution date or moment is required');
      return false;
    }
    const combinedTerms = `${terms.trim()} (Resolution reference: ${resolutionDate.trim()})`;
    if (combinedTerms.length > 2000) {
      setValidationError('Combined terms and resolution reference cannot exceed 2000 characters');
      return false;
    }

    // Outcomes validation
    if (isMultiOutcome) {
      if (customOutcomes.length < 2 || customOutcomes.length > 9) {
        setValidationError('Between 2 and 9 custom outcomes are required');
        return false;
      }
      for (let i = 0; i < customOutcomes.length; i++) {
        const lbl = customOutcomes[i]?.trim();
        if (!lbl) {
          setValidationError(`Outcome #${i + 1} label cannot be empty`);
          return false;
        }
        if (lbl.length > 500) {
          setValidationError(`Outcome #${i + 1} label cannot exceed 500 characters`);
          return false;
        }
        if (lbl.toLowerCase() === 'other / none of the above') {
          setValidationError(`Outcome label cannot conflict with the reserved other option`);
          return false;
        }
      }
    }

    for (let i = 0; i < displayOutcomes.length; i++) {
      const lbl = displayOutcomes[i];
      for (let j = i + 1; j < displayOutcomes.length; j++) {
        if (displayOutcomes[j].toLowerCase() === lbl.toLowerCase()) {
          setValidationError(`Duplicate outcome labels are not allowed: "${lbl}"`);
          return false;
        }
      }
    }

    // Sources validation
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
        setValidationError(`Verification source #${i + 1} must be a valid https URL`);
        return false;
      }
      for (let j = i + 1; j < sources.length; j++) {
        if (sources[j]?.trim().toLowerCase() === src.toLowerCase()) {
          setValidationError(`Duplicate verification source URLs are not allowed`);
          return false;
        }
      }
    }

    // Whitelist validation
    if (whitelist.length < 2 || whitelist.length > 100) {
      setValidationError('Whitelist must contain between 2 and 100 wallet addresses');
      return false;
    }
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    for (let i = 0; i < whitelist.length; i++) {
      const addr = whitelist[i]?.trim();
      if (!addr) {
        setValidationError(`Whitelist address #${i + 1} cannot be empty`);
        return false;
      }
      if (!addressRegex.test(addr)) {
        setValidationError(`Whitelist address #${i + 1} is not a valid hex address`);
        return false;
      }
      for (let j = i + 1; j < whitelist.length; j++) {
        if (whitelist[j]?.trim().toLowerCase() === addr.toLowerCase()) {
          setValidationError(`Duplicate address in whitelist`);
          return false;
        }
      }
    }

    // Deadline validation
    const joinSec = getJoinOffsetSeconds();
    if (joinSec < 3600) {
      setValidationError('Entries must close at least 1 hour in the future');
      return false;
    }
    const gapSec = getResolutionGapSeconds();
    if (gapSec < 3600) {
      setValidationError('Resolution gap must be at least 1 hour after entries close');
      return false;
    }

    // Stake validation
    const stakeVal = parseFloat(creatorStake);
    if (isNaN(stakeVal) || stakeVal < 0.01) {
      setValidationError('Minimum creator stake amount is 0.01 GEN');
      return false;
    }

    // Optional category length
    if (category.trim().length > 500) {
      setValidationError('Category label cannot exceed 500 characters');
      return false;
    }

    // Optional room name length validation
    if (roomName.trim().length > 64) {
      setValidationError('Room name cannot exceed 64 characters');
      return false;
    }
    // Prevent standard pools from using the reserved duel identifier
    if (roomName.trim().toLowerCase().startsWith('duel:')) {
      setValidationError('Room name cannot start with the reserved prefix "duel:"');
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
    const gapOffset = getResolutionGapSeconds();
    const resolutionOffset = joinOffset + gapOffset; // sum offset total

    // Wrap whitelist addresses into CalldataAddress
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
        functionName: 'create_pool',
        args: [
          combinedTerms,
          displayOutcomes.map((o) => o.trim()),
          sources.map((s) => s.trim()),
          whitelistAsCalldataAddresses,
          BigInt(joinOffset),
          BigInt(resolutionOffset),
          creatorOutcomeIndex,
          (category || 'Other').trim(),
          roomName.trim(),
        ],
        value: totalValueWei,
        trackAction: 'create_pool',
        trackTarget: createNonce,
        trackMetadata: { preCreateCount: preCount },
      });
    } catch (err) {
      // Handled inside useContractWrite
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  if (!isOpen) return null;

  const totalPayment = creationFee !== null
    ? weiToGen((creationFee + genToWei(creatorStake)).toString())
    : '0';

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          onClick={handleClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
        />

        {/* Modal Container */}
        <div className="relative w-full max-w-2xl bg-charcoal-medium border border-charcoal-light rounded-2xl shadow-2xl flex flex-col max-h-[90vh] z-10 animate-fade-in overflow-hidden">
          {/* Border Beam */}
          <div
            className="border-beam-container"
            style={{
              '--border-beam-width': '1.5px',
              '--border-beam-dark-opacity': '0.3',
              '--border-beam-light-opacity': '0.15',
            } as React.CSSProperties}
          />

          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-charcoal-light bg-charcoal-dark/20">
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-wide uppercase font-display">
                Create Prediction Event
              </h3>
              <p className="text-[11px] text-foreground/45 mt-0.5 font-light">
                Launch a private agreement event resolved by decentralized LLM consensus on GenLayer Bradbury.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-charcoal-light rounded-lg text-foreground/60 hover:text-foreground transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-5 overflow-y-auto flex-1 space-y-6">
            {writeStatus !== 'idle' ? (
              // Transaction Tracking UX Panel
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
                          Transaction accepted on-chain!
                        </span>
                      </div>
                      <p className="text-xs text-foreground/50 leading-relaxed font-light">
                        Your event creation transaction has been accepted by GenLayer validator consensus. Bradbury finality takes 25 to 40 minutes. You can close this form now, and the event will display once finalized.
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
                          Transaction reached finality!
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
              // Standard Form Input Fields
              <div className="space-y-5">
                {/* Connected Wallet Alert Check */}
                {!connectedAddress && (
                  <div className="p-4 bg-charcoal-medium/20 border border-charcoal-light/20 rounded-xl flex flex-col items-center text-center space-y-3">
                    <p className="text-xs text-foreground/60 leading-relaxed font-light">
                      Connect your wallet to configure and launch a prediction event.
                    </p>
                    <button
                      onClick={() => setWalletModalOpen(true)}
                      className="px-4 py-2 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-semibold rounded-xl transition-all cursor-pointer"
                    >
                      Connect Wallet
                    </button>
                  </div>
                )}

                {connectedAddress && (
                  <>
                    {/* Agreement Terms text area */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Agreement Terms
                      </label>
                      <div className="relative">
                        <textarea
                          placeholder="Describe the event, question, and the exact objective outcome conditions that can be verified by the LLM oracle..."
                          value={terms}
                          onChange={(e) => {
                            setTerms(e.target.value);
                            setValidationError(null);
                          }}
                          className="w-full h-24 px-3.5 py-3 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 leading-relaxed resize-none"
                          maxLength={2000}
                        />
                        <span className={`absolute right-3.5 bottom-2.5 text-[9px] font-mono ${terms.length > 1900 ? 'text-brand-magenta' : 'text-foreground/30'}`}>
                          {terms.length}/2000
                        </span>
                      </div>
                    </div>

                    {/* Resolution date or moment */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Resolution Date or Moment
                      </label>
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="e.g. 2026-12-31 23:59 UTC, end of June 2026, or on [date]"
                          value={resolutionDate}
                          onChange={(e) => {
                            setResolutionDate(e.target.value);
                            setValidationError(null);
                          }}
                          className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold"
                        />
                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              const today = new Date();
                              const year = today.getFullYear();
                              const month = String(today.getMonth() + 1).padStart(2, '0');
                              const day = String(today.getDate()).padStart(2, '0');
                              setResolutionDate(`${year}-${month}-${day} 23:59 UTC`);
                              setValidationError(null);
                            }}
                            className="px-2.5 py-1 bg-charcoal-dark hover:bg-charcoal-light border border-charcoal-light/50 rounded-lg text-[10px] font-semibold text-foreground/60 hover:text-foreground transition-all cursor-pointer"
                          >
                            End of Today
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const today = new Date();
                              const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                              const year = nextMonth.getFullYear();
                              const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
                              const day = String(nextMonth.getDate()).padStart(2, '0');
                              setResolutionDate(`${year}-${month}-${day} 23:59 UTC`);
                              setValidationError(null);
                            }}
                            className="px-2.5 py-1 bg-charcoal-dark hover:bg-charcoal-light border border-charcoal-light/50 rounded-lg text-[10px] font-semibold text-foreground/60 hover:text-foreground transition-all cursor-pointer"
                          >
                            End of Month
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const today = new Date();
                              const year = today.getFullYear();
                              setResolutionDate(`${year}-12-31 23:59 UTC`);
                              setValidationError(null);
                            }}
                            className="px-2.5 py-1 bg-charcoal-dark hover:bg-charcoal-light border border-charcoal-light/50 rounded-lg text-[10px] font-semibold text-foreground/60 hover:text-foreground transition-all cursor-pointer"
                          >
                            End of Year
                          </button>
                        </div>
                        <p className="text-[10px] text-foreground/40 font-light leading-relaxed">
                          The reference moment the question refers to. This is appended to the agreement terms so the LLM knows when to evaluate the condition.
                        </p>
                      </div>
                    </div>

                    {/* Multiple outcomes toggle */}
                    <div className="flex items-center justify-between p-3.5 bg-charcoal-dark/20 border border-charcoal-light/30 rounded-xl">
                      <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-semibold text-foreground">
                          Multiple outcomes (advanced)
                        </span>
                        <p className="text-[10px] text-foreground/45 font-light leading-snug">
                          Configure custom outcomes (e.g. specific candidates or teams) instead of binary YES/NO.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsMultiOutcome(!isMultiOutcome);
                          setCreatorOutcomeIndex(0);
                          setValidationError(null);
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isMultiOutcome ? 'bg-brand-gold' : 'bg-charcoal-medium'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-charcoal-dark shadow ring-0 transition duration-200 ease-in-out ${
                            isMultiOutcome ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Outcomes dynamic list */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45">
                          Outcomes Labels
                        </label>
                        <span className="text-[9px] text-foreground/40 font-light">
                          {isMultiOutcome ? '2 to 9 custom + Other' : 'Binary YES/NO'}
                        </span>
                      </div>

                      {!isMultiOutcome ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              disabled
                              value="YES"
                              className="w-full pl-3.5 pr-9 py-2.5 bg-charcoal-dark/20 border border-charcoal-light/30 rounded-xl text-xs text-foreground/40 focus:outline-none font-semibold cursor-not-allowed"
                            />
                          </div>
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              disabled
                              value="NO"
                              className="w-full pl-3.5 pr-9 py-2.5 bg-charcoal-dark/20 border border-charcoal-light/30 rounded-xl text-xs text-foreground/40 focus:outline-none font-semibold cursor-not-allowed"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {customOutcomes.map((label, idx) => (
                            <div key={idx} className="relative flex items-center">
                              <input
                                type="text"
                                placeholder={`Outcome Option #${idx + 1}`}
                                value={label}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomOutcomes((prev) => {
                                    const updated = [...prev];
                                    updated[idx] = val;
                                    return updated;
                                  });
                                  setValidationError(null);
                                }}
                                className="w-full pl-3.5 pr-9 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold"
                              />
                              {customOutcomes.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomOutcomes((prev) => prev.filter((_, i) => i !== idx));
                                    setValidationError(null);
                                  }}
                                  className="absolute right-2.5 p-1 hover:bg-charcoal-light/50 text-foreground/40 hover:text-brand-magenta transition-all rounded-md cursor-pointer"
                                  title="Remove option"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          
                          {/* Automatic Other outcome */}
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              disabled
                              value="Other / None of the above"
                              className="w-full pl-3.5 pr-9 py-2.5 bg-charcoal-dark/20 border border-charcoal-light/30 rounded-xl text-xs text-foreground/45 focus:outline-none font-semibold cursor-not-allowed italic"
                            />
                            <span className="absolute right-3.5 text-[9px] font-semibold text-foreground/40 uppercase tracking-wider select-none">
                              Automatic
                            </span>
                          </div>

                          {customOutcomes.length < 9 && (
                            <button
                              type="button"
                              onClick={() => {
                                setCustomOutcomes((prev) => [...prev, '']);
                                setValidationError(null);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-charcoal-dark hover:bg-charcoal-light border border-charcoal-light/50 rounded-lg text-[10px] font-semibold text-foreground/70 hover:text-foreground transition-all cursor-pointer mt-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Option
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Category Selection select dropdown */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Category (Optional)
                      </label>
                      <select
                        value={category}
                        onChange={(e) => {
                          setCategory(e.target.value);
                          setValidationError(null);
                        }}
                        className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors cursor-pointer"
                      >
                        <option value="" className="text-foreground/30 bg-charcoal-medium">Select a category...</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat} className="text-foreground bg-charcoal-medium">
                            {cat}
                          </option>
                        ))}
                        <option value="Other" className="text-foreground bg-charcoal-medium">Other</option>
                      </select>
                    </div>

                    {/* Room Name Input */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Room Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. UEFA Champions League Final 2026"
                        maxLength={64}
                        value={roomName}
                        onChange={(e) => {
                          setRoomName(e.target.value);
                          setValidationError(null);
                        }}
                        className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold"
                      />
                      <div className="flex justify-between items-center text-[10px] text-foreground/45">
                        <span>Max 64 characters</span>
                        <span>{roomName.length}/64</span>
                      </div>
                    </div>

                    {/* Curated Presets & Hints section */}
                    {category === 'Crypto' && (
                      <div className="bg-charcoal-dark/20 border border-charcoal-light/30 rounded-2xl p-4.5 space-y-3.5">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-brand-gold block">
                          Curated Crypto Sources
                        </span>
                        <div className="flex flex-wrap gap-2.5">
                          {CURATED_PRESETS.Crypto.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => handleAddPreset(preset.url)}
                              className="px-3.5 py-2 bg-charcoal-dark hover:bg-charcoal-light border border-charcoal-light/35 rounded-xl text-xs font-semibold text-foreground/85 hover:text-foreground transition-all cursor-pointer shadow-sm text-left truncate max-w-xs"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {category === 'Weather' && (
                      <div className="bg-charcoal-dark/20 border border-charcoal-light/30 rounded-2xl p-4.5 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-brand-gold">
                            Weather Source Builder
                          </span>
                          <span className="text-[9px] text-foreground/45">
                            Generates verified public APIs
                          </span>
                        </div>

                        {/* Weather Builder Fields */}
                        <div className="space-y-4">
                          {/* City Selection */}
                          <div className="space-y-1.5 relative">
                            <label className="text-[9px] uppercase font-bold tracking-wider text-foreground/45 block">
                              Location / City
                            </label>
                            
                            {!weatherSelectedCity ? (
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Search city (e.g. London, Tokyo...)"
                                  value={weatherSearchQuery}
                                  onChange={(e) => setWeatherSearchQuery(e.target.value)}
                                  className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold"
                                />
                                {isSearchingWeather && (
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Loader2 className="w-3.5 h-3.5 text-brand-gold animate-spin" />
                                  </div>
                                )}
                                
                                {/* Autocomplete results dropdown */}
                                {weatherSearchResults.length > 0 && (
                                  <div className="absolute left-0 right-0 top-full mt-1 bg-charcoal-medium border border-charcoal-light rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                                    {weatherSearchResults.map((loc, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                          setWeatherSelectedCity(loc);
                                          setWeatherSearchResults([]);
                                          setWeatherSearchQuery('');
                                        }}
                                        className="w-full text-left px-4 py-3 hover:bg-charcoal-light text-xs text-foreground/80 hover:text-foreground cursor-pointer transition-colors border-b border-charcoal-light/35 last:border-b-0 flex flex-col gap-0.5"
                                      >
                                        <span className="font-semibold text-foreground">
                                          {loc.name}
                                        </span>
                                        <span className="text-[10px] text-foreground/45">
                                          {loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between p-3.5 bg-charcoal-dark/40 border border-charcoal-light/50 rounded-xl">
                                <div className="space-y-0.5">
                                  <span className="text-xs font-semibold text-foreground">
                                    {weatherSelectedCity.name}
                                  </span>
                                  <p className="text-[10px] text-foreground/45 font-light leading-snug">
                                    {weatherSelectedCity.admin1 ? `${weatherSelectedCity.admin1}, ` : ''}
                                    {weatherSelectedCity.country}
                                  </p>
                                  <p className="text-[9px] text-foreground/30 font-mono">
                                    Lat: {weatherSelectedCity.latitude.toFixed(4)} / Lon: {weatherSelectedCity.longitude.toFixed(4)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setWeatherSelectedCity(null)}
                                  className="px-2.5 py-1 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light/60 rounded-lg text-[10px] font-semibold text-foreground/70 hover:text-foreground transition-all cursor-pointer"
                                >
                                  Change
                                </button>
                              </div>
                            )}

                            {weatherSearchError && (
                              <p className="text-[10px] text-brand-magenta mt-1">{weatherSearchError}</p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {/* Metric Selector */}
                            <div className="space-y-1.5">
                              <label className="text-[9px] uppercase font-bold tracking-wider text-foreground/45 block">
                                Weather Metric
                              </label>
                              <select
                                value={weatherMetric}
                                onChange={(e) => setWeatherMetric(e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light rounded-xl text-xs text-foreground/80 focus:outline-none transition-colors cursor-pointer"
                              >
                                <option value="temperature_2m_max">Daily Max Temperature (temperature_2m_max)</option>
                                <option value="temperature_2m_min">Daily Min Temperature (temperature_2m_min)</option>
                                <option value="precipitation_sum">Total Precipitation (precipitation_sum)</option>
                                <option value="windspeed_10m_max">Max Wind Speed (windspeed_10m_max)</option>
                              </select>
                            </div>

                            {/* Temperature Unit (displayed only when metric is a temperature) */}
                            {(weatherMetric === 'temperature_2m_max' || weatherMetric === 'temperature_2m_min') && (
                              <div className="space-y-1.5">
                                <label className="text-[9px] uppercase font-bold tracking-wider text-foreground/45 block">
                                  Temperature Unit
                                </label>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setWeatherTempUnit('celsius')}
                                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                      weatherTempUnit === 'celsius'
                                        ? 'bg-brand-gold text-charcoal-dark border-brand-gold'
                                        : 'bg-charcoal-dark/50 border-charcoal-light/30 text-foreground/60 hover:text-foreground'
                                    }`}
                                  >
                                    Celsius (°C)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setWeatherTempUnit('fahrenheit')}
                                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                      weatherTempUnit === 'fahrenheit'
                                        ? 'bg-brand-gold text-charcoal-dark border-brand-gold'
                                        : 'bg-charcoal-dark/50 border-charcoal-light/30 text-foreground/60 hover:text-foreground'
                                    }`}
                                  >
                                    Fahrenheit (°F)
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (!weatherSelectedCity) {
                                setValidationError('Please select a city first using the search box');
                                return;
                              }
                              const { latitude, longitude } = weatherSelectedCity;
                              const isTemp = weatherMetric === 'temperature_2m_max' || weatherMetric === 'temperature_2m_min';
                              const unitParam = isTemp ? `&temperature_unit=${weatherTempUnit}` : '';
                              
                              const urls = [
                                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=${weatherMetric}${unitParam}&timezone=auto&models=gfs_seamless`,
                                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=${weatherMetric}${unitParam}&timezone=auto&models=ecmwf_ifs025`,
                                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=${weatherMetric}${unitParam}&timezone=auto&models=icon_seamless`
                              ];
                              
                              handleAddWeatherUrls(urls);
                            }}
                            className="w-full py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer shadow-sm"
                          >
                            Add Generated Weather URLs
                          </button>
                        </div>
                      </div>
                    )}

                    {category !== '' && category !== 'Crypto' && category !== 'Weather' && (
                      <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-xl flex items-start gap-3 text-xs text-foreground/50 leading-relaxed font-light">
                        <HelpCircle className="w-4 h-4 text-foreground/45 shrink-0 mt-0.5" />
                        <span>
                          No presets are currently verified for this category. Please provide 2 to 5 distinct, public HTTPS URLs. Prefer machine-readable API endpoints (JSON/CSV) that can be read directly by the consensus oracle without relying on a full browser window.
                        </span>
                      </div>
                    )}

                    {/* Resolution Web Sources list */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45">
                          Verification Web Sources
                        </label>
                        <span className="text-[9px] text-foreground/40 font-light flex items-center gap-1">
                          <HelpCircle className="w-3 h-3" />
                          2 to 5 public HTTPS links
                        </span>
                      </div>
                      <div className="space-y-2">
                        {sources.map((url, idx) => (
                          <div key={idx} className="relative flex items-center">
                            <input
                              type="text"
                              placeholder="https://example.com/source"
                              value={url}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSources((prev) => {
                                  const updated = [...prev];
                                  updated[idx] = val;
                                  return updated;
                                });
                                setValidationError(null);
                              }}
                              className="w-full pl-3.5 pr-9 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20"
                            />
                            {sources.length > 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSources((prev) => prev.filter((_, i) => i !== idx));
                                  setValidationError(null);
                                }}
                                className="absolute right-2.5 p-1 hover:bg-charcoal-light/50 text-foreground/40 hover:text-brand-magenta transition-all rounded-md cursor-pointer"
                                title="Remove source"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {sources.length < 5 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSources((prev) => [...prev, '']);
                            setValidationError(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-charcoal-dark hover:bg-charcoal-light border border-charcoal-light/50 rounded-lg text-[10px] font-semibold text-foreground/70 hover:text-foreground transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add URL
                        </button>
                      )}
                    </div>

                    {/* Whitelist inputs list */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45">
                          Whitelist Participants
                        </label>
                        <span className="text-[9px] text-foreground/40 font-light">
                          Min 2 addresses (includes you)
                        </span>
                      </div>
                      <div className="space-y-2">
                        {whitelist.map((addr, idx) => {
                          const isCreator = idx === 0;
                          return (
                            <div key={idx} className="relative flex items-center">
                              <input
                                type="text"
                                disabled={isCreator}
                                placeholder="0x..."
                                value={addr}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setWhitelist((prev) => {
                                    const updated = [...prev];
                                    updated[idx] = val;
                                    return updated;
                                  });
                                  setValidationError(null);
                                }}
                                className={`w-full pl-3.5 pr-14 py-2.5 border focus:outline-none transition-colors rounded-xl text-xs font-mono ${
                                  isCreator
                                    ? 'bg-charcoal-dark/20 border-charcoal-light/30 text-foreground/45'
                                    : 'bg-charcoal-dark border-charcoal-light focus:border-foreground/15 text-foreground placeholder-foreground/20'
                                }`}
                              />
                              {isCreator ? (
                                <span className="absolute right-3.5 text-[9px] font-semibold text-brand-gold uppercase tracking-wider select-none">
                                  Creator
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setWhitelist((prev) => prev.filter((_, i) => i !== idx));
                                    setValidationError(null);
                                  }}
                                  className="absolute right-2.5 p-1 hover:bg-charcoal-light/50 text-foreground/40 hover:text-brand-magenta transition-all rounded-md cursor-pointer"
                                  title="Remove address"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {whitelist.length < 100 && (
                        <button
                          type="button"
                          onClick={() => {
                            setWhitelist((prev) => [...prev, '']);
                            setValidationError(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-charcoal-dark hover:bg-charcoal-light border border-charcoal-light/50 rounded-lg text-[10px] font-semibold text-foreground/70 hover:text-foreground transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Whitelist Address
                        </button>
                      )}
                    </div>

                    {/* Timeline Deadlines selection grid */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Join offset selection */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                          Entries Close In
                        </label>
                        <select
                          value={joinOffsetType}
                          onChange={(e) => {
                            setJoinOffsetType(e.target.value);
                            setValidationError(null);
                          }}
                          className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light rounded-xl text-xs text-foreground/80 focus:outline-none transition-colors cursor-pointer"
                        >
                          <option value="1h">1 Hour</option>
                          <option value="6h">6 Hours</option>
                          <option value="24h">24 Hours (1 Day)</option>
                          <option value="48h">48 Hours (2 Days)</option>
                          <option value="7d">7 Days (1 Week)</option>
                          <option value="custom">Custom Hours</option>
                        </select>
                        {joinOffsetType === 'custom' && (
                          <input
                            type="number"
                            step="1"
                            min="1"
                            placeholder="Hours (min 1)"
                            value={joinOffsetCustom}
                            onChange={(e) => {
                              setJoinOffsetCustom(e.target.value);
                              setValidationError(null);
                            }}
                            className="w-full px-3.5 py-2 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none mt-1.5"
                          />
                        )}
                      </div>

                      {/* Resolution gap offset selection */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                          Resolution Target
                        </label>
                        <select
                          value={resolutionOffsetType}
                          onChange={(e) => {
                            setResolutionOffsetType(e.target.value);
                            setValidationError(null);
                          }}
                          className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light rounded-xl text-xs text-foreground/80 focus:outline-none transition-colors cursor-pointer"
                        >
                          <option value="1h">1 Hour after close</option>
                          <option value="6h">6 Hours after close</option>
                          <option value="24h">24 Hours after close</option>
                          <option value="7d">7 Days after close</option>
                          <option value="custom">Custom Hours</option>
                        </select>
                        {resolutionOffsetType === 'custom' && (
                          <input
                            type="number"
                            step="1"
                            min="1"
                            placeholder="Hours (min 1)"
                            value={resolutionOffsetCustom}
                            onChange={(e) => {
                              setResolutionOffsetCustom(e.target.value);
                              setValidationError(null);
                            }}
                            className="w-full px-3.5 py-2 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none mt-1.5"
                          />
                        )}
                      </div>
                    </div>

                    {/* Initial Stake selection and breakdown */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Creator outcome selection */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                          Staking Option
                        </label>
                        <select
                          value={creatorOutcomeIndex}
                          onChange={(e) => {
                            setCreatorOutcomeIndex(parseInt(e.target.value));
                          }}
                          className="w-full px-3.5 py-2.5 bg-charcoal-dark border border-charcoal-light rounded-xl text-xs text-foreground/80 focus:outline-none transition-colors cursor-pointer"
                        >
                          {displayOutcomes.map((label: string, idx: number) => (
                            <option key={idx} value={idx}>
                              {label.trim() || `Outcome #${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Stake amount */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                          Your Stake Amount
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
                            className="w-full pl-3.5 pr-12 py-2.5 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none transition-colors placeholder-foreground/20 font-semibold"
                          />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-foreground/40">
                            GEN
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Cost Breakdown Summary Banner */}
                    <div className="bg-charcoal-dark/40 border border-charcoal-light rounded-2xl p-4.5 space-y-2">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                        Cost Breakdown Summary
                      </span>
                      <div className="space-y-2 text-xs font-light">
                        <div className="flex justify-between">
                          <span className="text-foreground/50">Creation Fee</span>
                          <span className="font-semibold text-foreground">
                            {isFeeLoading
                              ? 'Loading...'
                              : creationFee !== null
                              ? `${weiToGen(creationFee.toString())} GEN`
                              : '0 GEN'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-foreground/50">Your Initial Stake</span>
                          <span className="font-semibold text-foreground">
                            {creatorStake ? `${parseFloat(creatorStake).toFixed(4)} GEN` : '0.00 GEN'}
                          </span>
                        </div>
                        <div className="border-t border-charcoal-light/50 my-1.5 pt-1.5 flex justify-between font-semibold">
                          <span>Total Payment Required</span>
                          <span className="text-brand-gold font-bold">{totalPayment} GEN</span>
                        </div>
                      </div>
                    </div>


                  </>
                )}
              </div>
            )}
          </div>

          {/* Error notification display */}
          {validationError && (
            <div className="px-5 py-3.5 bg-brand-magenta/5 border-t border-b border-brand-magenta/15 flex items-start gap-2.5 text-xs text-brand-magenta font-semibold">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Warning notification display */}
          {validationWarning && !validationError && (
            <div className="px-5 py-3.5 bg-brand-gold/5 border-t border-b border-brand-gold/15 flex items-start gap-2.5 text-xs text-brand-gold font-semibold">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <span>{validationWarning}</span>
            </div>
          )}

          {/* Footer controls */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-charcoal-light bg-charcoal-dark/10">
            {writeStatus === 'idle' ? (
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-charcoal-light hover:bg-charcoal-light rounded-xl text-xs font-semibold text-foreground transition-all cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-xs font-semibold text-foreground transition-all cursor-pointer"
              >
                Close
              </button>
            )}
            {writeStatus === 'idle' && (
              <button
                onClick={handleCreateClick}
                disabled={!connectedAddress || isFeeLoading || creationFee === null}
                className="px-4 py-2 bg-brand-gold hover:bg-brand-gold/90 disabled:bg-charcoal-light disabled:text-foreground/20 disabled:border-charcoal-light text-charcoal-dark border border-brand-gold rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Create Event
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isOpen && isConfirmOpen && (
        <ConfirmModal
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={handleConfirmCreate}
          title="Confirm Agreement Event Creation"
        >
          <div className="space-y-4">
            <p className="text-xs text-foreground/70 font-light leading-relaxed">
              Please carefully review the prediction event parameters before signing the deployment transaction in your wallet:
            </p>
            <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-3">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/45 block">
                  Terms
                </span>
                <p className="text-xs text-foreground leading-normal font-mono font-medium max-h-24 overflow-y-auto whitespace-pre-wrap select-all">
                  {terms.trim()} (Resolution reference: {resolutionDate.trim()})
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-foreground/45 block mb-0.5">Your Selected Outcome</span>
                  <span className="font-semibold text-brand-gold">
                    {displayOutcomes[creatorOutcomeIndex]}
                  </span>
                </div>
                <div>
                  <span className="text-foreground/45 block mb-0.5">Total Payment</span>
                  <span className="font-bold text-foreground">
                    {totalPayment} GEN
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs border-t border-charcoal-light/30 pt-2.5">
                <div>
                  <span className="text-foreground/45 block mb-0.5">Entries Close Offset</span>
                  <span className="font-semibold text-foreground">
                    {(getJoinOffsetSeconds() / 3600).toFixed(1)} hours
                  </span>
                </div>
                <div>
                  <span className="text-foreground/45 block mb-0.5">Resolution Target Offset</span>
                  <span className="font-semibold text-foreground">
                    {((getJoinOffsetSeconds() + getResolutionGapSeconds()) / 3600).toFixed(1)} hours
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs border-t border-charcoal-light/30 pt-2.5">
                <div>
                  <span className="text-foreground/45 block mb-0.5">Verification Sources</span>
                  <span className="font-semibold text-foreground">
                    {sources.length} sources
                  </span>
                </div>
                <div>
                  <span className="text-foreground/45 block mb-0.5">Whitelist size</span>
                  <span className="font-semibold text-foreground">
                    {whitelist.length} addresses
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-foreground/45 italic leading-snug">
              Creating an event is final. Event parameters cannot be modified once submitted. Bradbury finality requires 25 to 40 minutes.
            </p>
          </div>
        </ConfirmModal>
      )}
    </>
  );
}
