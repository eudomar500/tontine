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
      args?: any[];
      value?: bigint;
      poolId?: number;
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
      let hashRef: `0x${string}` | undefined = undefined;

      try {
        const client = createClient({
          chain: testnetBradbury,
          account: connectedAddress as `0x${string}`,
          provider: connectedProvider.provider,
        });

        const writeParams: any = {
          address: params.address as `0x${string}`,
          functionName: params.functionName,
          value: params.value ?? 0n,
        };
        if (params.args !== undefined) {
          writeParams.args = params.args;
        }

        const hash = await client.writeContract(writeParams);
        hashRef = hash;

        setTxHash(hash);
        setStatus('pending');

        // Track transaction globally for floating NetworkStatus widget
        addTransaction(hash, false, params.poolId, params.functionName);

        // Synchronously write localStorage markers on broadcast for resolution and refund actions
        if (params.poolId) {
          if (typeof window !== 'undefined') {
            if (params.functionName === 'request_resolution') {
              localStorage.setItem(`tontine:resolutionRequested:${params.poolId}`, JSON.stringify({ txHash: hash, timestamp: Date.now() }));
            } else if (params.functionName === 'force_refund') {
              localStorage.setItem(`tontine:forceRefundRequested:${params.poolId}`, JSON.stringify({ txHash: hash, timestamp: Date.now() }));
            } else if (params.functionName === 'claim_refund' && connectedAddress) {
              localStorage.setItem(`tontine:claimRefundRequested:${params.poolId}:${connectedAddress.toLowerCase()}`, JSON.stringify({ txHash: hash, timestamp: Date.now() }));
            }
          }
        }

        // Wait for transaction to be accepted on-chain
        try {
          const receipt = await client.waitForTransactionReceipt({
            hash,
            status: TransactionStatus.ACCEPTED,
            retries: 120, // 10 minutes timeout
            interval: 5000,
          });

          setStatus('accepted');
          options?.onSuccess?.(receipt);

          // Asynchronously poll for finality without blocking UI flow
          client
            .waitForTransactionReceipt({
              hash,
              status: TransactionStatus.FINALIZED,
              retries: 400, // 2000s / 5s = 400 retries
              interval: 5000,
            })
            .then(() => {
              setStatus('finalized');
            })
            .catch((err) => {
              console.warn(`Finalization poll failed for ${hash}:`, err);
            });
        } catch (waitErr: any) {
          const isTimeout = waitErr?.message?.toLowerCase().includes('time') ||
                            waitErr?.message?.toLowerCase().includes('timeout') ||
                            waitErr?.message?.toLowerCase().includes('retries');

          if (isTimeout) {
            console.warn(`Timeout waiting for transaction receipt for ${hash}. Treating as pending.`);

            // Asynchronously poll for accepted status and then finality in background
            const pollInBackground = async () => {
              try {
                const bgReceipt = await client.waitForTransactionReceipt({
                  hash,
                  status: TransactionStatus.ACCEPTED,
                  retries: 300, // 25 minutes additional polling
                  interval: 5000,
                });
                setStatus('accepted');
                options?.onSuccess?.(bgReceipt);

                await client.waitForTransactionReceipt({
                  hash,
                  status: TransactionStatus.FINALIZED,
                  retries: 600, // 50 minutes additional polling
                  interval: 5000,
                });
                setStatus('finalized');
              } catch (bgErr) {
                console.warn(`Background poll failed for ${hash}:`, bgErr);
              }
            };
            pollInBackground();
          } else {
            // Re-throw fatal errors so they set the error status correctly
            throw waitErr;
          }
        }

        return hash;
      } catch (err: any) {
        console.error('Contract transaction execution error:', err);
        setStatus('error');
        if (hashRef) {
          useTxStore.getState().removeTransaction(hashRef);
        }
        if (params.poolId) {
          if (typeof window !== 'undefined') {
            if (params.functionName === 'request_resolution') {
              localStorage.removeItem(`tontine:resolutionRequested:${params.poolId}`);
            } else if (params.functionName === 'force_refund') {
              localStorage.removeItem(`tontine:forceRefundRequested:${params.poolId}`);
            } else if (params.functionName === 'claim_refund' && connectedAddress) {
              localStorage.removeItem(`tontine:claimRefundRequested:${params.poolId}:${connectedAddress.toLowerCase()}`);
            }
          }
        }
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
