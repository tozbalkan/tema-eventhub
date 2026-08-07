import { PoolClient } from 'pg';

export interface ProcessIdempotentlyResult<T> {
  executed: boolean;
  result?: T;
}

/**
 * PostgreSQL Atomic Consumer Idempotency Store.
 * 
 * Guarantees that the consumer idempotency claim (INSERT INTO processed_events ON CONFLICT DO NOTHING)
 * and the business mutation (e.g. INSERT INTO accounting_entries or UPDATE venue_asset_projections)
 * execute within the EXACT SAME database transaction (PoolClient).
 * 
 * If the business mutation throws an error, the transaction ROLLBACK undoes both
 * the idempotency record and the business mutation, allowing future retries to succeed.
 */
export class PgConsumerIdempotencyStore {
  public static async processIdempotently<T>(
    client: PoolClient,
    eventId: string,
    consumerName: string,
    businessMutation: (client: PoolClient) => Promise<T>
  ): Promise<ProcessIdempotentlyResult<T>> {
    const query = `
      INSERT INTO processed_events (event_id, consumer_name)
      VALUES ($1, $2)
      ON CONFLICT (event_id, consumer_name) DO NOTHING;
    `;
    const res = await client.query(query, [eventId, consumerName]);

    if ((res.rowCount ?? 0) === 0) {
      // Duplicate event for this consumer — safely skip business mutation
      return { executed: false };
    }

    // Execute business mutation within the same transaction client
    const result = await businessMutation(client);
    return { executed: true, result };
  }

  public static async isProcessed(client: PoolClient, eventId: string, consumerName: string): Promise<boolean> {
    const res = await client.query(
      'SELECT 1 FROM processed_events WHERE event_id = $1 AND consumer_name = $2',
      [eventId, consumerName]
    );
    return res.rows.length > 0;
  }
}
