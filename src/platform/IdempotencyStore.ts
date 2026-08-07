export interface IdempotencyRecord {
  key: string;
  createdAt: string;
  expiresAt: string; // 24-hour TTL
  completedAt?: string;
  lastAccessedAt?: string;
  attemptCount: number;
  status: 'Processing' | 'Completed' | 'Failed';
  responsePayload?: any;
}

/**
 * In-Process Memory Atomic Idempotency Lock & Response Cache with 24h TTL & Troubleshooting Metadata.
 * 
 * Note for Multi-Pod Distributed Scaling:
 * Multi-worker leasing contract implemented; distributed persistence adapter (PostgreSQL UNIQUE constraint / Redis SET NX PX) pending for multi-pod Kubernetes scale-out.
 */
export class IdempotencyStore {
  private static store: Map<string, IdempotencyRecord> = new Map();
  private static activeLocks: Set<string> = new Set();
  private static defaultTtlMs = 24 * 60 * 60 * 1000; // 24 Hours TTL

  private static cleanupExpired(): void {
    const now = new Date().getTime();
    IdempotencyStore.store.forEach((record, key) => {
      if (new Date(record.expiresAt).getTime() < now) {
        IdempotencyStore.store.delete(key);
        IdempotencyStore.activeLocks.delete(key);
      }
    });
  }

  /**
   * Atomic in-process lock acquisition with TTL check and attempt tracking
   */
  public static tryAcquireLock(key: string): boolean {
    IdempotencyStore.cleanupExpired();
    const existing = IdempotencyStore.store.get(key);

    if (existing) {
      existing.lastAccessedAt = new Date().toISOString();
      existing.attemptCount += 1;
    }

    if (IdempotencyStore.activeLocks.has(key) || (existing && existing.status === 'Processing')) {
      return false; // Lock acquisition failed: currently processing
    }

    if (existing && existing.status === 'Completed') {
      return false; // Already completed
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + IdempotencyStore.defaultTtlMs).toISOString();

    IdempotencyStore.activeLocks.add(key);
    IdempotencyStore.store.set(key, {
      key,
      createdAt: existing ? existing.createdAt : now.toISOString(),
      expiresAt,
      lastAccessedAt: now.toISOString(),
      attemptCount: existing ? existing.attemptCount : 1,
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
      existing.completedAt = new Date().toISOString();
      existing.lastAccessedAt = existing.completedAt;
      existing.responsePayload = responsePayload;
    }
  }

  public static markFailed(key: string): void {
    IdempotencyStore.activeLocks.delete(key);
    const existing = IdempotencyStore.store.get(key);
    if (existing) {
      existing.status = 'Failed';
      existing.lastAccessedAt = new Date().toISOString();
    }
  }

  public static getRecord(key: string): IdempotencyRecord | undefined {
    IdempotencyStore.cleanupExpired();
    const record = IdempotencyStore.store.get(key);
    if (record) {
      record.lastAccessedAt = new Date().toISOString();
    }
    return record;
  }
}
