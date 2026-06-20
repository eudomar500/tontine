import { useContractWrite } from './useContractWrite';
import { usePendingWritesStore } from '../store/pendingWrites';
import { useWalletStore } from '../store/wallet';
import { useCallback } from 'react';

export function useTrackedContractWrite(options?: {
  onSuccess?: (receipt: any) => void;
  onError?: (error: Error) => void;
}) {
  const { write: rawWrite, ...rest } = useContractWrite(options);
  const addPendingWrite = usePendingWritesStore((state) => state.addPendingWrite);
  const connectedAddress = useWalletStore((state) => state.connectedAddress);

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
      const hash = await rawWrite(params);

      // Automatically register the write as pending if tracking fields are specified
      if (params.trackAction && params.trackTarget && connectedAddress) {
        addPendingWrite(
          connectedAddress,
          params.trackAction,
          params.trackTarget,
          hash,
          params.trackMetadata
        );
      }
      return hash;
    },
    [rawWrite, addPendingWrite, connectedAddress]
  );

  return {
    write,
    ...rest,
  };
}
