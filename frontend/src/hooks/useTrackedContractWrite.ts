import { useContractWrite } from './useContractWrite';
import { usePendingWritesStore } from '../store/pendingWrites';
import { useWalletStore } from '../store/wallet';
import { useCallback, useRef } from 'react';

export function useTrackedContractWrite(options?: {
  onSuccess?: (receipt: any) => void;
  onError?: (error: Error) => void;
  onSubmitted?: (hash: string) => void;
}) {
  const addPendingWrite = usePendingWritesStore((state) => state.addPendingWrite);
  const removePendingWrite = usePendingWritesStore((state) => state.removePendingWrite);
  const connectedAddress = useWalletStore((state) => state.connectedAddress);

  // Maintain active tracking properties to ensure no race conditions on submission callbacks
  const activeTrackRef = useRef<{
    action?: string;
    target?: string;
    metadata?: Record<string, any>;
  }>({});

  const { write: rawWrite, ...rest } = useContractWrite({
    onSubmitted: (hash) => {
      const { action, target, metadata } = activeTrackRef.current;
      if (action && target && connectedAddress) {
        addPendingWrite(
          connectedAddress,
          action,
          target,
          hash,
          metadata
        );
      }
      options?.onSubmitted?.(hash);
    },
    onSuccess: (receipt) => {
      const { action, target } = activeTrackRef.current;
      // Clear the create_pool pending marker immediately on success, using the nonce key
      if (action === 'create_pool' && target && connectedAddress) {
        const key = `${connectedAddress.toLowerCase()}:${action}:${target}`;
        removePendingWrite(key);
      }
      activeTrackRef.current = {};
      options?.onSuccess?.(receipt);
    },
    onError: (error) => {
      const { action, target } = activeTrackRef.current;
      if (action && target && connectedAddress) {
        const key = `${connectedAddress.toLowerCase()}:${action}:${target}`;
        removePendingWrite(key);
      }
      activeTrackRef.current = {};
      options?.onError?.(error);
    },
  });

  const write = useCallback(
    async (params: {
      address: string;
      functionName: string;
      args?: any[];
      value?: bigint;
      poolId?: number;
      trackAction?: string;
      trackTarget?: string;
      trackMetadata?: Record<string, any>;
    }) => {
      // Synchronously set tracking properties before broadcast
      activeTrackRef.current = {
        action: params.trackAction,
        target: params.trackTarget,
        metadata: params.trackMetadata,
      };

      try {
        const hash = await rawWrite(params);
        return hash;
      } catch (err) {
        activeTrackRef.current = {};
        throw err;
      }
    },
    [rawWrite, connectedAddress, addPendingWrite, removePendingWrite]
  );

  return {
    write,
    ...rest,
  };
}
