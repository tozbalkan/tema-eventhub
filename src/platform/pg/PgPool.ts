import { Pool } from 'pg';

/**
 * PostgreSQL Connection Pool Wrapper.
 * Reads DATABASE_URL from process.env.
 */
export class PgPool {
  private static instance: Pool | null = null;

  public static getPool(): Pool {
    if (!PgPool.instance) {
      const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:stageops@localhost:5432/stageops';
      PgPool.instance = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }
    return PgPool.instance;
  }

  public static async closePool(): Promise<void> {
    if (PgPool.instance) {
      await PgPool.instance.end();
      PgPool.instance = null;
    }
  }
}
