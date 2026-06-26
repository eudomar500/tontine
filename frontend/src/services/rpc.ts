/**
 * GenLayer Bradbury RPC client and helper functions.
 * Implements rate-limiting, request serialization, and retries.
 */

const RPC_URL = 'https://rpc-bradbury.genlayer.com';
const MIN_DELAY_MS = 250;

export interface TransactionReceipt {
  status: string | number;
  blockHash?: string;
  blockNumber?: string;
  transactionHash: string;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a function with a retry strategy and backoff.
 * Retries up to 3 times with 1s, 2s, and 3s delays.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  initialBackoff = 1000
): Promise<T> {
  let attempt = 1;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }
      const backoff = attempt * initialBackoff;
      console.warn(`RPC call failed (attempt ${attempt}/${attempts}). Retrying in ${backoff}ms...`, error);
      await delay(backoff);
      attempt++;
    }
  }
}

/**
 * Queue to process RPC reads with a concurrency pool and rate-limit spacing.
 */
class RpcQueue {
  private queue: (() => Promise<any>)[] = [];
  private activeCount = 0;
  private maxConcurrency = 2;
  private lastStartTime = 0;
  private processing = false;

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const now = Date.now();
      const timeSinceLastStart = now - this.lastStartTime;
      if (timeSinceLastStart < MIN_DELAY_MS) {
        await delay(MIN_DELAY_MS - timeSinceLastStart);
        continue;
      }

      const nextFn = this.queue.shift();
      if (nextFn) {
        this.activeCount++;
        this.lastStartTime = Date.now();
        nextFn().finally(() => {
          this.activeCount--;
          this.process();
        });
      }
    }

    this.processing = false;
  }
}

export const rpcQueue = new RpcQueue();

/**
 * Makes a JSON-RPC request to the GenLayer Bradbury endpoint.
 */
async function callRpc(method: string, params: any[]): Promise<any> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || 'RPC Error');
  }

  return payload.result;
}

/**
 * Fetches the transaction receipt for a given transaction hash.
 * This read operation is scheduled through the serialization queue and retried if it fails.
 */
export async function getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
  return rpcQueue.enqueue(async () => {
    return withRateLimitRetry(async () => {
      // Query GenLayer consensus status directly instead of the EVM execution receipt status.
      // GenLayer requires checking validator consensus finality (finalized status), whereas
      // standard EVM receipt status fields only reflect local execution success (e.g. 0x1).
      const res = await callRpc('gen_getTransactionStatus', [{ txId: hash }]);
      if (res) {
        return {
          status: res.status,
          transactionHash: hash,
        };
      }
      return null;
    });
  });
}
