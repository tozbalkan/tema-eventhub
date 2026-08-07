export interface IdempotencyRecord {
  key: string;
  createdAt: string;
  status: 'Processing' | 'Completed' | 'Failed';
  responsePayload?: any;
}

export class IdempotencyStore {
  private static store: Map<string, IdempotencyRecord> = new Map();
  private static activeLocks: Set<string> = new Set();

  /**
   * Atomic lock acquisition to prevent race conditions on concurrent webhooks
   */
  public static tryAcquireLock(key: string): boolean {
    if (IdempotencyStore.activeLocks.has(key) || IdempotencyStore.store.has(key)) {
      return false; // Lock acquisition failed or key already processed
    }
    IdempotencyStore.activeLocks.add(key);
    IdempotencyStore.store.set(key, {
      key,
      createdAt: new Date().toISOString(),
      status: 'Processing',
    });
    return true;
  }

  public static releaseLock(key: string): void {
    IdempotencyStore.activeLocks.delete(key);
  }

  public static markCompleted(key: string, responsePayload?: any): void {
    IdempotencyStore.activeLocks.delete(key);
    const existing = IdempotencyStore.store.get(key);
    if (existing) {
      existing.status = 'Completed';
      existing.responsePayload = responsePayload;
    }
  }

  public static markFailed(key: string): void {
    IdempotencyStore.activeLocks.delete(key);
    IdempotencyStore.store.delete(key);
  }

  public static getRecord(key: string): IdempotencyRecord | undefined {
    return IdempotencyStore.store.get(key);
  }
}
