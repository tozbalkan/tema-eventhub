import { PoolClient } from 'pg';
import { PgPool } from './PgPool';

export class UnitOfWork {
  public static async execute<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await PgPool.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve original error if ROLLBACK itself fails due to connection drop
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
