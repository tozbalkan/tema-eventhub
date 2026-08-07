import { PoolClient } from 'pg';
import { PgPool } from './PgPool';

/**
 * PostgreSQL UnitOfWork Transaction Boundary.
 * Guarantees atomicity across aggregate writes and outbox message insertions.
 * If work succeeds -> COMMIT. If work throws -> ROLLBACK.
 */
export class UnitOfWork {
  public static async execute<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = PgPool.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
