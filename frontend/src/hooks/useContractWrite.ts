import { useState, useCallback } from 'react';
import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { useWalletStore } from '../store/wallet';
import { useTxStore } from '../store/transactions';

export type WriteStatus = 'idle' | 'signing' | 'pending' | 'accepted' | 'finalized' | 'error';

interface UseContractWriteOptions {
  onSuccess?: (receipt: any) => void;
  onError?: (error: Error) => void;
}

export function useContractWrite(options?: UseContractWriteOptions) {
  const [status, setStatus] = useState<WriteStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const connectedAddress = useWalletStore((state) => state.connectedAddress);
  const connectedProvider = useWalletStore((state) => state.connectedProvider);
  const addTransaction = useTxStore((state) => state.addTransaction);

  const write = useCallback(
    async (params: {
      address: string;
      functionName: string;
      args: any[];
      value?: bigint;
    }) => {
      if (!connectedAddress || !connectedProvider?.provider) {
        const err = new Error('Wallet not connected or provider unavailable');
        setStatus('error');
        setError(err);
        options?.onError?.(err);
        throw err;
      }

      setStatus('signing');
      setTxHash(null);
      setError(null);

      try {
        const client = createClient({
          chain: testnetBradbury,
          account: connectedAddress as `0x${string}`,
          provider: connectedProvider.provider,
        });

        const hash = await client.writeContract({
          address: params.address as `0x${string}`,
          functionName: params.functionName,
          args: params.args,
          value: params.value ?? 0n,
        });

        setTxHash(hash);
        setStatus('pending');

        // Track transaction globally for floating NetworkStatus widget
        addTransaction(hash, false);

        // Wait for transaction to be accepted on-chain
        const receipt = await client.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.ACCEPTED,
        });

        setStatus('accepted');
        options?.onSuccess?.(receipt);

        // Asynchronously poll for finality without blocking UI flow
        client
          .waitForTransactionReceipt({
            hash,
            status: TransactionStatus.FINALIZED,
          })
          .then(() => {
            setStatus('finalized');
          })
          .catch((err) => {
            console.warn(`Finalization poll failed for ${hash}:`, err);
          });

        return hash;
      } catch (err: any) {
        console.error('Contract transaction execution error:', err);
        setStatus('error');
        const formattedError = err instanceof Error ? err : new Error(err?.message || 'Transaction execution failed');
        setError(formattedError);
        options?.onError?.(formattedError);
        throw formattedError;
      }
    },
    [connectedAddress, connectedProvider, addTransaction, options]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setTxHash(null);
    setError(null);
  }, []);

  return {
    write,
    status,
    txHash,
    error,
    reset,
    isIdle: status === 'idle',
    isSigning: status === 'signing',
    isPending: status === 'pending',
    isAccepted: status === 'accepted',
    isFinalized: status === 'finalized',
    isError: status === 'error',
  };
}
