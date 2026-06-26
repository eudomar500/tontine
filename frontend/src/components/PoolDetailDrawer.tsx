'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  ExternalLink,
  Clock,
  Users,
  Globe,
  User,
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { usePoolsStore, selectFilteredPools } from '../store/pools';
import { useWalletStore } from '../store/wallet';
import { useTrackedContractWrite } from '../hooks/useTrackedContractWrite';
import { usePendingWritesStore } from '../store/pendingWrites';
import { useTxStore } from '../store/transactions';
import ConfirmModal from './ConfirmModal';
import { getPool, Pool, weiToGen, stateLabel, truncateAddress, CONTRACT_ADDRESS, getStake, Stake, checkJoinPoolPredicate, getPoolSummary, cleanTerms, getResolutionReference } from '../services/contract';
import { useAdminStore } from '../store/admin';
import Avatar from 'boring-avatars';
import { useThemeStore } from '../store/theme';


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

export default function PoolDetailDrawer() {
  const selectedPoolId = usePoolsStore((state) => state.selectedPoolId);
  const setSelectedPoolId = usePoolsStore((state) => state.setSelectedPoolId);
  const loadPools = usePoolsStore((state) => state.loadPools);

  const transactions = useTxStore((state) => state.transactions);
  const removeTransaction = useTxStore((state) => state.removeTransaction);
  const addTransaction = useTxStore((state) => state.addTransaction);

  const [pool, setPool] = useState<Pool | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staking states
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState<number | null>(null);
  const [stakeAmount, setStakeAmount] = useState<string>('');
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [userStake, setUserStake] = useState<Stake | null>(null);
  const [creatorOutcomeIndex, setCreatorOutcomeIndex] = useState<number | null>(null);
  const [isStakeLoading, setIsStakeLoading] = useState<boolean>(false);
  const [isStakeChecked, setIsStakeChecked] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<'join' | 'increase' | 'resolve' | 'claim' | 'force_refund' | 'claim_refund' | 'cancel' | 'block_and_refund' | 'emergency_withdraw' | 'take_open_slot' | 'join_open_pool' | null>(null);

  const [isReconciled, setIsReconciled] = useState<boolean>(false);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);

  const [isClaimReconciled, setIsClaimReconciled] = useState<boolean>(false);
  const [isClaimReconciling, setIsClaimReconciling] = useState<boolean>(false);

  const [isClaimRefundReconciled, setIsClaimRefundReconciled] = useState<boolean>(false);
  const [isClaimRefundReconciling, setIsClaimRefundReconciling] = useState<boolean>(false);

  const [localMarker, setLocalMarker] = useState<{ txHash: string; timestamp: number } | null>(null);
  const pools = usePoolsStore((state) => state.pools);
  const selectedPoolSummary = selectedPoolId !== null ? pools.find((p) => p.pool_id === selectedPoolId) : undefined;
  const myPoolIds = usePoolsStore((state) => state.myPoolIds);
  const activeCategoryPools = usePoolsStore(selectFilteredPools);

  // Resolve duel status synchronously from cached summary, fallback to loaded pool details,
  // or return null if neither is available during initial cache-miss loading.
  const isDuelResolved = selectedPoolSummary
    ? (selectedPoolSummary.is_open_duel || !!(selectedPoolSummary.name && selectedPoolSummary.name.trim().toLowerCase().startsWith('duel:')))
    : pool
      ? (pool.is_open_duel || !!(pool.name && pool.name.trim().toLowerCase().startsWith('duel:')))
      : null;

  const isDuel = isDuelResolved === true;

  const getDisplayIndex = () => {
    if (selectedPoolId === null) return null;
    const targetList = isDuel
      ? activeCategoryPools.filter((p) => p.name && p.name.trim().toLowerCase().startsWith('duel:'))
      : activeCategoryPools.filter((p) => !p.name || !p.name.trim().toLowerCase().startsWith('duel:'));

    const idx = targetList.findIndex((p) => p.pool_id === selectedPoolId);
    if (idx !== -1) return idx + 1;

    const fallbackList = isDuel
      ? pools.filter((p) => p.name && p.name.trim().toLowerCase().startsWith('duel:'))
      : pools.filter((p) => !p.name || !p.name.trim().toLowerCase().startsWith('duel:'));

    const fallbackIdx = fallbackList.findIndex((p) => p.pool_id === selectedPoolId);
    if (fallbackIdx !== -1) return fallbackIdx + 1;

    return null;
  };
  const displayIndex = getDisplayIndex();

  const theme = useThemeStore((state) => state.theme);
  const isOpenPool = pool !== null ? pool.is_open : selectedPoolSummary?.is_open;
  const joinDeadline = pool !== null ? pool.join_deadline : selectedPoolSummary?.join_deadline;
  const isJoinWindowLive = joinDeadline ? Math.floor(Date.now() / 1000) < joinDeadline : false;



  const category = pool?.category || selectedPoolSummary?.category;
  const name = pool?.name || selectedPoolSummary?.name;
  const state = pool !== null ? pool.state : selectedPoolSummary?.state;

  // Lock join outcome index to opponent's side for duels
  useEffect(() => {
    if (isDuel && creatorOutcomeIndex !== null) {
      setSelectedOutcomeIndex(1 - creatorOutcomeIndex);
    }
  }, [isDuel, creatorOutcomeIndex]);
  const [forceRefundMarker, setForceRefundMarker] = useState<{ txHash: string; timestamp: number } | null>(null);
  const [claimRefundMarker, setClaimRefundMarker] = useState<{ txHash: string; timestamp: number } | null>(null);
  const [claimWinningsMarker, setClaimWinningsMarker] = useState<{ txHash: string; timestamp: number } | null>(null);

  const pendingTxFromStore = pool && localMarker
    ? transactions.find(
        (tx) =>
          tx.hash === localMarker.txHash &&
          tx.status !== 'finalized'
      )
    : undefined;

  const pendingResolutionTx = pendingTxFromStore || (localMarker ? { hash: localMarker.txHash } : undefined);

  // Find the resolution transaction to evaluate finalization status
  const resolutionTx = pool && localMarker
    ? transactions.find((tx) => tx.hash === localMarker.txHash)
    : undefined;

  const pendingForceRefundTxFromStore = pool
    ? transactions.find(
        (tx) =>
          tx.poolId === pool.pool_id &&
          tx.action === 'force_refund' &&
          tx.status !== 'finalized'
      )
    : undefined;

  const pendingForceRefundTx = pendingForceRefundTxFromStore || (forceRefundMarker ? { hash: forceRefundMarker.txHash } : undefined);

  const pendingClaimRefundTxFromStore = pool
    ? transactions.find(
        (tx) =>
          tx.poolId === pool.pool_id &&
          tx.action === 'claim_refund' &&
          tx.status !== 'finalized'
      )
    : undefined;

  const pendingClaimRefundTx = pendingClaimRefundTxFromStore || (claimRefundMarker ? { hash: claimRefundMarker.txHash } : undefined);

  // Find the claim refund transaction to evaluate finalization status
  const claimRefundTx = pool && claimRefundMarker
    ? transactions.find((tx) => tx.hash === claimRefundMarker.txHash)
    : undefined;

  const pendingClaimWinningsTxFromStore = pool
    ? transactions.find(
        (tx) =>
          tx.poolId === pool.pool_id &&
          tx.action === 'claim_winnings' &&
          tx.status !== 'finalized'
      )
    : undefined;

  const pendingClaimWinningsTx = pendingClaimWinningsTxFromStore || (claimWinningsMarker ? { hash: claimWinningsMarker.txHash } : undefined);

  // Find the claim winnings transaction to evaluate finalization status
  const claimWinningsTx = pool && claimWinningsMarker
    ? transactions.find((tx) => tx.hash === claimWinningsMarker.txHash)
    : undefined;

  const isClaimFailed =
    claimWinningsTx?.status === 'finalized' &&
    !userStake?.claimed &&
    isClaimReconciled &&
    !isClaimReconciling;

  const isClaimRefundFailed =
    claimRefundTx?.status === 'finalized' &&
    !userStake?.claimed &&
    isClaimRefundReconciled &&
    !isClaimRefundReconciling;

  // Wallet and custom write hook setup
  const connectedAddress = useWalletStore((state) => state.connectedAddress);
  const setWalletModalOpen = useWalletStore((state) => state.setModalOpen);

  const { adminState, killswitchStatus } = useAdminStore();
  const isAdmin =
    connectedAddress &&
    adminState &&
    adminState.admin.toLowerCase() === connectedAddress.toLowerCase();

  const isKillswitchActive = !!killswitchStatus?.active;
  const hasUnclaimedStake = !!(userStake && BigInt(userStake.amount) > 0n && !userStake.claimed);

  const fetchPoolDetail = useCallback(async (id: number, onComplete?: () => void) => {
    const isSilent = !!onComplete;
    if (!isSilent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const detail = await getPool(id);
      setPool(detail);
      // Fetch challenger's outcome choice for 1v1 duel structure
      if (detail.name && detail.name.trim().toLowerCase().startsWith('duel:')) {
        try {
          const stake = await getStake(id, detail.creator);
          if (stake) {
            setCreatorOutcomeIndex(stake.outcome_index);
          }
        } catch (err) {
          console.warn('Failed to retrieve challenger stake choice for duel:', err);
        }
      } else {
        setCreatorOutcomeIndex(null);
      }
      onComplete?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to retrieve pool details.');
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }, []);

  const fetchUserStake = useCallback(async (poolId: number, address: string | null) => {
    if (!address) {
      setUserStake(null);
      setIsStakeChecked(true);
      return;
    }
    setIsStakeLoading(true);
    try {
      const stake = await getStake(poolId, address);
      setUserStake(stake);
    } catch (err: any) {
      const errMsg = err?.message?.toLowerCase() || '';
      const errDetails = err?.details?.toLowerCase() || '';
      const errData = (err?.data || err?.cause?.data || '').toLowerCase();
      const errStr = JSON.stringify(err || '').toLowerCase();

      // Check for 'no stake' string or raw hex bytes representing it (0x6e6f207374616b65)
      // to handle RPC variations and raw VM result return data.
      const isNoStake =
        errMsg.includes('no stake') ||
        errDetails.includes('no stake') ||
        errMsg.includes('0x6e, 0x6f, 0x20, 0x73, 0x74, 0x61, 0x6b, 0x65') ||
        errDetails.includes('0x6e, 0x6f, 0x20, 0x73, 0x74, 0x61, 0x6b, 0x65') ||
        errData.includes('6e6f207374616b65') ||
        errStr.includes('no stake') ||
        errStr.includes('6e6f207374616b65') ||
        errStr.includes('0x6e, 0x6f, 0x20, 0x73, 0x74, 0x61, 0x6b, 0x65');

      setUserStake(null);
      if (!isNoStake) {
        console.error('Failed to fetch user stake details:', err);
      }
    } finally {
      setIsStakeLoading(false);
      setIsStakeChecked(true);
    }
  }, []);

  const [isSubmittingJoin, setIsSubmittingJoin] = useState<boolean>(false);
  const [isCheckingJoin, setIsCheckingJoin] = useState<boolean>(false);
  const [isCheckingIncrease, setIsCheckingIncrease] = useState<boolean>(false);
  const [isCheckingCancel, setIsCheckingCancel] = useState<boolean>(false);
  const [isCheckingBlockAndRefund, setIsCheckingBlockAndRefund] = useState<boolean>(false);
  const [isCheckingEmergencyWithdraw, setIsCheckingEmergencyWithdraw] = useState<boolean>(false);
  const [isDismissAcknowledged, setIsDismissAcknowledged] = useState<boolean>(false);
  const [showDismissAcknowledge, setShowDismissAcknowledge] = useState<boolean>(false);

  const pendingWrites = usePendingWritesStore((state) => state.entries);
  const pendingJoin = selectedPoolId && connectedAddress
    ? pendingWrites.find(
        (w) =>
          w.wallet === connectedAddress.toLowerCase() &&
          w.action === 'join_pool' &&
          w.target === String(selectedPoolId)
      )
    : undefined;

  const pendingIncrease = selectedPoolId && connectedAddress
    ? pendingWrites.find(
        (w) =>
          w.wallet === connectedAddress.toLowerCase() &&
          w.action === 'increase_stake' &&
          w.target === String(selectedPoolId)
      )
    : undefined;

  const pendingCancel = selectedPoolId && connectedAddress
    ? pendingWrites.find(
        (w) =>
          w.wallet === connectedAddress.toLowerCase() &&
          w.action === 'cancel_pool' &&
          w.target === String(selectedPoolId)
      )
    : undefined;

  const pendingBlockAndRefund = selectedPoolId && connectedAddress
    ? pendingWrites.find(
        (w) =>
          w.wallet === connectedAddress.toLowerCase() &&
          w.action === 'block_and_refund_pool' &&
          w.target === String(selectedPoolId)
      )
    : undefined;

  const pendingEmergencyWithdraw = selectedPoolId && connectedAddress
    ? pendingWrites.find(
        (w) =>
          w.wallet === connectedAddress.toLowerCase() &&
          w.action === 'emergency_withdraw' &&
          w.target === String(selectedPoolId)
      )
    : undefined;

  const { write, status: writeStatus, txHash, error: writeError, reset: resetWrite } = useTrackedContractWrite({
    onSuccess: () => {
      if (selectedPoolId) {
        fetchPoolDetail(selectedPoolId);
        fetchUserStake(selectedPoolId, connectedAddress);
      }
      loadPools();
    },
  });

  const prevPendingJoinRef = React.useRef(pendingJoin);
  useEffect(() => {
    if (prevPendingJoinRef.current && !pendingJoin && selectedPoolId) {
      // Synchronize drawer view when reconciler successfully clears the pending entry
      fetchUserStake(selectedPoolId, connectedAddress);
      fetchPoolDetail(selectedPoolId);
    }
    prevPendingJoinRef.current = pendingJoin;
  }, [pendingJoin, selectedPoolId, connectedAddress, fetchUserStake, fetchPoolDetail]);

  const prevPendingIncreaseRef = React.useRef(pendingIncrease);
  useEffect(() => {
    if (prevPendingIncreaseRef.current && !pendingIncrease && selectedPoolId) {
      fetchUserStake(selectedPoolId, connectedAddress);
      fetchPoolDetail(selectedPoolId);
    }
    prevPendingIncreaseRef.current = pendingIncrease;
  }, [pendingIncrease, selectedPoolId, connectedAddress, fetchUserStake, fetchPoolDetail]);

  const prevPendingCancelRef = React.useRef(pendingCancel);
  useEffect(() => {
    if (prevPendingCancelRef.current && !pendingCancel && selectedPoolId) {
      fetchUserStake(selectedPoolId, connectedAddress);
      fetchPoolDetail(selectedPoolId);
    }
    prevPendingCancelRef.current = pendingCancel;
  }, [pendingCancel, selectedPoolId, connectedAddress, fetchUserStake, fetchPoolDetail]);

  const prevPendingBlockAndRefundRef = React.useRef(pendingBlockAndRefund);
  useEffect(() => {
    // Refresh the drawer details once the background reconciler removes the pending administrative block.
    if (prevPendingBlockAndRefundRef.current && !pendingBlockAndRefund && selectedPoolId) {
      fetchUserStake(selectedPoolId, connectedAddress);
      fetchPoolDetail(selectedPoolId);
    }
    prevPendingBlockAndRefundRef.current = pendingBlockAndRefund;
  }, [pendingBlockAndRefund, selectedPoolId, connectedAddress, fetchUserStake, fetchPoolDetail]);

  const prevPendingEmergencyWithdrawRef = React.useRef(pendingEmergencyWithdraw);
  useEffect(() => {
    // Refresh the drawer details once the background reconciler removes the pending emergency withdrawal.
    if (prevPendingEmergencyWithdrawRef.current && !pendingEmergencyWithdraw && selectedPoolId) {
      fetchUserStake(selectedPoolId, connectedAddress);
      fetchPoolDetail(selectedPoolId);
    }
    prevPendingEmergencyWithdrawRef.current = pendingEmergencyWithdraw;
  }, [pendingEmergencyWithdraw, selectedPoolId, connectedAddress, fetchUserStake, fetchPoolDetail]);

  const handleCheckPendingJoinAgain = async () => {
    if (!pendingJoin || !selectedPoolId || !connectedAddress) return;
    setIsCheckingJoin(true);
    try {
      const isJoined = await checkJoinPoolPredicate(selectedPoolId, connectedAddress);
      if (isJoined) {
        usePendingWritesStore.getState().removePendingWrite(pendingJoin.key);
      } else {
        // Reset timestamp and status to resume reconciler background tracking
        usePendingWritesStore.getState().addPendingWrite(
          connectedAddress,
          pendingJoin.action,
          pendingJoin.target,
          pendingJoin.txHash,
          pendingJoin.metadata
        );
      }
    } catch (err) {
      console.error('Manual validation query failed:', err);
    } finally {
      setIsCheckingJoin(false);
    }
  };

  const handleCheckPendingIncreaseAgain = async () => {
    if (!pendingIncrease || !selectedPoolId || !connectedAddress) return;
    setIsCheckingIncrease(true);
    try {
      const stake = await getStake(selectedPoolId, connectedAddress);
      const preStakeAmount = BigInt(pendingIncrease.metadata?.preStakeAmount || '0');
      if (stake && BigInt(stake.amount) > preStakeAmount) {
        usePendingWritesStore.getState().removePendingWrite(pendingIncrease.key);
      } else {
        // Reset timestamp and status to resume reconciler background tracking
        usePendingWritesStore.getState().addPendingWrite(
          connectedAddress,
          pendingIncrease.action,
          pendingIncrease.target,
          pendingIncrease.txHash,
          pendingIncrease.metadata
        );
      }
    } catch (err: any) {
      const errMsg = err?.message?.toLowerCase() || '';
      const errDetails = err?.details?.toLowerCase() || '';
      const errData = (err?.data || err?.cause?.data || '').toLowerCase();
      const errStr = JSON.stringify(err || '').toLowerCase();
      const isNoStake =
        errMsg.includes('no stake') ||
        errDetails.includes('no stake') ||
        errData.includes('6e6f207374616b65') ||
        errStr.includes('no stake') ||
        errStr.includes('6e6f207374616b65');
      if (!isNoStake) {
        console.error('Manual validation query failed:', err);
      }
    } finally {
      setIsCheckingIncrease(false);
    }
  };

  const handleCheckPendingCancelAgain = async () => {
    if (!pendingCancel || !selectedPoolId || !connectedAddress) return;
    setIsCheckingCancel(true);
    try {
      const p = await getPoolSummary(selectedPoolId);
      if (p && p.state !== 0) {
        usePendingWritesStore.getState().removePendingWrite(pendingCancel.key);
      } else {
        // Reset timestamp and status to resume reconciler background tracking
        usePendingWritesStore.getState().addPendingWrite(
          connectedAddress,
          pendingCancel.action,
          pendingCancel.target,
          pendingCancel.txHash,
          pendingCancel.metadata
        );
      }
    } catch (err) {
      console.error('Manual validation query failed:', err);
    } finally {
      setIsCheckingCancel(false);
    }
  };

  const handleCheckPendingBlockAndRefundAgain = async () => {
    if (!pendingBlockAndRefund || !selectedPoolId || !connectedAddress) return;
    setIsCheckingBlockAndRefund(true);
    try {
      // Queries on-chain pool status to verify if block and refund has processed.
      const p = await getPoolSummary(selectedPoolId);
      if (p && p.state !== 0) {
        usePendingWritesStore.getState().removePendingWrite(pendingBlockAndRefund.key);
      } else {
        // Reset timestamp and status to resume background reconciler tracking
        usePendingWritesStore.getState().addPendingWrite(
          connectedAddress,
          pendingBlockAndRefund.action,
          pendingBlockAndRefund.target,
          pendingBlockAndRefund.txHash,
          pendingBlockAndRefund.metadata
        );
      }
    } catch (err) {
      console.error('Manual validation query failed:', err);
    } finally {
      setIsCheckingBlockAndRefund(false);
    }
  };

  const handleCheckPendingEmergencyWithdrawAgain = async () => {
    if (!pendingEmergencyWithdraw || !selectedPoolId || !connectedAddress) return;
    setIsCheckingEmergencyWithdraw(true);
    try {
      // Queries on-chain stake details to verify if emergency withdrawal has completed.
      const stake = await getStake(selectedPoolId, connectedAddress);
      if (stake && stake.claimed) {
        usePendingWritesStore.getState().removePendingWrite(pendingEmergencyWithdraw.key);
      } else {
        // Reset timestamp to resume background reconciler tracking
        usePendingWritesStore.getState().addPendingWrite(
          connectedAddress,
          pendingEmergencyWithdraw.action,
          pendingEmergencyWithdraw.target,
          pendingEmergencyWithdraw.txHash,
          pendingEmergencyWithdraw.metadata
        );
      }
    } catch (err: any) {
      const errMsg = err?.message?.toLowerCase() || '';
      const errDetails = err?.details?.toLowerCase() || '';
      const errData = (err?.data || err?.cause?.data || '').toLowerCase();
      const errStr = JSON.stringify(err || '').toLowerCase();
      
      const isNoStake =
        errMsg.includes('no stake') ||
        errDetails.includes('no stake') ||
        errData.includes('6e6f207374616b65') ||
        errStr.includes('no stake') ||
        errStr.includes('6e6f207374616b65');
        
      if (isNoStake) {
        usePendingWritesStore.getState().removePendingWrite(pendingEmergencyWithdraw.key);
      } else {
        console.error('Manual validation query failed:', err);
      }
    } finally {
      setIsCheckingEmergencyWithdraw(false);
    }
  };


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
    fetchPoolDetail(selectedPoolId);
  }, [selectedPoolId, fetchPoolDetail]);

  // Fetch user stake details dynamically upon selection or wallet changes
  useEffect(() => {
    setIsStakeChecked(false);
    if (!selectedPoolId) {
      setUserStake(null);
      setIsStakeChecked(true);
      return;
    }
    fetchUserStake(selectedPoolId, connectedAddress);
  }, [selectedPoolId, connectedAddress, fetchUserStake]);

  // Reset local state when selection changes
  useEffect(() => {
    setSelectedOutcomeIndex(null);
    setStakeAmount('');
    setIsConfirmOpen(false);
    setValidationError(null);
    resetWrite();
    setUserStake(null);
    setActiveAction(null);
    setIsReconciled(false);
    setIsReconciling(false);
    setIsClaimReconciled(false);
    setIsClaimReconciling(false);
    setIsClaimRefundReconciled(false);
    setIsClaimRefundReconciling(false);
  }, [selectedPoolId, resetWrite]);

  // Synchronize on-chain details once the current resolution transaction is finalized.
  // The reconciled flag prevents false failure flashes during the read latency window.
  useEffect(() => {
    if (resolutionTx?.status !== 'finalized') {
      setIsReconciled(false);
      setIsReconciling(false);
      return;
    }

    if (!isReconciled && !isReconciling) {
      setIsReconciling(true);
      if (selectedPoolId) {
        fetchPoolDetail(selectedPoolId, () => {
          setIsReconciled(true);
          setIsReconciling(false);
        });
      }
    }
  }, [resolutionTx?.status, isReconciled, isReconciling, selectedPoolId, fetchPoolDetail]);

  // Synchronize details once the claim winnings transaction is finalized on-chain.
  useEffect(() => {
    if (claimWinningsTx?.status !== 'finalized') {
      setIsClaimReconciled(false);
      setIsClaimReconciling(false);
      return;
    }

    if (!isClaimReconciled && !isClaimReconciling) {
      setIsClaimReconciling(true);
      if (selectedPoolId && connectedAddress) {
        fetchPoolDetail(selectedPoolId, () => {
          fetchUserStake(selectedPoolId, connectedAddress).then(() => {
            setIsClaimReconciled(true);
            setIsClaimReconciling(false);
          });
        });
      }
    }
  }, [claimWinningsTx?.status, isClaimReconciled, isClaimReconciling, selectedPoolId, connectedAddress, fetchPoolDetail, fetchUserStake]);

  // Synchronize details once the claim refund transaction is finalized on-chain.
  useEffect(() => {
    if (claimRefundTx?.status !== 'finalized') {
      setIsClaimRefundReconciled(false);
      setIsClaimRefundReconciling(false);
      return;
    }

    if (!isClaimRefundReconciled && !isClaimRefundReconciling) {
      setIsClaimRefundReconciling(true);
      if (selectedPoolId && connectedAddress) {
        fetchPoolDetail(selectedPoolId, () => {
          fetchUserStake(selectedPoolId, connectedAddress).then(() => {
            setIsClaimRefundReconciled(true);
            setIsClaimRefundReconciling(false);
          });
        });
      }
    }
  }, [claimRefundTx?.status, isClaimRefundReconciled, isClaimRefundReconciling, selectedPoolId, connectedAddress, fetchPoolDetail, fetchUserStake]);

  // Reactive polling while claim winnings or claim refund transactions are pending.
  // This ensures self-healing if wallet switching or page refreshes disrupt transaction tracking,
  // and terminates on success, tracked terminal failure, or TTL expiration.
  const poolRef = React.useRef(pool);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  useEffect(() => {
    if (!selectedPoolId || !connectedAddress || (!claimWinningsMarker && !claimRefundMarker)) {
      return;
    }

    const interval = setInterval(async () => {
      const now = Date.now();
      const fallbackExpiryMs = 60 * 60 * 1000; // 60 minutes
      const currentPool = poolRef.current;
      const expiryTimeMs = currentPool ? currentPool.timeout_deadline * 1000 : 0;

      // 1. Handle Claim Winnings Marker
      if (claimWinningsMarker) {
        const hasExpired = (expiryTimeMs > 0 && now > expiryTimeMs) || (now - claimWinningsMarker.timestamp) > fallbackExpiryMs;
        if (hasExpired) {
          const claimWinningsKey = `tontine:claimWinningsRequested:${selectedPoolId}:${connectedAddress.toLowerCase()}`;
          if (typeof window !== 'undefined') {
            localStorage.removeItem(claimWinningsKey);
          }
          setClaimWinningsMarker(null);
          return;
        }

        if (isClaimFailed) {
          return; // Stop requesting if transaction failed explicitly
        }

        await fetchUserStake(selectedPoolId, connectedAddress);
        await fetchPoolDetail(selectedPoolId);
      }

      // 2. Handle Claim Refund Marker
      if (claimRefundMarker) {
        const hasExpired = (expiryTimeMs > 0 && now > expiryTimeMs) || (now - claimRefundMarker.timestamp) > fallbackExpiryMs;
        if (hasExpired) {
          const claimRefundKey = `tontine:claimRefundRequested:${selectedPoolId}:${connectedAddress.toLowerCase()}`;
          if (typeof window !== 'undefined') {
            localStorage.removeItem(claimRefundKey);
          }
          setClaimRefundMarker(null);
          return;
        }

        if (isClaimRefundFailed) {
          return; // Stop requesting if transaction failed explicitly
        }

        await fetchUserStake(selectedPoolId, connectedAddress);
        await fetchPoolDetail(selectedPoolId);
      }
    }, 30000); // 30 seconds interval

    return () => clearInterval(interval);
  }, [
    selectedPoolId,
    connectedAddress,
    claimWinningsMarker,
    claimRefundMarker,
    isClaimFailed,
    isClaimRefundFailed,
    fetchUserStake,
    fetchPoolDetail,
  ]);

  // Sync localStorage markers on mount/pool/wallet change
  useEffect(() => {
    if (typeof window === 'undefined' || !pool) {
      setLocalMarker(null);
      setForceRefundMarker(null);
      setClaimRefundMarker(null);
      setClaimWinningsMarker(null);
      return;
    }

    const now = Date.now();
    const expiryTimeMs = pool.timeout_deadline * 1000;
    const fallbackExpiryMs = 60 * 60 * 1000; // 60 minutes

    // 1. Resolution Request marker
    const resKey = `tontine:resolutionRequested:${pool.pool_id}`;
    const resStored = localStorage.getItem(resKey);
    if (resStored) {
      try {
        const parsed = JSON.parse(resStored);
        if (now > expiryTimeMs || (now - parsed.timestamp) > fallbackExpiryMs) {
          localStorage.removeItem(resKey);
          setLocalMarker(null);
        } else {
          setLocalMarker(parsed);
        }
      } catch (e) {
        setLocalMarker(null);
      }
    } else {
      setLocalMarker(null);
    }

    // 2. Force Refund marker
    const forceKey = `tontine:forceRefundRequested:${pool.pool_id}`;
    const forceStored = localStorage.getItem(forceKey);
    if (forceStored) {
      try {
        const parsed = JSON.parse(forceStored);
        if (now > expiryTimeMs || (now - parsed.timestamp) > fallbackExpiryMs) {
          localStorage.removeItem(forceKey);
          setForceRefundMarker(null);
        } else {
          setForceRefundMarker(parsed);
        }
      } catch (e) {
        setForceRefundMarker(null);
      }
    } else {
      setForceRefundMarker(null);
    }

    // 3. Claim Refund marker
    if (connectedAddress) {
      const claimKey = `tontine:claimRefundRequested:${pool.pool_id}:${connectedAddress.toLowerCase()}`;
      const claimStored = localStorage.getItem(claimKey);
      if (claimStored) {
        try {
          const parsed = JSON.parse(claimStored);
          if (now > expiryTimeMs || (now - parsed.timestamp) > fallbackExpiryMs) {
            localStorage.removeItem(claimKey);
            setClaimRefundMarker(null);
          } else {
            setClaimRefundMarker(parsed);
          }
        } catch (e) {
          setClaimRefundMarker(null);
        }
      } else {
        setClaimRefundMarker(null);
      }
    } else {
      setClaimRefundMarker(null);
    }

    // 4. Claim Winnings marker
    if (connectedAddress) {
      const claimWinningsKey = `tontine:claimWinningsRequested:${pool.pool_id}:${connectedAddress.toLowerCase()}`;
      const claimWinningsStored = localStorage.getItem(claimWinningsKey);
      if (claimWinningsStored) {
        try {
          const parsed = JSON.parse(claimWinningsStored);
          if (now > expiryTimeMs || (now - parsed.timestamp) > fallbackExpiryMs) {
            localStorage.removeItem(claimWinningsKey);
            setClaimWinningsMarker(null);
          } else {
            setClaimWinningsMarker(parsed);
          }
        } catch (e) {
          setClaimWinningsMarker(null);
        }
      } else {
        setClaimWinningsMarker(null);
      }
    } else {
      setClaimWinningsMarker(null);
    }
  }, [pool, connectedAddress, transactions]);

  // Clear pending resolution/refund txs from store if pool has transitioned or action is completed
  useEffect(() => {
    if (!pool) return;

    if (pool.state === 1 || pool.state === 2) {
      // We must check if the stake check has completed. If isStakeChecked is false, the fetch has
      // not yet finished, meaning userStake is temporarily null. Clearing the tracker here would
      // create a race condition on page load/mount that prematurely deletes localMarkers.
      if (isStakeLoading || !isStakeChecked) return;

      const isWinner = userStake !== null && userStake.outcome_index === pool.winning_outcome_index;
      
      // Only clear the resolution marker on genuine completion from the connected wallet's
      // own perspective. For a winner, this is after they successfully claim their winnings.
      // We must never clear it merely because a loser or non-participant is viewing the settled pool.
      const shouldClear = pool.state === 2 && isWinner && userStake.claimed;

      if (shouldClear) {
        const pendingTx = transactions.find(
          (tx) => tx.poolId === pool.pool_id && tx.action === 'request_resolution'
        );
        if (pendingTx) {
          removeTransaction(pendingTx.hash);
        }
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`tontine:resolutionRequested:${pool.pool_id}`);
        }
        setLocalMarker(null);
      }
    }

    if (pool.state === 2 && userStake?.claimed) {
      const pendingClaim = transactions.find(
        (tx) => tx.poolId === pool.pool_id && tx.action === 'claim_winnings'
      );
      if (pendingClaim) {
        removeTransaction(pendingClaim.hash);
      }
      if (typeof window !== 'undefined' && connectedAddress) {
        localStorage.removeItem(`tontine:claimWinningsRequested:${pool.pool_id}:${connectedAddress.toLowerCase()}`);
      }
      setClaimWinningsMarker(null);
    }

    if (pool.state === 3) {
      const pendingForce = transactions.find(
        (tx) => tx.poolId === pool.pool_id && tx.action === 'force_refund'
      );
      if (pendingForce) {
        removeTransaction(pendingForce.hash);
      }
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`tontine:forceRefundRequested:${pool.pool_id}`);
        localStorage.removeItem(`tontine:resolutionRequested:${pool.pool_id}`);
      }
      setForceRefundMarker(null);
      setLocalMarker(null);
    }

    if (pool.state === 3 && userStake?.claimed) {
      const pendingClaim = transactions.find(
        (tx) => tx.poolId === pool.pool_id && tx.action === 'claim_refund'
      );
      if (pendingClaim) {
        removeTransaction(pendingClaim.hash);
      }
      if (typeof window !== 'undefined' && connectedAddress) {
        localStorage.removeItem(`tontine:claimRefundRequested:${pool.pool_id}:${connectedAddress.toLowerCase()}`);
      }
      setClaimRefundMarker(null);
    }
  }, [pool, transactions, removeTransaction, userStake, isStakeLoading, isStakeChecked, connectedAddress]);

  // Sync resolution tx from local storage back into the transaction store on page load / mount
  useEffect(() => {
    if (!pool) return;
    if (localMarker && !transactions.some((tx) => tx.hash === localMarker.txHash)) {
      addTransaction(localMarker.txHash, false, pool.pool_id, 'request_resolution');
    }
  }, [pool, localMarker, transactions, addTransaction]);

  // Sync claim refund tx from local storage back into the transaction store on page load / mount
  useEffect(() => {
    if (!pool) return;
    if (claimRefundMarker && !transactions.some((tx) => tx.hash === claimRefundMarker.txHash)) {
      addTransaction(claimRefundMarker.txHash, false, pool.pool_id, 'claim_refund');
    }
  }, [pool, claimRefundMarker, transactions, addTransaction]);

  // Sync claim winnings tx from local storage back into the transaction store on page load / mount
  useEffect(() => {
    if (!pool) return;
    if (claimWinningsMarker && !transactions.some((tx) => tx.hash === claimWinningsMarker.txHash)) {
      addTransaction(claimWinningsMarker.txHash, false, pool.pool_id, 'claim_winnings');
    }
  }, [pool, claimWinningsMarker, transactions, addTransaction]);

  // Automatically dismiss the local write state for resolution and refund actions once the transaction is broadcast.
  // This allows the UI to transition reactively to the dedicated pending/resolving pool views.
  useEffect(() => {
    if (writeStatus === 'pending' && (activeAction === 'resolve' || activeAction === 'force_refund' || activeAction === 'claim_refund' || activeAction === 'claim')) {
      resetWrite();
      setActiveAction(null);
    }
  }, [writeStatus, activeAction, resetWrite]);

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
  const proportions = pool
    ? totals.map((t) => {
        if (totalStake === 0n) return 100 / pool.outcomes.length;
        return Number((t * 10000n) / totalStake) / 100;
      })
    : [];

  const isResolved = pool && (pool.state === 2 || pool.winning_outcome_index !== 255);

  // Evaluation of on-chain requirements for join_pool writes
  const isWhitelisted = pool && connectedAddress
    ? pool.whitelist.some((addr) => addr.toLowerCase() === connectedAddress.toLowerCase())
    : false;

  const isOpen = pool ? pool.state === 0 : false;
  const isExpired = pool ? Math.floor(Date.now() / 1000) >= pool.join_deadline : false;
  const isResolutionReady = pool ? Math.floor(Date.now() / 1000) >= pool.resolution_deadline : false;
  const isTimeout = pool ? Math.floor(Date.now() / 1000) >= pool.timeout_deadline : false;

  const isCreator = pool && connectedAddress
    ? pool.creator.toLowerCase() === connectedAddress.toLowerCase()
    : false;

  const participantCount = pool
    ? pool.outcomes.reduce((acc, curr) => acc + Number(curr.participants_count), 0)
    : 0;

  const canCancel = isOpen && isCreator && participantCount === 1;

  // Reconcile finalized transaction status against the on-chain pool state to evaluate failure.
  const isResolutionFailed =
    resolutionTx?.status === 'finalized' &&
    isOpen &&
    isReconciled &&
    !isReconciling;

  // Resolve the joined state synchronously from the store cache if present.
  // If not cached, or if specific stake details are required but still loading on-chain,
  // return null to render a neutral loader rather than defaulting to the wrong state.
  const hasJoinedResolved = selectedPoolId !== null && connectedAddress
    ? myPoolIds.includes(selectedPoolId)
      ? userStake !== null
        ? true
        : null
      : isStakeChecked
        ? userStake !== null
        : null
    : false;

  const hasJoined = hasJoinedResolved === true;

  const isOpponentSideEmpty = creatorOutcomeIndex !== null && pool && 
    (BigInt(pool.outcomes[1 - creatorOutcomeIndex]?.total_staked || '0') === 0n);

  const isBeforeJoinDeadline = pool ? Math.floor(Date.now() / 1000) < pool.join_deadline : false;

  const isUserNotParticipant = connectedAddress && pool ? (
    connectedAddress.toLowerCase() !== pool.creator.toLowerCase() &&
    !hasJoined
  ) : true;

  const canTakeOpenSlot = !!(
    pool &&
    pool.is_open_duel &&
    isOpponentSideEmpty &&
    pool.state === 0 &&
    isBeforeJoinDeadline &&
    connectedAddress &&
    isUserNotParticipant
  );

  const canJoinOpen = !!(
    pool &&
    pool.is_open &&
    pool.state === 0 &&
    isBeforeJoinDeadline &&
    connectedAddress &&
    !hasJoined
  );

  // Estimate winnings payout: share = (stake * total_pool) / winning_pool
  const winningOutcome = pool && pool.winning_outcome_index !== 255 ? pool.outcomes[pool.winning_outcome_index] : null;
  let estimatedPayoutStr = '';
  if (pool && userStake && pool.state === 2 && pool.winning_outcome_index !== 255 && winningOutcome) {
    try {
      const stakeVal = BigInt(userStake.amount);
      const totalPoolVal = BigInt(pool.total_pool);
      const winningPoolVal = BigInt(winningOutcome.total_staked);
      if (winningPoolVal > 0n) {
        const payoutWei = (stakeVal * totalPoolVal) / winningPoolVal;
        estimatedPayoutStr = weiToGen(payoutWei.toString());
      }
    } catch (err) {
      // Ignore calculation errors
    }
  }

  // Gating must permit claiming when the resolution transaction is not tracked in the
  // client's local session, ensuring that returning winners can claim.
  const isFinalized = !resolutionTx || resolutionTx.status === 'finalized';

  // Compute finalization time estimate (ETA) based on transaction progress
  const getEtaText = () => {
    if (!resolutionTx && !localMarker) return null;
    const isDemo = resolutionTx?.isDemo;
    const totalDuration = isDemo ? 60 : 2400; // 60s for demo, 40 minutes (2400s) for real transaction finality
    
    // Anchor the elapsed calculation to the persisted broadcast timestamp if available.
    // This prevents the countdown from resetting when the in-memory transaction store is cleared on refresh.
    const elapsed = localMarker
      ? Math.floor((Date.now() - localMarker.timestamp) / 1000)
      : resolutionTx
      ? resolutionTx.elapsedSeconds
      : 0;

    const remaining = totalDuration - elapsed;
    if (remaining <= 0) {
      return 'Finalizing shortly';
    }
    const mins = Math.ceil(remaining / 60);
    return `~${mins} min${mins > 1 ? 's' : ''} remaining`;
  };

  const etaText = getEtaText();

  const handleJoinClick = () => {
    if (isDuel && creatorOutcomeIndex === null) {
      setValidationError('Outcome data is still loading');
      return;
    }
    if (selectedOutcomeIndex === null || isNaN(selectedOutcomeIndex)) {
      setValidationError('Please select an outcome');
      return;
    }
    const val = parseFloat(stakeAmount);
    if (isNaN(val) || val < 0.01) {
      setValidationError('Minimum stake amount is 0.01 GEN');
      return;
    }
    setValidationError(null);
    setActiveAction(canTakeOpenSlot ? 'take_open_slot' : canJoinOpen ? 'join_open_pool' : 'join');
    setIsConfirmOpen(true);
  };

  const handleIncreaseClick = () => {
    const val = parseFloat(stakeAmount);
    if (isNaN(val) || val < 0.01) {
      setValidationError('Minimum stake amount is 0.01 GEN');
      return;
    }
    setValidationError(null);
    setActiveAction('increase');
    setIsConfirmOpen(true);
  };

  const handleResolveClick = () => {
    setValidationError(null);
    setActiveAction('resolve');
    setIsConfirmOpen(true);
  };

  const handleClaimClick = () => {
    setValidationError(null);
    setActiveAction('claim');
    setIsConfirmOpen(true);
  };

  const handleForceRefundClick = () => {
    setValidationError(null);
    setActiveAction('force_refund');
    setIsConfirmOpen(true);
  };

  const handleClaimRefundClick = () => {
    setValidationError(null);
    setActiveAction('claim_refund');
    setIsConfirmOpen(true);
  };

  const handleCancelClick = () => {
    setValidationError(null);
    setActiveAction('cancel');
    setIsConfirmOpen(true);
  };

  const handleBlockAndRefundClick = () => {
    setValidationError(null);
    setActiveAction('block_and_refund');
    setIsConfirmOpen(true);
  };

  const handleEmergencyWithdrawClick = () => {
    setValidationError(null);
    setActiveAction('emergency_withdraw');
    setIsConfirmOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!pool) return;
    setIsConfirmOpen(false);

    // Double-check NaN-guard on stake amount before submitting write transaction
    if (activeAction === 'join' || activeAction === 'increase' || activeAction === 'take_open_slot' || activeAction === 'join_open_pool') {
      const val = parseFloat(stakeAmount);
      if (isNaN(val) || val < 0.01) {
        setValidationError('Minimum stake amount is 0.01 GEN');
        return;
      }
    }

    try {
      if (activeAction === 'increase') {
        let freshAmount = '0';
        if (connectedAddress) {
          try {
            const stake = await getStake(pool.pool_id, connectedAddress);
            if (stake) {
              freshAmount = stake.amount;
            }
          } catch (err: any) {
            const errMsg = err?.message?.toLowerCase() || '';
            const errDetails = err?.details?.toLowerCase() || '';
            const errData = (err?.data || err?.cause?.data || '').toLowerCase();
            const errStr = JSON.stringify(err || '').toLowerCase();
            
            // Replicate no-stake validation to handle raw contract revert states
            const isNoStake =
              errMsg.includes('no stake') ||
              errDetails.includes('no stake') ||
              errData.includes('6e6f207374616b65') ||
              errStr.includes('no stake') ||
              errStr.includes('6e6f207374616b65');
            
            if (!isNoStake) {
              throw err;
            }
          }
        }
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'increase_stake',
          args: [BigInt(pool.pool_id)],
          value: genToWei(stakeAmount),
          trackAction: 'increase_stake',
          trackTarget: String(pool.pool_id),
          trackMetadata: { preStakeAmount: freshAmount },
        });
      } else if (activeAction === 'join') {
        if (selectedOutcomeIndex === null) return;
        setIsSubmittingJoin(true);
        try {
          await write({
            address: CONTRACT_ADDRESS,
            functionName: 'join_pool',
            args: [BigInt(pool.pool_id), selectedOutcomeIndex],
            value: genToWei(stakeAmount),
            trackAction: 'join_pool',
            trackTarget: String(pool.pool_id),
          });
        } finally {
          setIsSubmittingJoin(false);
        }
      } else if (activeAction === 'take_open_slot') {
        if (selectedOutcomeIndex === null) return;
        setIsSubmittingJoin(true);
        try {
          await write({
            address: CONTRACT_ADDRESS,
            functionName: 'take_open_slot',
            args: [BigInt(pool.pool_id), selectedOutcomeIndex],
            value: genToWei(stakeAmount),
            trackAction: 'join_pool',
            trackTarget: String(pool.pool_id),
          });
        } finally {
          setIsSubmittingJoin(false);
        }
      } else if (activeAction === 'join_open_pool') {
        if (selectedOutcomeIndex === null) return;
        setIsSubmittingJoin(true);
        try {
          await write({
            address: CONTRACT_ADDRESS,
            functionName: 'join_open_pool',
            args: [BigInt(pool.pool_id), selectedOutcomeIndex],
            value: genToWei(stakeAmount),
            trackAction: 'join_pool',
            trackTarget: String(pool.pool_id),
          });
        } finally {
          setIsSubmittingJoin(false);
        }
      } else if (activeAction === 'resolve') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'request_resolution',
          args: [BigInt(pool.pool_id)],
          poolId: pool.pool_id,
        });
      } else if (activeAction === 'claim') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'claim_winnings',
          args: [BigInt(pool.pool_id)],
          poolId: pool.pool_id,
        });
      } else if (activeAction === 'force_refund') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'force_refund',
          args: [BigInt(pool.pool_id)],
          poolId: pool.pool_id,
        });
      } else if (activeAction === 'claim_refund') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'claim_refund',
          args: [BigInt(pool.pool_id)],
          poolId: pool.pool_id,
        });
      } else if (activeAction === 'cancel') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'cancel_pool',
          args: [BigInt(pool.pool_id)],
          poolId: pool.pool_id,
          trackAction: 'cancel_pool',
          trackTarget: String(pool.pool_id),
        });
      } else if (activeAction === 'block_and_refund') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'block_and_refund_pool',
          args: [BigInt(pool.pool_id)],
          poolId: pool.pool_id,
          trackAction: 'block_and_refund_pool',
          trackTarget: String(pool.pool_id),
        });
      } else if (activeAction === 'emergency_withdraw') {
        await write({
          address: CONTRACT_ADDRESS,
          functionName: 'emergency_withdraw',
          args: [BigInt(pool.pool_id)],
          poolId: pool.pool_id,
          trackAction: 'emergency_withdraw',
          trackTarget: String(pool.pool_id),
        });
      }
    } catch (err) {
      // Handled inside custom contract write hook
    }
  };

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
        className={`fixed inset-y-0 right-0 w-full max-w-lg bg-charcoal-dark border-l border-charcoal-light/30 z-50 shadow-2xl transition-all duration-300 ease-in-out flex flex-col ${
          selectedPoolId ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none invisible'
        }`}
      >
        {/* Fixed Header Section */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-charcoal-light/25 bg-charcoal-medium/20">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 animate-fade-in">
              {displayIndex !== null && (
                <span
                  className="text-xs font-semibold tracking-widest uppercase"
                  style={{
                    color: theme === 'dark' ? '#9FFF3C' : '#478A00',
                    textShadow: theme === 'dark' ? '0 0 8px rgba(159, 255, 60, 0.4)' : '0 0 8px rgba(71, 138, 0, 0.25)',
                  }}
                >
                  {isDuel ? 'Duel' : 'Event'} #{displayIndex}
                </span>
              )}
              {state !== undefined && (
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${getBadgeStyles(state)}`}>
                  {stateLabel(state)}
                </span>
              )}
              {isOpenPool && isJoinWindowLive && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-gold/10 text-brand-gold border border-brand-gold/20 uppercase tracking-wider"
                  style={{
                    textShadow: theme === 'dark' ? '0 0 8px rgba(201, 162, 39, 0.45)' : '0 0 8px rgba(201, 162, 39, 0.25)',
                  }}
                >
                  Open
                </span>
              )}
              {category && category.trim() !== '' && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-charcoal-light/30 text-foreground/60 border border-charcoal-light/20 uppercase tracking-wider">
                  {category}
                </span>
              )}
            </div>
            {name && name.trim() !== '' && (
              <span className="text-xs font-semibold text-foreground/75">
                {isDuel ? 'Title: ' : 'Room: '}<span className="font-normal text-foreground/90">{isDuel && name.toLowerCase().startsWith('duel:') ? name.slice(5) : name}</span>
              </span>
            )}
            <div>
              <a
                href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-semibold text-foreground/30 hover:text-foreground/60 transition-all font-mono underline decoration-dotted inline-flex items-center gap-0.5"
                title="View contract on explorer"
              >
                (View Contract)
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
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
              <span className="text-sm text-foreground/50 font-light">Loading event details...</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center text-center py-16 px-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl">
              <AlertCircle className="w-8 h-8 text-brand-magenta mb-3" />
              <h4 className="text-sm font-bold text-foreground mb-1">Failed to Load Details</h4>
              <p className="text-xs text-foreground/50 mb-4">{error}</p>
              <button
                onClick={() => selectedPoolId && fetchPoolDetail(selectedPoolId)}
                className="px-4 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-xs font-semibold text-foreground transition-all cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && pool && (
            <>
              {/* Resolution Evidence Box */}
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
                  {cleanTerms(pool.terms) || (isDuel ? (pool.name.toLowerCase().startsWith('duel:') ? pool.name.slice(5) : pool.name) : pool.name) || 'Untitled'}
                </p>
              </div>

              {/* Outcomes and Stakes */}
              <div className="space-y-4">
                <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                  Outcomes & Stakes
                </span>

                {isDuel ? (
                  /* Head-to-Head 1v1 Layout for Drawer */
                  (() => {
                    const p1Address = pool.creator;
                    const p2Address = pool.whitelist.find((addr) => addr.toLowerCase() !== p1Address.toLowerCase()) || '';
                    const p1OutcomeIndex = creatorOutcomeIndex ?? 0;
                    const p2OutcomeIndex = 1 - p1OutcomeIndex;

                    const p1OutcomeLabel = pool.outcomes[p1OutcomeIndex]?.label || 'Outcome A';
                    const p2OutcomeLabel = pool.outcomes[p2OutcomeIndex]?.label || 'Outcome B';

                    const p1StakeStr = pool.outcomes[p1OutcomeIndex]?.total_staked || '0';
                    const p2StakeStr = pool.outcomes[p2OutcomeIndex]?.total_staked || '0';

                    const p1Stake = BigInt(p1StakeStr);
                    const p2Stake = BigInt(p2StakeStr);

                    const p2Joined = p2Stake > 0n;

                    const p1Won = pool.state === 2 && pool.winning_outcome_index === p1OutcomeIndex;
                    const p2Won = pool.state === 2 && pool.winning_outcome_index === p2OutcomeIndex;

                    return (
                      <div className="flex flex-col gap-6">
                        {/* Relative stake bar for Duel */}
                        <div className="space-y-2 bg-charcoal-medium/10 border border-charcoal-light/10 p-4 rounded-2xl">
                          <div className="h-2 w-full rounded-full overflow-hidden flex bg-charcoal-light/20">
                            {(() => {
                              const totalStake = p1Stake + p2Stake;
                              let p1Percentage = 50;
                              let p2Percentage = 50;
                              if (totalStake > 0n) {
                                p1Percentage = Number((p1Stake * 100n) / totalStake);
                                p2Percentage = 100 - p1Percentage;
                              }
                              return (
                                <>
                                  <div style={{ width: `${p1Percentage}%` }} className="h-full bg-brand-gold transition-all duration-500" />
                                  <div style={{ width: `${p2Percentage}%` }} className="h-full bg-brand-magenta transition-all duration-500" />
                                </>
                              );
                            })()}
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-foreground/40 uppercase tracking-wider">
                            <span>Challenger ({creatorOutcomeIndex !== null ? proportions[p1OutcomeIndex]?.toFixed(0) : '50'}%)</span>
                            <span>Opponent ({creatorOutcomeIndex !== null ? proportions[p2OutcomeIndex]?.toFixed(0) : '50'}%)</span>
                          </div>
                        </div>

                        {/* Head-to-Head Cards */}
                        <div className="grid grid-cols-2 gap-4 relative">
                          {/* Left Column: Challenger */}
                          <div className={`p-4 bg-charcoal-medium/20 border rounded-2xl flex flex-col items-center text-center space-y-3 relative ${p1Won ? 'border-brand-gold' : 'border-charcoal-light/15'}`}>
                            <div className="relative">
                              <div className="flex items-center justify-center rounded-full overflow-hidden w-12 h-12 border-2 border-charcoal-light/40">
                                <Avatar
                                  size={48}
                                  name={p1Address}
                                  variant="marble"
                                  colors={['#c9a227', '#b23a6e', '#f1ece3', '#1f1f22', '#0b0b0c']}
                                />
                              </div>
                              {p1Won && (
                                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 py-0.5 bg-brand-gold text-charcoal-dark rounded uppercase tracking-wider">
                                  Winner
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-foreground/45 font-mono">Challenger</span>
                              <span className="text-xs font-semibold text-foreground truncate max-w-[120px] select-all">
                                {truncateAddress(p1Address)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1.5 pt-2 border-t border-charcoal-light/10 w-full">
                              <span className="text-xs font-bold text-foreground leading-snug line-clamp-2" title={p1OutcomeLabel}>
                                {p1OutcomeLabel}
                              </span>
                              <span className="text-sm font-black text-brand-gold">
                                {weiToGen(p1StakeStr)} GEN
                              </span>
                            </div>
                          </div>

                          {/* Right Column: Opponent */}
                          <div className={`p-4 bg-charcoal-medium/20 border rounded-2xl flex flex-col items-center text-center space-y-3 relative ${p2Won ? 'border-brand-gold' : 'border-charcoal-light/15'}`}>
                            {p2Address ? (
                              <>
                                <div className="relative">
                                  <div className={`flex items-center justify-center rounded-full overflow-hidden w-12 h-12 border-2 border-charcoal-light/40 ${!p2Joined ? 'opacity-40' : ''}`}>
                                    <Avatar
                                      size={48}
                                      name={p2Address}
                                      variant="marble"
                                      colors={['#c9a227', '#b23a6e', '#f1ece3', '#1f1f22', '#0b0b0c']}
                                    />
                                  </div>
                                  {p2Won && (
                                    <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 py-0.5 bg-brand-gold text-charcoal-dark rounded uppercase tracking-wider">
                                      Winner
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-foreground/45 font-mono">Opponent</span>
                                  <span className="text-xs font-semibold text-foreground truncate max-w-[120px] select-all">
                                    {truncateAddress(p2Address)}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1.5 pt-2 border-t border-charcoal-light/10 w-full">
                                  <span className="text-xs font-bold text-foreground leading-snug line-clamp-2" title={p2OutcomeLabel}>
                                    {p2OutcomeLabel}
                                  </span>
                                  <span className={`text-sm font-black ${p2Joined ? 'text-brand-gold' : 'text-foreground/30 font-light'}`}>
                                    {p2Joined ? `${weiToGen(p2StakeStr)} GEN` : 'Awaiting Join'}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="flex-grow flex flex-col items-center justify-center py-6">
                                <span className="text-xs text-foreground/30 font-light">No Opponent Whitelisted</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  /* Standard Vertical Layout */
                  <>
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
                  </>
                )}
              </div>

              {/* Join Pool Action UI Panel */}
              <div className="border-t border-charcoal-light/20 pt-6 space-y-4">
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
                            Your stake has been registered. The carousel and details have been refreshed. Bradbury finality takes 25 to 40 minutes. You can close this panel or track it in the Network widget.
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
                            onClick={resetWrite}
                            className="w-full py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                          >
                            Dismiss
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
                            onClick={resetWrite}
                            className="w-full py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-semibold text-foreground rounded-xl transition-all cursor-pointer"
                          >
                            Dismiss
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
                ) : !connectedAddress ? (
                  // Wallet connection prompt
                  <div className="p-4 bg-charcoal-medium/20 border border-charcoal-light/20 rounded-2xl flex flex-col items-center text-center space-y-3">
                    <p className="text-xs text-foreground/60 leading-relaxed font-light">
                      Connect your wallet to participate in this prediction pool.
                    </p>
                    <button
                      onClick={() => setWalletModalOpen(true)}
                      className="px-4 py-2 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-semibold rounded-xl transition-all cursor-pointer"
                    >
                      Connect Wallet
                    </button>
                  </div>
                ) : hasJoinedResolved === null ? (
                  // Neutral loading placeholder for action area while stake resolves
                  <div className="p-5 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl flex flex-col items-center text-center space-y-3 animate-pulse">
                    <Loader2 className="w-5 h-5 text-brand-gold/60 animate-spin" />
                    <span className="text-xs text-foreground/45 font-medium">Verifying stake details...</span>
                  </div>
                ) : isKillswitchActive ? (
                  // Emergency Mode UI Panel
                  hasUnclaimedStake ? (
                    pendingEmergencyWithdraw ? (
                      pendingEmergencyWithdraw.status === 'pending' ? (
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Emergency Withdraw
                          </span>
                          <p className="text-xs text-foreground/60 leading-relaxed font-light">
                            Withdrawal requested, processing on Bradbury.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled
                              className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Withdrawal Pending
                            </button>
                            <a
                              href={`https://explorer-bradbury.genlayer.com/tx/${pendingEmergencyWithdraw.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                              title="View transaction on explorer"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            Transaction Stale
                          </span>
                          <p className="text-xs text-foreground/75 leading-relaxed font-light">
                            Your emergency withdrawal is taking longer than expected. Please verify on the explorer before dismissing or checking again.
                          </p>
                          <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2.5 py-1.5 rounded-lg select-all">
                            <span className="truncate">{pendingEmergencyWithdraw.txHash}</span>
                            <a
                              href={`https://explorer-bradbury.genlayer.com/tx/${pendingEmergencyWithdraw.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                              title="View transaction on explorer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="flex gap-2.5">
                            <button
                              type="button"
                              disabled={isCheckingEmergencyWithdraw}
                              onClick={handleCheckPendingEmergencyWithdrawAgain}
                              className="flex-1 py-2 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              {isCheckingEmergencyWithdraw && <Loader2 className="w-3 h-3 animate-spin" />}
                              Check Again
                            </button>
                            <button
                              type="button"
                              onClick={() => usePendingWritesStore.getState().removePendingWrite(pendingEmergencyWithdraw.key)}
                              className="flex-1 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-bold text-foreground rounded-xl transition-all cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase block">
                          Emergency Withdraw
                        </span>
                        <p className="text-xs text-foreground/75 leading-relaxed font-light">
                          The contract is in emergency shutdown. This is the only way to recover your staked funds. You must withdraw them before the shutdown window ends.
                        </p>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">Withdrawable Amount</span>
                          <span className="text-lg font-bold text-brand-gold block">{weiToGen(userStake.amount)} GEN</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleEmergencyWithdrawClick}
                          className="w-full py-3 bg-brand-magenta hover:bg-brand-magenta/90 text-foreground font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                        >
                          Emergency Withdraw
                        </button>
                      </div>
                    )
                  ) : userStake && userStake.claimed ? (
                    <div className="p-4 bg-foreground/5 border border-foreground/15 rounded-2xl flex items-center justify-center gap-2.5 text-xs text-foreground/80 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-brand-gold" />
                      <span>Funds Withdrawn</span>
                    </div>
                  ) : (
                    <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl text-xs text-foreground/50 text-center font-light leading-relaxed">
                      The contract is in emergency shutdown. You did not participate in this prediction event.
                    </div>
                  )
                ) : pool.state === 0 ? (
                  // State 0: OPEN
                  isResolutionFailed ? (
                    <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                      <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        Resolution Failed
                      </span>
                      <p className="text-xs text-foreground/75 leading-relaxed font-light">
                        The previous resolution attempt finalized but failed. This typically indicates the oracle was unable to reach consensus from the listed verification sources.
                      </p>
                      
                      <div className="flex flex-col gap-2">
                        {/* Transaction tracker link */}
                        <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2.5 py-1.5 rounded-lg select-all">
                          <span className="truncate">{resolutionTx?.hash || pendingResolutionTx?.hash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${resolutionTx?.hash || pendingResolutionTx?.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                            title="View failed transaction on explorer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        {isWhitelisted && (
                          <button
                            type="button"
                            onClick={handleResolveClick}
                            className="w-full py-3 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                          >
                            Retry Resolution
                          </button>
                        )}

                        {isTimeout && (
                          <button
                            type="button"
                            onClick={handleForceRefundClick}
                            className="w-full py-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-foreground/80 hover:text-foreground font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                          >
                            Force Refund
                          </button>
                        )}
                      </div>
                    </div>
                  ) : isTimeout ? (
                    pendingForceRefundTx ? (
                      <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                          Refund Available
                        </span>
                        <p className="text-xs text-foreground/60 leading-relaxed font-light">
                          Refund requested, processing on Bradbury.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled
                            className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                          >
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Refund Pending
                          </button>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${pendingForceRefundTx.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                          Refund Available
                        </span>
                        <p className="text-xs text-foreground/60 leading-relaxed font-light">
                          The agreement could not be resolved within the timeout window. Any address can now trigger a force refund to transition this pool.
                        </p>
                        <button
                          type="button"
                          onClick={handleForceRefundClick}
                          className="w-full py-3 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                        >
                          Force Refund
                        </button>
                      </div>
                    )
                  ) : isResolutionReady ? (
                    isWhitelisted ? (
                      pendingResolutionTx ? (
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Event Resolution
                          </span>
                          <p className="text-xs text-foreground/60 leading-relaxed font-light">
                            Resolution requested, processing on Bradbury.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled
                              className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Resolution Pending
                            </button>
                            <a
                              href={`https://explorer-bradbury.genlayer.com/tx/${pendingResolutionTx.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                              title="View transaction on explorer"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        // Resolution Action Panel
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Event Resolution
                          </span>
                          <p className="text-xs text-foreground/60 leading-relaxed font-light">
                            The resolution deadline has passed. As a whitelisted participant, you can trigger the GenLayer LLM oracle to resolve this event.
                          </p>
                          <button
                            type="button"
                            onClick={handleResolveClick}
                            className="w-full py-3 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                          >
                            Request Resolution
                          </button>
                        </div>
                      )
                    ) : (
                      // Resolution available, but not whitelisted
                      <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl flex items-start gap-3 text-xs text-foreground/50">
                        <HelpCircle className="w-4 h-4 text-foreground/40 shrink-0 mt-0.5" />
                        <span>The staking deadline has passed. Waiting for a whitelisted participant to request resolution.</span>
                      </div>
                    )
                  ) : isExpired ? (
                    // Staking entries closed, resolution target not yet reached
                    <div className="space-y-3.5">
                      <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl flex items-start gap-3 text-xs text-foreground/50">
                        <HelpCircle className="w-4 h-4 text-foreground/40 shrink-0 mt-0.5" />
                        <span>Staking entries are closed. The join deadline has passed.</span>
                      </div>
                      {isWhitelisted && (
                        <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl text-xs text-foreground/60 leading-relaxed font-light">
                          Resolution will become available after {formatDate(pool.resolution_deadline)}.
                        </div>
                      )}
                    </div>
                  ) : (!isWhitelisted && !canTakeOpenSlot && !canJoinOpen) ? (
                    // Whitelist guard
                    <div className="p-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl flex items-start gap-3 text-xs text-brand-magenta/80">
                      <AlertCircle className="w-4 h-4 text-brand-magenta/60 shrink-0 mt-0.5" />
                      <span>Your connected wallet address is not whitelisted for this private prediction pool.</span>
                    </div>
                  ) : !hasJoined ? (
                    pendingJoin ? (
                      pendingJoin.status === 'pending' ? (
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Stake on Outcome
                          </span>
                          <p className="text-xs text-foreground/60 leading-relaxed font-light">
                            Stake requested, processing on Bradbury.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled
                              className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Join Pending
                            </button>
                            <a
                              href={`https://explorer-bradbury.genlayer.com/tx/${pendingJoin.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                              title="View transaction on explorer"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            Transaction Stale
                          </span>
                          <p className="text-xs text-foreground/75 leading-relaxed font-light">
                            Your join transaction is taking longer than expected to finalize. Please verify on the explorer before dismissing or checking again to avoid double staking.
                          </p>
                          <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2.5 py-1.5 rounded-lg select-all">
                            <span className="truncate">{pendingJoin.txHash}</span>
                            <a
                              href={`https://explorer-bradbury.genlayer.com/tx/${pendingJoin.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                              title="View transaction on explorer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="flex gap-2.5">
                            <button
                              type="button"
                              disabled={isCheckingJoin}
                              onClick={handleCheckPendingJoinAgain}
                              className="flex-1 py-2 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              {isCheckingJoin && <Loader2 className="w-3 h-3 animate-spin" />}
                              Check Again
                            </button>
                            <button
                              type="button"
                              onClick={() => usePendingWritesStore.getState().removePendingWrite(pendingJoin.key)}
                              className="flex-1 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-bold text-foreground rounded-xl transition-all cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      // Interactive Stake Form (Join)
                      <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                          Stake on Outcome
                        </span>
 
                        {/* Outcome Choice Selector */}
                        <div className="space-y-2">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">
                            {isDuel ? 'Your Outcome' : 'Select Outcome'}
                          </span>
                          {isDuel ? (
                            creatorOutcomeIndex !== null ? (
                              <div className="px-4 py-3 rounded-xl border border-brand-magenta/30 bg-brand-magenta/10 text-foreground font-semibold text-sm tracking-wide shadow-sm flex items-center justify-between">
                                <span>{pool.outcomes[1 - creatorOutcomeIndex]?.label || 'Opponent Outcome'}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-magenta bg-brand-magenta/10 px-2 py-0.5 border border-brand-magenta/20 rounded-md">Locked (Opponent Side)</span>
                              </div>
                            ) : (
                              <div className="px-4 py-3 rounded-xl border border-charcoal-light/20 bg-charcoal-dark/40 text-foreground/40 font-semibold text-sm tracking-wide animate-pulse">
                                Loading outcome...
                              </div>
                            )
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {pool.outcomes.map((outcome, idx) => {
                                const isSelected = selectedOutcomeIndex === idx;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    disabled={isSubmittingJoin}
                                    onClick={() => setSelectedOutcomeIndex(idx)}
                                    className={`px-4 py-3 rounded-xl border text-sm font-semibold tracking-wide transition-all cursor-pointer text-center truncate ${
                                      isSelected
                                        ? 'bg-brand-gold text-charcoal-dark border-brand-gold shadow-md'
                                        : 'bg-charcoal-dark/40 hover:bg-charcoal-light border-charcoal-light text-foreground/80'
                                    }`}
                                  >
                                    {outcome.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
 
                        {/* Stake Amount Input field */}
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">
                            Stake Amount (GEN)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              placeholder="0.00"
                              disabled={isSubmittingJoin}
                              value={stakeAmount}
                              onChange={(e) => {
                                setStakeAmount(e.target.value);
                                setValidationError(null);
                              }}
                              className="w-full px-4 py-3 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-sm text-foreground focus:outline-none transition-colors pr-12 placeholder-foreground/20 font-semibold"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-foreground/40">
                              GEN
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-foreground/45">
                            <span>Minimum stake: 0.01 GEN</span>
                            {stakeAmount && parseFloat(stakeAmount) > 0 && (
                              <span>≈ {parseFloat(stakeAmount).toFixed(4)} GEN</span>
                            )}
                          </div>
                        </div>
 
                        {/* Validation / Action Triggers */}
                        {validationError && (
                          <p className="text-xs text-brand-magenta font-semibold">{validationError}</p>
                        )}
 
                        <button
                          type="button"
                          disabled={isSubmittingJoin || (isDuel && creatorOutcomeIndex === null)}
                          onClick={handleJoinClick}
                          className={`w-full py-3 font-bold tracking-wide rounded-xl transition-all shadow-md text-sm flex items-center justify-center gap-2 ${
                            isSubmittingJoin || (isDuel && creatorOutcomeIndex === null)
                              ? 'bg-foreground/20 text-background/55 cursor-not-allowed'
                              : 'bg-foreground hover:bg-warm-white text-background cursor-pointer'
                          }`}
                        >
                          {isSubmittingJoin ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Signing...
                            </>
                          ) : (
                            canTakeOpenSlot ? 'Take Open Slot' : 'Join Event'
                          )}
                        </button>
                      </div>
                    )
                  ) : pendingIncrease ? (
                    pendingIncrease.status === 'pending' ? (
                      <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                          Increase Stake
                        </span>
                        <p className="text-xs text-foreground/60 leading-relaxed font-light">
                          Stake increase requested, processing on Bradbury.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled
                            className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                          >
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Increase Pending
                          </button>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${pendingIncrease.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          Transaction Stale
                        </span>
                        <p className="text-xs text-foreground/75 leading-relaxed font-light">
                          Your stake increase transaction is taking longer than expected to finalize. Please verify on the explorer before dismissing or checking again.
                        </p>
                        
                        {showDismissAcknowledge ? (
                          <div className="space-y-3 bg-brand-magenta/5 border border-brand-magenta/15 rounded-xl p-3 mt-2">
                            <span className="text-xs font-bold text-brand-magenta block">
                              CRITICAL DOUBLE-STAKE WARNING
                            </span>
                            <p className="text-xs text-foreground/80 leading-normal font-light">
                              Dismissing this marker does not cancel the on-chain transaction. If the original transaction still lands later, submitting a new stake increase will result in double-charging your wallet.
                            </p>
                            <label className="flex items-start gap-2.5 text-xs text-foreground/90 cursor-pointer select-none mt-2">
                              <input
                                type="checkbox"
                                checked={isDismissAcknowledged}
                                onChange={(e) => setIsDismissAcknowledged(e.target.checked)}
                                className="mt-0.5"
                              />
                              <span>I acknowledge that the original transaction might still finalize and re-submitting can charge my wallet twice.</span>
                            </label>
                            <div className="flex gap-2 text-xs font-bold pt-1.5">
                              <button
                                type="button"
                                disabled={!isDismissAcknowledged}
                                onClick={() => {
                                  usePendingWritesStore.getState().removePendingWrite(pendingIncrease.key);
                                  setShowDismissAcknowledge(false);
                                  setIsDismissAcknowledged(false);
                                }}
                                className="flex-1 py-2 bg-brand-magenta text-foreground disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all"
                              >
                                Confirm Dismiss
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowDismissAcknowledge(false);
                                  setIsDismissAcknowledged(false);
                                }}
                                className="flex-1 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-foreground rounded-lg transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2.5 py-1.5 rounded-lg select-all">
                              <span className="truncate">{pendingIncrease.txHash}</span>
                              <a
                                href={`https://explorer-bradbury.genlayer.com/tx/${pendingIncrease.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                                title="View transaction on explorer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                            <div className="flex gap-2.5">
                              <button
                                type="button"
                                disabled={isCheckingIncrease}
                                onClick={handleCheckPendingIncreaseAgain}
                                className="flex-1 py-2 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                {isCheckingIncrease && <Loader2 className="w-3 h-3 animate-spin" />}
                                Check Again
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDismissAcknowledge(true)}
                                className="flex-1 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-bold text-foreground rounded-xl transition-all cursor-pointer"
                              >
                                Dismiss
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  ) : pendingCancel ? (
                    pendingCancel.status === 'pending' ? (
                      <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                          Cancel Event
                        </span>
                        <p className="text-xs text-foreground/60 leading-relaxed font-light">
                          Cancellation requested, processing on Bradbury.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled
                            className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                          >
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Cancel Pending
                          </button>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${pendingCancel.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          Transaction Stale
                        </span>
                        <p className="text-xs text-foreground/75 leading-relaxed font-light">
                          Your cancel transaction is taking longer than expected to finalize. Please verify on the explorer before dismissing or checking again.
                        </p>
                        <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2.5 py-1.5 rounded-lg select-all">
                          <span className="truncate">{pendingCancel.txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${pendingCancel.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <div className="flex gap-2.5">
                          <button
                            type="button"
                            disabled={isCheckingCancel}
                            onClick={handleCheckPendingCancelAgain}
                            className="flex-1 py-2 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {isCheckingCancel && <Loader2 className="w-3 h-3 animate-spin" />}
                            Check Again
                          </button>
                          <button
                            type="button"
                            onClick={() => usePendingWritesStore.getState().removePendingWrite(pendingCancel.key)}
                            className="flex-1 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-bold text-foreground rounded-xl transition-all cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    // Interactive Stake Form (Increase)
                    <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                      <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                        Increase Stake
                      </span>

                      {/* Active Outcome Indicator (Read-only Selector) */}
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">
                          Your Staked Outcome
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {pool.outcomes.map((outcome, idx) => {
                            const isSelected = userStake!.outcome_index === idx;
                            return (
                              <button
                                key={idx}
                                type="button"
                                disabled
                                className={`px-4 py-3 rounded-xl border text-sm font-semibold tracking-wide text-center truncate select-none ${
                                  isSelected
                                    ? 'bg-brand-gold text-charcoal-dark border-brand-gold shadow-md'
                                    : 'bg-charcoal-dark/40 border-charcoal-light text-foreground/20'
                                  }`}
                              >
                                {outcome.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Stake Amount Input field */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">
                          Additional Stake (GEN)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            value={stakeAmount}
                            onChange={(e) => {
                              setStakeAmount(e.target.value);
                              setValidationError(null);
                            }}
                            className="w-full px-4 py-3 bg-charcoal-dark border border-charcoal-light focus:border-foreground/15 rounded-xl text-sm text-foreground focus:outline-none transition-colors pr-12 placeholder-foreground/20 font-semibold"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-foreground/40">
                            GEN
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-foreground/45">
                          <span>Current stake: {weiToGen(userStake!.amount)} GEN</span>
                          <span>Minimum: 0.01 GEN</span>
                        </div>
                      </div>

                      {/* Validation / Action Triggers */}
                      {validationError && (
                        <p className="text-xs text-brand-magenta font-semibold">{validationError}</p>
                      )}

                      <button
                        type="button"
                        onClick={handleIncreaseClick}
                        className="w-full py-3 bg-foreground hover:bg-warm-white text-background font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                      >
                        Increase Stake
                      </button>

                      {canCancel && (
                        <button
                          type="button"
                          onClick={handleCancelClick}
                          className="w-full py-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light/30 text-foreground/80 hover:text-foreground font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm mt-2"
                        >
                          Cancel Event
                        </button>
                      )}
                    </div>
                  )
                ) : pool.state === 1 ? (
                  // State 1: RESOLVING
                  <div className="p-5 bg-brand-gold/5 border border-brand-gold/15 rounded-2xl flex flex-col items-center text-center space-y-3">
                    <Loader2 className="w-6 h-6 text-brand-gold animate-spin" />
                    <h5 className="text-xs font-bold text-brand-gold uppercase tracking-wider">Resolving Event</h5>
                    <p className="text-[11px] text-foreground/60 leading-relaxed font-light">
                      The GenLayer LLM oracle is reading resolution sources to achieve consensus. This process can take several minutes.
                    </p>
                  </div>
                ) : pool.state === 2 ? (
                  // State 2: SETTLED
                  hasJoined ? (
                    userStake!.outcome_index === pool.winning_outcome_index ? (
                      userStake!.claimed ? (
                        // Claimed Badge
                        <div className="p-4 bg-foreground/5 border border-foreground/15 rounded-2xl flex items-center justify-center gap-2.5 text-xs text-foreground/80 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-brand-gold" />
                          <span>Winnings Claimed</span>
                        </div>
                      ) : isClaimFailed ? (
                        // Claim Failed Notification
                        <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            Claim Failed
                          </span>
                          <p className="text-xs text-foreground/75 leading-relaxed font-light">
                            The claim transaction finalized but the winnings were not claimed. This can happen if the transaction reverted.
                          </p>
                          <div className="flex flex-col gap-2">
                            <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2.5 py-1.5 rounded-lg select-all">
                              <span className="truncate">{claimWinningsTx?.hash || pendingClaimWinningsTx?.hash}</span>
                              <a
                                href={`https://explorer-bradbury.genlayer.com/tx/${claimWinningsTx?.hash || pendingClaimWinningsTx?.hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                                title="View failed transaction on explorer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                            <button
                              type="button"
                              onClick={handleClaimClick}
                              className="w-full py-3 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                            >
                              Retry Claim
                            </button>
                          </div>
                        </div>
                      ) : (pendingClaimWinningsTx && !userStake!.claimed) ? (
                        // Claim Pending (Processing State)
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Claim Winnings
                          </span>
                          <p className="text-xs text-foreground/60 leading-relaxed font-light">
                            Claim requested, processing on Bradbury.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled
                              className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Claim Pending
                            </button>
                            <a
                              href={`https://explorer-bradbury.genlayer.com/tx/${pendingClaimWinningsTx.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                              title="View transaction on explorer"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ) : isFinalized ? (
                        // Claim Action Panel
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Claim Winnings
                          </span>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">Estimated Winnings Payout</span>
                            <span className="text-lg font-bold text-brand-gold block">{estimatedPayoutStr} GEN</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleClaimClick}
                            className="w-full py-3 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                          >
                            Claim Winnings
                          </button>
                        </div>
                      ) : (
                        // Resolution settled but not finalized on-chain
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Claim Winnings
                          </span>
                          <div className="space-y-2">
                            <p className="text-xs text-foreground/60 leading-relaxed font-light">
                              Resolution settled. Waiting for on-chain finalization before winnings can be claimed.
                            </p>
                            {etaText && (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-gold bg-brand-gold/5 border border-brand-gold/15 px-2.5 py-1 rounded-lg">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                {etaText}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    ) : (
                      // Losing Outcome Notice
                      <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl text-xs text-foreground/50 text-center font-light leading-relaxed">
                        This agreement settled on outcome <span className="font-semibold text-brand-gold">&quot;{winningOutcome?.label || `Index #${pool.winning_outcome_index}`}&quot;</span>. Your staked outcome did not win.
                      </div>
                    )
                  ) : (
                    // Did not join
                    <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl text-xs text-foreground/50 text-center font-light leading-relaxed">
                      This pool has settled. You did not participate in this agreement.
                    </div>
                  )
                ) : pool.state === 3 ? (
                  // State 3: REFUNDED
                  <div className="space-y-4">
                    <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl text-xs text-foreground/70 leading-relaxed font-light">
                      <span className="font-semibold text-brand-gold uppercase tracking-wider block mb-1 text-[10px]">
                        Refund Reason
                      </span>
                      {pool.refund_reason === 1 && 'This pool was cancelled by the creator.'}
                      {pool.refund_reason === 2 && 'This pool timed out before it could be resolved, so all stakes are refundable.'}
                      {pool.refund_reason === 3 && 'The outcome that occurred had no backers, so all stakes are refundable.'}
                      {pool.refund_reason === 4 && 'Fewer than two outcomes had stake, so there was no real contest; all stakes are refundable.'}
                      {pool.refund_reason === 5 && 'This pool was blocked and refunded by the administrator.'}
                      {pool.refund_reason === 6 && 'The oracle could not reach a verdict from the listed sources, so all stakes are refundable.'}
                      {(!pool.refund_reason || pool.refund_reason < 1 || pool.refund_reason > 6) && 'This pool has been refunded.'}
                    </div>

                    {hasJoined ? (
                      userStake!.claimed ? (
                        <div className="p-4 bg-foreground/5 border border-foreground/15 rounded-2xl flex items-center justify-center gap-2.5 text-xs text-foreground/80 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-brand-gold" />
                          <span>Refund Claimed</span>
                        </div>
                      ) : isClaimRefundFailed ? (
                        // Refund Claim Failed Notification
                        <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            Refund Claim Failed
                          </span>
                          <p className="text-xs text-foreground/75 leading-relaxed font-light">
                            The refund claim transaction finalized but the refund was not claimed. This can happen if the transaction reverted.
                          </p>
                          <div className="flex flex-col gap-2">
                            <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2.5 py-1.5 rounded-lg select-all">
                              <span className="truncate">{claimRefundTx?.hash || pendingClaimRefundTx?.hash}</span>
                              <a
                                href={`https://explorer-bradbury.genlayer.com/tx/${claimRefundTx?.hash || pendingClaimRefundTx?.hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                                title="View failed transaction on explorer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                            <button
                              type="button"
                              onClick={handleClaimRefundClick}
                              className="w-full py-3 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                            >
                              Retry Refund Claim
                            </button>
                          </div>
                        </div>
                      ) : (pendingClaimRefundTx && !userStake!.claimed) ? (
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Claim Refund
                          </span>
                          <p className="text-xs text-foreground/60 leading-relaxed font-light">
                            Refund claim requested, processing on Bradbury.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled
                              className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Claim Pending
                            </button>
                            <a
                              href={`https://explorer-bradbury.genlayer.com/tx/${pendingClaimRefundTx.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                              title="View transaction on explorer"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                          <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                            Claim Refund
                          </span>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-foreground/40 block">Refundable Amount</span>
                            <span className="text-lg font-bold text-brand-gold block">{weiToGen(userStake!.amount)} GEN</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleClaimRefundClick}
                            className="w-full py-3 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                          >
                            Claim Refund
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl text-xs text-foreground/50 text-center font-light leading-relaxed">
                        This pool has been refunded. You did not participate in this agreement.
                      </div>
                    )}
                  </div>
                ) : (
                  // State 4: EMERGENCY or default
                  <div className="p-4 bg-charcoal-medium/10 border border-charcoal-light/15 rounded-2xl text-xs text-foreground/50 text-center font-light leading-relaxed">
                    This pool is in state: {stateLabel(pool.state)}.
                  </div>
                )}
              </div>

              {/* Admin Actions Panel */}
              {isAdmin && pool.state === 0 && writeStatus === 'idle' && (
                <div className="border-t border-charcoal-light/20 pt-6 space-y-4">
                  <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase block">
                    Admin Controls
                  </span>
                  {pendingBlockAndRefund ? (
                    pendingBlockAndRefund.status === 'pending' ? (
                      <div className="space-y-4 bg-charcoal-medium/10 border border-charcoal-light/20 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-foreground/45 tracking-widest uppercase block">
                          Block and Refund
                        </span>
                        <p className="text-xs text-foreground/60 leading-relaxed font-light">
                          Block and refund requested, processing on Bradbury.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled
                            className="flex-1 py-3 bg-brand-gold/20 text-brand-gold/50 font-bold tracking-wide rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
                          >
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Pending...
                          </button>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${pendingBlockAndRefund.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light rounded-xl text-foreground/75 hover:text-foreground transition-all cursor-pointer"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                        <span className="text-xs font-semibold text-brand-magenta tracking-widest uppercase flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          Transaction Stale
                        </span>
                        <p className="text-xs text-foreground/75 leading-relaxed font-light">
                          Your block and refund transaction is taking longer than expected to finalize. Please verify on the explorer before dismissing or checking again.
                        </p>
                        <div className="text-[10px] font-mono text-foreground/50 truncate flex items-center justify-between bg-charcoal-dark/50 border border-charcoal-light/10 px-2.5 py-1.5 rounded-lg select-all">
                          <span className="truncate">{pendingBlockAndRefund.txHash}</span>
                          <a
                            href={`https://explorer-bradbury.genlayer.com/tx/${pendingBlockAndRefund.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/40 hover:text-foreground transition-all ml-2 shrink-0"
                            title="View transaction on explorer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <div className="flex gap-2.5">
                          <button
                            type="button"
                            disabled={isCheckingBlockAndRefund}
                            onClick={handleCheckPendingBlockAndRefundAgain}
                            className="flex-1 py-2 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {isCheckingBlockAndRefund && <Loader2 className="w-3 h-3 animate-spin" />}
                            Check Again
                          </button>
                          <button
                            type="button"
                            onClick={() => usePendingWritesStore.getState().removePendingWrite(pendingBlockAndRefund.key)}
                            className="flex-1 py-2 bg-charcoal-light hover:bg-charcoal-medium border border-charcoal-light text-xs font-bold text-foreground rounded-xl transition-all cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="space-y-4 bg-brand-magenta/5 border border-brand-magenta/15 rounded-2xl p-4.5">
                      <p className="text-xs text-foreground/60 leading-relaxed font-light">
                        As the contract administrator, you can block this pool and trigger a refund. The creation fee will not be returned to the creator.
                      </p>
                      <button
                        type="button"
                        onClick={handleBlockAndRefundClick}
                        className="w-full py-3 bg-brand-magenta hover:bg-brand-magenta/90 text-foreground font-bold tracking-wide rounded-xl transition-all cursor-pointer shadow-md text-sm"
                      >
                        Block and Refund Pool
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                    <span className="text-xs font-semibold text-foreground/50">Resolution Reference</span>
                    <span className="text-xs font-medium text-foreground/80">
                      {getResolutionReference(pool.terms) || formatDate(pool.resolution_deadline)}
                    </span>
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

      {/* Confirmation Modal */}
      {pool && (
        <ConfirmModal
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={handleConfirmAction}
          title={
            activeAction === 'resolve'
              ? 'Confirm Resolution Request'
              : activeAction === 'claim'
              ? 'Confirm Winnings Claim'
              : activeAction === 'force_refund'
              ? 'Confirm Force Refund'
              : activeAction === 'claim_refund'
              ? 'Confirm Refund Claim'
              : activeAction === 'cancel'
              ? 'Confirm Cancel Event'
              : activeAction === 'block_and_refund'
              ? 'Confirm Block and Refund Pool'
              : activeAction === 'emergency_withdraw'
              ? 'Confirm Emergency Withdrawal'
              : activeAction === 'take_open_slot'
              ? 'Confirm Take Open Slot'
              : activeAction === 'join_open_pool'
              ? 'Confirm Joining Open Pool'
              : 'Confirm Staking Action'
          }
        >
          {activeAction === 'resolve' ? (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">{isDuel ? 'Duel ID' : 'Event ID'}</span>
                  <span className="font-semibold text-foreground font-mono">#{pool.pool_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-gold font-display uppercase">Request Resolution</span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This will trigger the consensus of the GenLayer LLM oracle to read the verification sources and decide the winning outcome of this prediction event.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                This process involves fetching web resources, processing LLM queries, and reaching consensus. It can take several minutes to complete on-chain.
              </p>
            </div>
          ) : activeAction === 'block_and_refund' ? (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">{isDuel ? 'Duel ID' : 'Event ID'}</span>
                  <span className="font-semibold text-foreground font-mono">#{pool.pool_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-magenta font-display uppercase">Block and Refund Pool</span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This blocks the event, sets it to REFUNDED (reason: blocked by admin), lets all participants reclaim their stakes via claim refund, and the creation fee is not returned to the creator.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          ) : activeAction === 'emergency_withdraw' ? (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">{isDuel ? 'Duel ID' : 'Event ID'}</span>
                  <span className="font-semibold text-foreground font-mono">#{pool.pool_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-magenta font-display uppercase">Emergency Withdraw</span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This is the only way to recover your staked funds while the killswitch is active. You must withdraw them before the emergency shutdown window ends.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          ) : activeAction === 'force_refund' ? (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">{isDuel ? 'Duel ID' : 'Event ID'}</span>
                  <span className="font-semibold text-foreground font-mono">#{pool.pool_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-gold font-display uppercase">Force Refund</span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This will trigger a force refund for this event, moving it to the Refunded state because the timeout deadline has passed.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          ) : activeAction === 'claim_refund' ? (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">{isDuel ? 'Duel ID' : 'Event ID'}</span>
                  <span className="font-semibold text-foreground font-mono">#{pool.pool_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Your Stake</span>
                  <span className="font-bold text-foreground">
                    {userStake ? weiToGen(userStake.amount) : '0'} GEN
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Claiming a refund is irreversible. Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          ) : activeAction === 'claim' ? (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">{isDuel ? 'Duel ID' : 'Event ID'}</span>
                  <span className="font-semibold text-foreground font-mono">#{pool.pool_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Your Staked Outcome</span>
                  <span className="font-semibold text-brand-gold font-display">
                    {pool.outcomes[userStake?.outcome_index ?? 0]?.label}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Your Stake</span>
                  <span className="font-bold text-foreground">
                    {userStake ? weiToGen(userStake.amount) : '0'} GEN
                  </span>
                </div>
                {estimatedPayoutStr && (
                  <div className="flex justify-between text-xs border-t border-charcoal-light/15 pt-2.5">
                    <span className="text-foreground/45">Estimated Payout</span>
                    <span className="font-bold text-brand-gold">{estimatedPayoutStr} GEN</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Claiming is irreversible. Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          ) : activeAction === 'cancel' ? (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">{isDuel ? 'Duel ID' : 'Event ID'}</span>
                  <span className="font-semibold text-foreground font-mono">#{pool.pool_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">Action</span>
                  <span className="font-semibold text-brand-gold font-display uppercase font-bold text-sm">Cancel Event</span>
                </div>
              </div>
              <p className="text-xs text-foreground/75 mb-3 leading-relaxed">
                This will cancel the agreement event. The event state will transition to Refunded, and you can recover your stake.
              </p>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Note: The creation fee is non-refundable. Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-3">Please review the details below before signing the transaction in your wallet:</p>
              <div className="bg-charcoal-dark border border-charcoal-light/35 rounded-xl p-3.5 space-y-2.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">{isDuel ? 'Duel ID' : 'Event ID'}</span>
                  <span className="font-semibold text-foreground font-mono">#{pool.pool_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">
                    {activeAction === 'increase' ? 'Increasing Stake On' : 'Staking On'}
                  </span>
                  <span className="font-semibold text-brand-gold font-display">
                    {activeAction === 'increase'
                      ? pool.outcomes[userStake?.outcome_index ?? 0]?.label
                      : pool.outcomes[selectedOutcomeIndex!]?.label}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground/45">
                    {activeAction === 'increase' ? 'Added Stake Amount' : 'Stake Amount'}
                  </span>
                  <span className="font-bold text-foreground">{stakeAmount} GEN</span>
                </div>
              </div>
              <p className="text-[11px] text-foreground/45 italic leading-snug">
                Staking is final and cannot be undone. Transactions on GenLayer Bradbury have a finality window of 25 to 40 minutes.
              </p>
            </div>
          )}
        </ConfirmModal>
      )}
    </>
  );
}
