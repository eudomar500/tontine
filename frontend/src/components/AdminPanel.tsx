'use client';

import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  Clock,
  Coins,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Pause,
  Play,
  Heart,
} from 'lucide-react';
import { useWalletStore } from '../store/wallet';
import { useAdminStore } from '../store/admin';
import { useContractWrite } from '../hooks/useContractWrite';
import { CONTRACT_ADDRESS, weiToGen, truncateAddress, hexToBytes } from '../services/contract';
import ConfirmModal from './ConfirmModal';
import AdminCountdown from './AdminCountdown';
import AdminInputField from './AdminInputField';
import { CalldataAddress } from 'genlayer-js/types';

export default function AdminPanel() {
  const connectedAddress = useWalletStore((state) => state.connectedAddress);
  const {
    adminState,
    killswitchStatus,
    accumulatedFees,
    creationFee,
    isLoading,
    error,
    loadAdminData,
  } = useAdminStore();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState<string>('');
  const [deadmanCountdownText, setDeadmanCountdownText] = useState<string>('');

  const [newCreationFee, setNewCreationFee] = useState<string>('');
  const [newFeeCollector, setNewFeeCollector] = useState<string>('');
  const [newAdmin, setNewAdmin] = useState<string>('');

  const [creationFeeError, setCreationFeeError] = useState<string | null>(null);
  const [feeCollectorError, setFeeCollectorError] = useState<string | null>(null);
  const [newAdminError, setNewAdminError] = useState<string | null>(null);

  const [currentTimestamp, setCurrentTimestamp] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimestamp(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const parseGenToWei = (genAmount: string): bigint => {
    const clean = genAmount.trim();
    if (!clean) return 0n;

    const parts = clean.split('.');
    const integerPart = parts[0] || '0';
    let fractionPart = parts[1] || '';
    fractionPart = fractionPart.slice(0, 18).padEnd(18, '0');

    const integerWei = BigInt(integerPart) * 1000000000000000000n;
    const fractionWei = BigInt(fractionPart);

    return integerWei + fractionWei;
  };

  // Poll configuration settings on interval to keep dashboard values synced.
  useEffect(() => {
    loadAdminData();
    const interval = setInterval(() => {
      loadAdminData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadAdminData]);

  // Formats difference in seconds to a human readable duration.
  const formatDiff = (diff: number) => {
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    const formatted = [];
    if (days > 0) formatted.push(`${days}d`);
    if (hours > 0 || days > 0) formatted.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) formatted.push(`${minutes}m`);
    formatted.push(`${seconds}s`);
    return formatted.join(' ');
  };

  // Computes the remaining time for the active killswitch window and dead-man switch.
  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);

      if (killswitchStatus?.active && killswitchStatus.window_ends_at) {
        const diff = killswitchStatus.window_ends_at - now;
        if (diff <= 0) {
          setCountdownText('Emergency window expired');
        } else {
          setCountdownText(formatDiff(diff));
        }
      } else {
        setCountdownText('');
      }

      if (killswitchStatus && !killswitchStatus.active && killswitchStatus.dead_man_triggers_at) {
        const diff = killswitchStatus.dead_man_triggers_at - now;
        if (diff <= 0) {
          setDeadmanCountdownText('Eligible for trigger');
        } else {
          setDeadmanCountdownText(formatDiff(diff));
        }
      } else {
        setDeadmanCountdownText('');
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [killswitchStatus]);

  const {
    write,
    status: writeStatus,
    txHash,
    error: writeError,
    reset: resetWrite,
  } = useContractWrite({
    onSuccess: () => {
      loadAdminData();
    },
  });

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<
    | 'pause'
    | 'heartbeat'
    | 'withdraw'
    | 'activate_killswitch'
    | 'deactivate_killswitch'
    | 'propose_creation_fee'
    | 'apply_creation_fee'
    | 'propose_fee_collector'
    | 'apply_fee_collector'
    | 'propose_admin'
    | 'accept_admin'
    | null
  >(null);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const formatDate = (unix: number) => {
    if (!unix || unix === 0) return 'None';
    return new Date(unix * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handlePauseToggleClick = () => {
    setActiveAction('pause');
    setIsConfirmOpen(true);
  };

  // Triggers the on-chain heartbeat transaction immediately without confirmation modal.
  const handleHeartbeatClick = async () => {
    try {
      await write({
        address: CONTRACT_ADDRESS,
        functionName: 'heartbeat',
      });
    } catch (err) {
      // Errors handled within contract write hook
    }
  };

  const handleWithdrawClick = () => {
    setActiveAction('withdraw');
    setIsConfirmOpen(true);
  };

  const handleActivateKillswitchClick = () => {
    setActiveAction('activate_killswitch');
    setIsConfirmOpen(true);
  };

  const handleDeactivateKillswitchClick = () => {
    setActiveAction('deactivate_killswitch');
    setIsConfirmOpen(true);
  };

  const handleProposeCreationFeeClick = () => {
    setCreationFeeError(null);
    const feeVal = parseFloat(newCreationFee);
    if (isNaN(feeVal) || feeVal < 0) {
      setCreationFeeError('Creation fee must be a non-negative number');
      return;
    }
    if (feeVal > 100) {
      setCreationFeeError('Creation fee cannot exceed the cap of 100 GEN');
      return;
    }
    setActiveAction('propose_creation_fee');
    setIsConfirmOpen(true);
  };

  const handleApplyCreationFeeClick = () => {
    setActiveAction('apply_creation_fee');
    setIsConfirmOpen(true);
  };

  const handleProposeFeeCollectorClick = () => {
    setFeeCollectorError(null);
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(newFeeCollector.trim())) {
      setFeeCollectorError('Must be a valid hex address');
      return;
    }
    setActiveAction('propose_fee_collector');
    setIsConfirmOpen(true);
  };

  const handleApplyFeeCollectorClick = () => {
    setActiveAction('apply_fee_collector');
    setIsConfirmOpen(true);
  };

  const handleProposeAdminClick = () => {
    setNewAdminError(null);
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(newAdmin.trim())) {
      setNewAdminError('Must be a valid hex address');
      return;
    }
    if (newAdmin.trim().toLowerCase() === adminState?.admin.toLowerCase()) {
      setNewAdminError('Proposed admin cannot be the current admin');
      return;
    }
    setActiveAction('propose_admin');
    setIsConfirmOpen(true);
  };

  const handleAcceptAdminClick = () => {
    setActiveAction('accept_admin');
    setIsConfirmOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!adminState) return;
    setIsConfirmOpen(false);
    try {
      if (activeAction === 'pause') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'set_pause',
          args: [!adminState.paused],
        });
      } else if (activeAction === 'withdraw') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'withdraw_fees',
        });
      } else if (activeAction === 'activate_killswitch') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'activate_killswitch',
        });
      } else if (activeAction === 'deactivate_killswitch') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'deactivate_killswitch',
        });
      } else if (activeAction === 'propose_creation_fee') {
        const feeWei = parseGenToWei(newCreationFee);
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'propose_creation_fee_change',
          args: [feeWei],
        });
        setNewCreationFee('');
      } else if (activeAction === 'apply_creation_fee') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'apply_creation_fee_change',
        });
      } else if (activeAction === 'propose_fee_collector') {
        const calldataAddr = new CalldataAddress(hexToBytes(newFeeCollector.trim()));
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'propose_fee_collector_change',
          args: [calldataAddr],
        });
        setNewFeeCollector('');
      } else if (activeAction === 'apply_fee_collector') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'apply_fee_collector_change',
        });
      } else if (activeAction === 'propose_admin') {
        const calldataAddr = new CalldataAddress(hexToBytes(newAdmin.trim()));
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'propose_admin_transfer',
          args: [calldataAddr],
        });
        setNewAdmin('');
      } else if (activeAction === 'accept_admin') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'accept_admin_transfer',
        });
      }
    } catch (err) {
      // Errors handled within contract write hook
    }
  };

  const getModalTitle = () => {
    switch (activeAction) {
      case 'pause':
        return 'Confirm Pause Status Change';
      case 'withdraw':
        return 'Confirm Accumulated Fees Withdrawal';
      case 'activate_killswitch':
        return 'Confirm Killswitch Activation';
      case 'deactivate_killswitch':
        return 'Confirm Killswitch Deactivation';
      case 'propose_creation_fee':
        return 'Confirm Propose Creation Fee Change';
      case 'apply_creation_fee':
        return 'Confirm Apply Creation Fee Change';
      case 'propose_fee_collector':
        return 'Confirm Propose Fee Collector Rotation';
      case 'apply_fee_collector':
        return 'Confirm Apply Fee Collector Rotation';
      case 'propose_admin':
        return 'Confirm Propose Admin Transfer';
      case 'accept_admin':
        return 'Confirm Accept Admin Transfer';
      default:
        return 'Confirm Action';
    }
  };

  const isAdmin =
    connectedAddress &&
    adminState &&
    adminState.admin.toLowerCase() === connectedAddress.toLowerCase();

  if (isLoading && !adminState) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
        <span className="text-sm text-foreground/50 font-light">Loading admin configuration...</span>
      </div>
    );
  }

  if (error && !adminState) {
    return (
      <div className="flex flex-col items-center text-center py-16 px-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl">
        <AlertCircle className="w-8 h-8 text-brand-magenta mb-3" />
        <h4 className="text-sm font-bold text-foreground mb-1">Failed to Load Admin State</h4>
        <p className="text-xs text-foreground/50 mb-4">{error}</p>
        <button
          onClick={loadAdminData}
          className="px-4 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-xs font-semibold text-foreground transition-all cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const isPendingAdminWallet =
    connectedAddress &&
    adminState &&
    adminState.pending_admin.toLowerCase() === connectedAddress.toLowerCase();

  const isAdminOrPending = isAdmin || isPendingAdminWallet;

  if (!isAdminOrPending) {
    return null;
  }

  const isPendingAdmin = adminState.pending_admin !== '0x0000000000000000000000000000000000000000';
  const isPendingFeeCollector = adminState.pending_fee_collector !== '0x0000000000000000000000000000000000000000';
  const isPendingCreationFee = adminState.pending_creation_fee !== '0';

  if (isPendingAdminWallet) {
    return (
      <div className="w-full max-w-xl mx-auto space-y-6">
        <div className="border-b border-charcoal-light/25 pb-4">
          <h1 className="text-2xl font-bold text-foreground">Pending Admin Dashboard</h1>
          <p className="text-xs text-foreground/50 mt-1 font-light">
            Accept ownership transfer to assume contract administration.
          </p>
        </div>

        <div className="bg-charcoal-medium/40 border border-charcoal-light/15 p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground/45 tracking-widest uppercase">
            <Clock className="w-4 h-4 text-brand-gold" />
            Admin Transfer Verification
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex justify-between py-2 border-b border-charcoal-light/10">
              <span className="text-foreground/50">Proposed Admin</span>
              <span className="font-mono text-foreground font-semibold">{truncateAddress(adminState.pending_admin)}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-charcoal-light/10">
              <span className="text-foreground/50">Transfer Expiration</span>
              <span className="font-medium text-brand-magenta">
                {formatDate(adminState.admin_transfer_deadline)}
              </span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-foreground/50">Time Remaining</span>
              <span className="font-medium text-brand-magenta">
                <AdminCountdown deadline={adminState.admin_transfer_deadline} isExpiration={true} />
              </span>
            </div>

            {writeStatus !== 'idle' ? (
              <div className="bg-charcoal-medium/30 border border-charcoal-light/35 rounded-2xl p-4.5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/45">
                    Operations Log
                  </span>
                  {writeStatus === 'signing' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Signing
                    </span>
                  )}
                  {writeStatus === 'pending' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full animate-pulse">
                      Submitting
                    </span>
                  )}
                  {writeStatus === 'accepted' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Accepted
                    </span>
                  )}
                  {writeStatus === 'finalized' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Finalized
                    </span>
                  )}
                  {writeStatus === 'error' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-magenta bg-brand-magenta/10 border border-brand-magenta/25 px-2.5 py-0.5 rounded-full">
                      Failed
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {writeStatus === 'signing' && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-brand-gold animate-spin shrink-0" />
                      <span className="text-xs text-foreground/80 font-medium">
                        Please sign the transaction in your wallet.
                      </span>
                    </div>
                  )}

                  {writeStatus === 'pending' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-brand-gold animate-spin shrink-0" />
                        <span className="text-xs text-foreground/80 font-medium">
                          Submitted on-chain. Awaiting block acceptance.
                        </span>
                      </div>
                      {txHash && (
                        <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2 py-1 rounded-lg">
                          <span className="truncate">{txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/45 hover:text-foreground transition-all ml-1 shrink-0"
                            title="View on Explorer"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {writeStatus === 'accepted' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-gold shrink-0" />
                        <span className="text-xs text-foreground/95 font-semibold">
                          Transaction accepted!
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground/50 leading-relaxed font-light">
                        Configuration changes will be fetched shortly. Finality takes 25 to 40 minutes.
                      </p>
                      {txHash && (
                        <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2 py-1 rounded-lg">
                          <span className="truncate">{txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/45 hover:text-foreground transition-all ml-1 shrink-0"
                            title="View on Explorer"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                      <button
                        onClick={resetWrite}
                        className="w-full py-1.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {writeStatus === 'finalized' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-gold shrink-0" />
                        <span className="text-xs text-foreground/95 font-semibold">
                          Transaction reached finality.
                        </span>
                      </div>
                      <button
                        onClick={resetWrite}
                        className="w-full py-1.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {writeStatus === 'error' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-brand-magenta shrink-0" />
                        <span className="text-xs text-foreground/90 font-semibold">
                          Transaction execution failed.
                        </span>
                      </div>
                      <p className="text-[10px] text-brand-magenta/80 leading-relaxed max-h-20 overflow-y-auto font-mono bg-brand-magenta/5 border border-brand-magenta/10 p-2 rounded-lg">
                        {writeError?.message || 'Transaction was rejected or reverted.'}
                      </p>
                      <button
                        onClick={resetWrite}
                        className="w-full py-1.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={currentTimestamp > adminState.admin_transfer_deadline}
                onClick={handleAcceptAdminClick}
                className="w-full py-3 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm flex items-center justify-center gap-2 mt-4"
              >
                Accept Admin Transfer
              </button>
            )}
          </div>
        </div>

        {isConfirmOpen && activeAction === 'accept_admin' && (
          <ConfirmModal
            isOpen={isConfirmOpen}
            onClose={() => setIsConfirmOpen(false)}
            onConfirm={handleConfirmAction}
            title={getModalTitle()}
          >
            <div>
              <p className="mb-3 text-brand-gold font-bold">ACCEPT SYSTEM OWNERSHIP</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Incoming Admin</span>
                  <span className="font-mono text-foreground truncate max-w-[240px]">
                    {adminState.pending_admin}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Status Impact</span>
                  <span className="font-semibold text-brand-gold">Assume full administrative controls</span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                By signing this transaction, you accept ownership of the contract. Your wallet will immediately assume full admin privileges, including pausing the contract and managing system parameters.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          </ConfirmModal>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-charcoal-light/25 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin Control Dashboard</h1>
          <p className="text-sm text-foreground/50 font-light mt-1">
            System status monitoring and safe operational overrides for Tontine.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Treasury & Fees Card */}
        <div className="bg-charcoal-medium/40 border border-charcoal-light/15 p-6 rounded-2xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/45 tracking-widest uppercase">
              <Coins className="w-4 h-4 text-brand-gold" />
              Treasury & Fees
            </div>

            <div className="space-y-4.5">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block mb-1">
                  Contract Admin
                </span>
                <div className="flex items-center justify-between text-xs font-mono text-foreground/75 bg-charcoal-dark/50 border border-charcoal-light/10 p-2.5 rounded-xl select-all">
                  <span className="truncate pr-4">{truncateAddress(adminState.admin)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(adminState.admin, 'admin')}
                      className="p-1 hover:bg-charcoal-light rounded text-foreground/60 hover:text-foreground transition-all cursor-pointer"
                      title="Copy Address"
                    >
                      {copiedKey === 'admin' ? (
                        <Check className="w-3.5 h-3.5 text-brand-gold" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={`https://explorer-bradbury.genlayer.com/address/${adminState.admin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-charcoal-light rounded text-foreground/60 hover:text-foreground transition-all"
                      title="View on Explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block mb-1">
                  Fee Collector
                </span>
                <div className="flex items-center justify-between text-xs font-mono text-foreground/75 bg-charcoal-dark/50 border border-charcoal-light/10 p-2.5 rounded-xl select-all">
                  <span className="truncate pr-4">{truncateAddress(adminState.fee_collector)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(adminState.fee_collector, 'collector')}
                      className="p-1 hover:bg-charcoal-light rounded text-foreground/60 hover:text-foreground transition-all cursor-pointer"
                      title="Copy Address"
                    >
                      {copiedKey === 'collector' ? (
                        <Check className="w-3.5 h-3.5 text-brand-gold" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={`https://explorer-bradbury.genlayer.com/address/${adminState.fee_collector}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-charcoal-light rounded text-foreground/60 hover:text-foreground transition-all"
                      title="View on Explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-charcoal-dark/30 border border-charcoal-light/10 p-3 rounded-xl">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-foreground/40 block mb-1">
                    Creation Fee
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {weiToGen(creationFee.toString())} GEN
                  </span>
                </div>

                <div className="bg-charcoal-dark/30 border border-charcoal-light/10 p-3 rounded-xl">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-foreground/40 block mb-1">
                    Accumulated Fees
                  </span>
                  <span className="text-sm font-bold text-brand-gold">
                    {weiToGen(accumulatedFees.toString())} GEN
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={accumulatedFees === 0n || writeStatus !== 'idle'}
                onClick={handleWithdrawClick}
                className="w-full py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light/35 text-foreground/80 hover:text-foreground disabled:opacity-40 disabled:hover:bg-charcoal-light disabled:cursor-not-allowed font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-xs flex items-center justify-center gap-2 mt-2"
              >
                <Coins className="w-3.5 h-3.5 text-brand-gold" />
                Withdraw Accumulated Fees
              </button>

              {connectedAddress && adminState && connectedAddress.toLowerCase() !== adminState.fee_collector.toLowerCase() && (
                <p className="text-[10px] text-brand-magenta/60 leading-snug mt-1 text-center">
                  Notice: Connected wallet is not the designated Fee Collector.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Timelocks & Deadlines Card */}
        <div className="bg-charcoal-medium/40 border border-charcoal-light/15 p-6 rounded-2xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/45 tracking-widest uppercase">
              <Clock className="w-4 h-4 text-brand-gold" />
              Timelocks & Deadlines
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between py-2 border-b border-charcoal-light/10">
                <span className="text-foreground/50">Last Heartbeat</span>
                <span className="font-medium text-foreground">{formatDate(adminState.last_admin_heartbeat)}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-charcoal-light/10">
                <span className="text-foreground/50">Dead-Man Activation</span>
                <span className="font-medium text-brand-magenta flex flex-col items-end">
                  <span>{killswitchStatus ? formatDate(killswitchStatus.dead_man_triggers_at) : 'None'}</span>
                  {killswitchStatus && !killswitchStatus.active && (
                    <span className="text-[10px] text-foreground/40 mt-0.5 font-mono">
                      in {deadmanCountdownText}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex flex-col py-2 border-b border-charcoal-light/10">
                <div className="flex justify-between items-center">
                  <span className="text-foreground/50">Pending Admin</span>
                  <span className="font-medium text-foreground text-right truncate max-w-[200px]">
                    {isPendingAdmin ? (
                      <span className="font-mono text-[10px]">{truncateAddress(adminState.pending_admin)}</span>
                    ) : (
                      'None'
                    )}
                  </span>
                </div>
                {isPendingAdmin && (
                  <div className="flex flex-col gap-2 mt-2 bg-charcoal-dark/30 border border-charcoal-light/10 p-2.5 rounded-xl">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-foreground/45">Expires in</span>
                      <AdminCountdown deadline={adminState.admin_transfer_deadline} isExpiration={true} />
                    </div>
                    {connectedAddress && adminState.pending_admin.toLowerCase() === connectedAddress.toLowerCase() ? (
                      <button
                        type="button"
                        disabled={currentTimestamp > adminState.admin_transfer_deadline || writeStatus !== 'idle'}
                        onClick={handleAcceptAdminClick}
                        className="w-full py-1.5 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                      >
                        Accept Admin Transfer
                      </button>
                    ) : (
                      <span className="text-[9px] text-brand-magenta/80 leading-snug font-medium italic text-center">
                        Awaiting signature from proposed admin address.
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col py-2 border-b border-charcoal-light/10">
                <div className="flex justify-between items-center">
                  <span className="text-foreground/50">Pending Collector</span>
                  <span className="font-medium text-foreground text-right truncate max-w-[200px]">
                    {isPendingFeeCollector ? (
                      <span className="font-mono text-[10px]">{truncateAddress(adminState.pending_fee_collector)}</span>
                    ) : (
                      'None'
                    )}
                  </span>
                </div>
                {isPendingFeeCollector && (
                  <div className="flex flex-col gap-2 mt-2 bg-charcoal-dark/30 border border-charcoal-light/10 p-2.5 rounded-xl">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-foreground/45">Unlocks in</span>
                      <AdminCountdown deadline={adminState.pending_fee_collector_deadline} />
                    </div>
                    <button
                      type="button"
                      disabled={currentTimestamp < adminState.pending_fee_collector_deadline || writeStatus !== 'idle'}
                      onClick={handleApplyFeeCollectorClick}
                      className="w-full py-1.5 bg-brand-gold disabled:opacity-40 disabled:hover:bg-brand-gold text-charcoal-dark text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                    >
                      Apply Collector Rotation
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col py-2">
                <div className="flex justify-between items-center">
                  <span className="text-foreground/50">Pending Creation Fee</span>
                  <span className="font-medium text-foreground text-right">
                    {isPendingCreationFee ? (
                      <span>{weiToGen(adminState.pending_creation_fee)} GEN</span>
                    ) : (
                      'None'
                    )}
                  </span>
                </div>
                {isPendingCreationFee && (
                  <div className="flex flex-col gap-2 mt-2 bg-charcoal-dark/30 border border-charcoal-light/10 p-2.5 rounded-xl">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-foreground/45">Unlocks in</span>
                      <AdminCountdown deadline={adminState.pending_creation_fee_deadline} />
                    </div>
                    <button
                      type="button"
                      disabled={currentTimestamp < adminState.pending_creation_fee_deadline || writeStatus !== 'idle'}
                      onClick={handleApplyCreationFeeClick}
                      className="w-full py-1.5 bg-brand-gold disabled:opacity-40 disabled:hover:bg-brand-gold text-charcoal-dark text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                    >
                      Apply Fee Change
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Operations Card */}
        <div className="bg-charcoal-medium/40 border border-charcoal-light/15 p-6 rounded-2xl flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/45 tracking-widest uppercase">
              <Activity className="w-4 h-4 text-brand-gold" />
              System Status & Controls
            </div>

            <div className="flex items-center justify-between p-3.5 bg-charcoal-dark/30 border border-charcoal-light/10 rounded-xl">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">
                  Contract Status
                </span>
                <span className="text-sm font-semibold mt-1 block">
                  {adminState.paused ? 'Contract Paused' : 'Contract Active'}
                </span>
              </div>
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  adminState.paused ? 'bg-brand-magenta animate-pulse' : 'bg-brand-gold'
                }`}
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-charcoal-dark/30 border border-charcoal-light/10 rounded-xl">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">
                  Killswitch Status
                </span>
                <span className="text-sm font-semibold mt-1 block">
                  {killswitchStatus?.active ? 'Killswitch Active' : 'Killswitch Inactive'}
                </span>
              </div>
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  killswitchStatus?.active ? 'bg-brand-magenta animate-pulse' : 'bg-brand-gold'
                }`}
              />
            </div>

            {killswitchStatus?.active && (
              <div className="bg-brand-magenta/5 border border-brand-magenta/15 rounded-xl p-3 text-xs">
                <span className="text-[10px] uppercase font-bold tracking-widest text-brand-magenta block mb-1">
                  Emergency Withdraw Window Ends In
                </span>
                <span className="font-mono font-bold text-foreground">
                  {countdownText}
                </span>
              </div>
            )}

            {writeStatus !== 'idle' ? (
              /* Administrative Write Tracking */
              <div className="bg-charcoal-medium/30 border border-charcoal-light/35 rounded-2xl p-4.5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/45">
                    Operations Log
                  </span>
                  {writeStatus === 'signing' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Signing
                    </span>
                  )}
                  {writeStatus === 'pending' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full animate-pulse">
                      Submitting
                    </span>
                  )}
                  {writeStatus === 'accepted' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Accepted
                    </span>
                  )}
                  {writeStatus === 'finalized' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold bg-brand-gold/10 border border-brand-gold/25 px-2.5 py-0.5 rounded-full">
                      Finalized
                    </span>
                  )}
                  {writeStatus === 'error' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-magenta bg-brand-magenta/10 border border-brand-magenta/25 px-2.5 py-0.5 rounded-full">
                      Failed
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {writeStatus === 'signing' && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-brand-gold animate-spin shrink-0" />
                      <span className="text-xs text-foreground/80 font-medium">
                        Please sign the transaction in your wallet.
                      </span>
                    </div>
                  )}

                  {writeStatus === 'pending' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-brand-gold animate-spin shrink-0" />
                        <span className="text-xs text-foreground/80 font-medium">
                          Submitted on-chain. Awaiting block acceptance.
                        </span>
                      </div>
                      {txHash && (
                        <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2 py-1 rounded-lg">
                          <span className="truncate">{txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/45 hover:text-foreground transition-all ml-1 shrink-0"
                            title="View on Explorer"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {writeStatus === 'accepted' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-gold shrink-0" />
                        <span className="text-xs text-foreground/95 font-semibold">
                          Transaction accepted!
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground/50 leading-relaxed font-light">
                        Configuration changes will be fetched shortly. Finality takes 25 to 40 minutes.
                      </p>
                      {txHash && (
                        <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2 py-1 rounded-lg">
                          <span className="truncate">{txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/45 hover:text-foreground transition-all ml-1 shrink-0"
                            title="View on Explorer"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                      <button
                        onClick={resetWrite}
                        className="w-full py-1.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {writeStatus === 'finalized' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-gold shrink-0" />
                        <span className="text-xs text-foreground/95 font-semibold">
                          Transaction reached finality.
                        </span>
                      </div>
                      <button
                        onClick={resetWrite}
                        className="w-full py-1.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {writeStatus === 'error' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-brand-magenta shrink-0" />
                        <span className="text-xs text-foreground/90 font-semibold">
                          Transaction execution failed.
                        </span>
                      </div>
                      <p className="text-[10px] text-brand-magenta/80 leading-relaxed max-h-20 overflow-y-auto font-mono bg-brand-magenta/5 border border-brand-magenta/10 p-2 rounded-lg">
                        {writeError?.message || 'Transaction was rejected or reverted.'}
                      </p>
                      <button
                        onClick={resetWrite}
                        className="w-full py-1.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Operational Action Buttons */
              <div className="space-y-3.5">
                <button
                  type="button"
                  onClick={handlePauseToggleClick}
                  className={`w-full py-3 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm flex items-center justify-center gap-2 ${
                    adminState.paused
                      ? 'bg-brand-gold hover:bg-brand-gold/90'
                      : 'bg-brand-magenta hover:bg-brand-magenta/90 text-foreground'
                  }`}
                >
                  {adminState.paused ? (
                    <>
                      <Play className="w-4 h-4" />
                      Unpause System
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause System
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleHeartbeatClick}
                  className="w-full py-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light/35 text-foreground/80 hover:text-foreground font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm flex items-center justify-center gap-2"
                >
                  <Heart className="w-4 h-4 text-brand-magenta shrink-0" />
                  Emit Admin Heartbeat
                </button>

                {!killswitchStatus?.active ? (
                  <button
                    type="button"
                    onClick={handleActivateKillswitchClick}
                    className="w-full py-3 bg-brand-magenta/10 hover:bg-brand-magenta/20 border border-brand-magenta/35 text-brand-magenta font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm flex items-center justify-center gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    Activate Killswitch
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!killswitchStatus.can_deactivate || writeStatus !== 'idle'}
                    onClick={handleDeactivateKillswitchClick}
                    className="w-full py-3 bg-brand-gold/10 hover:bg-brand-gold/20 border border-brand-gold/35 text-brand-gold disabled:opacity-40 disabled:hover:bg-brand-gold/10 disabled:cursor-not-allowed font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm flex items-center justify-center gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    Deactivate Killswitch
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Propose System Updates Card */}
      {isAdmin && (
        <div className="bg-charcoal-medium/40 border border-charcoal-light/15 p-6 rounded-2xl space-y-6">
          <div>
            <h2 className="text-xl font-bold text-foreground">Propose System Updates</h2>
            <p className="text-xs text-foreground/50 mt-1 font-light">
              Queue contract parameter adjustments and administrative handoffs under standard protocol timelocks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Propose Creation Fee Change */}
            <div className="space-y-4 flex flex-col justify-between bg-charcoal-dark/20 border border-charcoal-light/10 p-4 rounded-xl">
              <AdminInputField
                label="Propose Creation Fee"
                placeholder="e.g. 1.5 (in GEN)"
                value={newCreationFee}
                onChange={(val) => {
                  setNewCreationFee(val);
                  setCreationFeeError(null);
                }}
                error={creationFeeError}
                disabled={writeStatus !== 'idle'}
              />
              <button
                type="button"
                disabled={!newCreationFee.trim() || writeStatus !== 'idle'}
                onClick={handleProposeCreationFeeClick}
                className="w-full py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer mt-2"
              >
                Queue Fee Update
              </button>
            </div>

            {/* Propose Fee Collector Rotation */}
            <div className="space-y-4 flex flex-col justify-between bg-charcoal-dark/20 border border-charcoal-light/10 p-4 rounded-xl">
              <AdminInputField
                label="Propose Fee Collector"
                placeholder="e.g. 0x..."
                value={newFeeCollector}
                onChange={(val) => {
                  setNewFeeCollector(val);
                  setFeeCollectorError(null);
                }}
                error={feeCollectorError}
                disabled={writeStatus !== 'idle'}
              />
              <button
                type="button"
                disabled={!newFeeCollector.trim() || writeStatus !== 'idle'}
                onClick={handleProposeFeeCollectorClick}
                className="w-full py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer mt-2"
              >
                Queue Collector Rotation
              </button>
            </div>

            {/* Propose Admin Transfer */}
            <div className="space-y-4 flex flex-col justify-between bg-charcoal-dark/20 border border-charcoal-light/10 p-4 rounded-xl">
              <AdminInputField
                label="Propose Admin Transfer"
                placeholder="e.g. 0x..."
                value={newAdmin}
                onChange={(val) => {
                  setNewAdmin(val);
                  setNewAdminError(null);
                }}
                error={newAdminError}
                disabled={writeStatus !== 'idle'}
              />
              <button
                type="button"
                disabled={!newAdmin.trim() || writeStatus !== 'idle'}
                onClick={handleProposeAdminClick}
                className="w-full py-2.5 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer mt-2"
              >
                Initiate Admin Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {adminState && (
        <ConfirmModal
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={handleConfirmAction}
          title={getModalTitle()}
        >
          {activeAction === 'pause' && (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Target Action</span>
                  <span className="font-semibold text-foreground">
                    {adminState.paused ? 'Unpause System' : 'Pause System'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Status Impact</span>
                  <span
                    className={`font-semibold uppercase tracking-wider ${
                      adminState.paused ? 'text-brand-gold' : 'text-brand-magenta'
                    }`}
                  >
                    {adminState.paused ? 'Enable pool creations/joins' : 'Stop pool operations'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                {adminState.paused
                  ? 'This transaction resumes all pool creations, staking actions, and operations.'
                  : 'This transaction temporarily suspends all new pool creations, staking actions, and on-chain interactions.'}
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'withdraw' && (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Destination (Collector)</span>
                  <span className="font-mono text-foreground truncate max-w-[240px]">
                    {adminState.fee_collector}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Amount to Withdraw</span>
                  <span className="font-semibold text-brand-gold">
                    {weiToGen(accumulatedFees.toString())} GEN
                  </span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This transaction withdraws the accumulated fees from the contract and sends them directly to the fee collector address.
              </p>
              {connectedAddress && connectedAddress.toLowerCase() !== adminState.fee_collector.toLowerCase() && (
                <p className="text-xs text-brand-magenta font-semibold mb-3 leading-relaxed">
                  Warning: Your connected wallet is not the designated Fee Collector. This transaction will fail unless signed by the Fee Collector.
                </p>
              )}
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'activate_killswitch' && (
            <div>
              <p className="mb-3 text-brand-magenta font-bold">CRITICAL SAFETY ACTION ALERT</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-magenta font-mono">Activate Killswitch</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Initial Lock Duration</span>
                  <span className="font-semibold text-foreground">7 Days (KILLSWITCH_WINDOW)</span>
                </div>
              </div>
              <div className="space-y-3 text-xs text-foreground/75 leading-relaxed mb-4">
                <p>
                  Activating the killswitch is a severe administrative override designed to protect user assets.
                </p>
                <p>
                  1. It immediately pauses new pool creations, pool joins, and other normal contract operations.
                </p>
                <p>
                  2. It opens a 7-day emergency withdrawal window during which users can withdraw their staked assets from any open pools.
                </p>
                <p className="font-semibold text-brand-magenta">
                  3. This action is IRREVERSIBLE for the next 7 days. The killswitch cannot be deactivated, and normal operations cannot resume, until the window expires.
                </p>
              </div>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'deactivate_killswitch' && (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-gold font-mono">Deactivate Killswitch</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Status Impact</span>
                  <span className="font-semibold text-foreground">Restore normal contract controls</span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This transaction turns off the killswitch, enabling you to unpause normal operations.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'propose_creation_fee' && (
            <div>
              <p className="mb-3">Please review the proposed update below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Current Fee</span>
                  <span className="font-semibold text-foreground">
                    {weiToGen(creationFee.toString())} GEN
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Proposed Fee</span>
                  <span className="font-semibold text-brand-gold">
                    {newCreationFee} GEN
                  </span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This transaction queues a change to the pool creation fee. The proposal will be locked for a 48 hour timelock period before it can be applied to the contract.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'apply_creation_fee' && (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-gold font-mono">Apply Creation Fee Change</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">New Fee</span>
                  <span className="font-semibold text-foreground">
                    {adminState && weiToGen(adminState.pending_creation_fee)} GEN
                  </span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This transaction applies the pending creation fee change, updating the required fee for all future pool creations.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'propose_fee_collector' && (
            <div>
              <p className="mb-3">Please review the proposed update below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Current Collector</span>
                  <span className="font-mono text-foreground truncate max-w-[240px]">
                    {adminState.fee_collector}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Proposed Collector</span>
                  <span className="font-mono text-brand-gold truncate max-w-[240px]">
                    {newFeeCollector}
                  </span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This transaction queues a change to the fee collector address. The rotation will be locked for a 48 hour timelock period before it can be applied.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'apply_fee_collector' && (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-gold font-mono">Apply Fee Collector Rotation</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">New Collector</span>
                  <span className="font-mono text-foreground truncate max-w-[240px]">
                    {adminState.pending_fee_collector}
                  </span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This transaction completes the rotation, directing all future creation fee withdrawals to the new fee collector address.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'propose_admin' && (
            <div>
              <p className="mb-3 text-brand-magenta font-bold">CRITICAL ADMINISTRATIVE TRANSFER</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Current Admin</span>
                  <span className="font-mono text-foreground truncate max-w-[240px]">
                    {adminState.admin}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Proposed Admin</span>
                  <span className="font-mono text-brand-magenta truncate max-w-[240px]">
                    {newAdmin}
                  </span>
                </div>
              </div>
              <div className="space-y-3 text-xs text-foreground/75 leading-relaxed mb-4">
                <p>
                  Proposing an admin transfer begins the two-step handoff process.
                </p>
                <p>
                  1. The proposal creates a pending admin state that remains valid for 7 days (ADMIN_TRANSFER_WINDOW).
                </p>
                <p className="font-semibold text-brand-magenta">
                  2. To complete the transfer, the incoming admin address must connect to the admin dashboard and sign the acceptance transaction before the 7-day window expires.
                </p>
              </div>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}

          {activeAction === 'accept_admin' && (
            <div>
              <p className="mb-3 text-brand-gold font-bold">ACCEPT SYSTEM OWNERSHIP</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Incoming Admin</span>
                  <span className="font-mono text-foreground truncate max-w-[240px]">
                    {adminState.pending_admin}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Status Impact</span>
                  <span className="font-semibold text-brand-gold">Assume full administrative controls</span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                By signing this transaction, you accept ownership of the contract. Your wallet will immediately assume full admin privileges, including pausing the contract and managing system parameters.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}
