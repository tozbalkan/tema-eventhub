import { PoolClient } from 'pg';
import { IdGenerator } from '@/platform/IdGenerator';

export interface InitAdmissionRightDTO {
  assetId: string;
  saleId: string;
  reservationId?: string;
  purchaserName?: string;
  maxCapacityPax: number;
}

export interface ProcessGateScanDTO {
  assetId: string;
  scanReference?: string;
}

export interface GateScanResult {
  assetId: string;
  alreadyAdmittedCount: number;
  maxCapacityPax: number;
  isAllowed: boolean;
  isDuplicateScan: boolean;
}

export class AdmissionService {
  /**
   * Initializes admission rights for a sold asset projection in PostgreSQL.
   * Transaction Contract: Must be invoked inside an active UnitOfWork transaction block (`PoolClient`).
   */
  public static async initializeAdmissionRightPg(
    client: PoolClient,
    dto: InitAdmissionRightDTO
  ): Promise<void> {
    await client.query(
      `INSERT INTO admission_rights (
        asset_id, purchaser_name, is_allowed, sale_id, reservation_id, already_admitted_count, max_capacity_pax, version, created_at, updated_at
       ) VALUES ($1, $2, TRUE, $3, $4, 0, $5, 1, NOW(), NOW())
       ON CONFLICT (asset_id) DO UPDATE SET
        purchaser_name = EXCLUDED.purchaser_name,
        is_allowed = TRUE,
        sale_id = EXCLUDED.sale_id,
        reservation_id = EXCLUDED.reservation_id,
        max_capacity_pax = EXCLUDED.max_capacity_pax,
        version = admission_rights.version + 1,
        updated_at = NOW();`,
      [dto.assetId, dto.purchaserName || 'Unspecified Purchaser', dto.saleId, dto.reservationId || null, dto.maxCapacityPax]
    );
  }

  /**
   * Processes a gate scan in PostgreSQL with atomic SQL boundary enforcement and duplicate scan reference deduplication.
   * Transaction Contract: Must be invoked inside an active UnitOfWork transaction block (`PoolClient`).
   */
  public static async processGateScanPg(
    client: PoolClient,
    dto: ProcessGateScanDTO
  ): Promise<GateScanResult> {
    // 1. Check duplicate scan reference if scanReference is provided
    if (dto.scanReference) {
      const scanId = IdGenerator.generateUUIDv7();
      const insertScanRes = await client.query(
        `INSERT INTO admission_scans (id, asset_id, scan_reference, scanned_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (scan_reference) DO NOTHING
         RETURNING id;`,
        [scanId, dto.assetId, dto.scanReference]
      );

      if (insertScanRes.rows.length === 0) {
        // Duplicate scan reference detected! Return current admission state without incrementing count.
        const currentRes = await client.query(
          `SELECT * FROM admission_rights WHERE asset_id = $1`,
          [dto.assetId]
        );
        if (currentRes.rows.length === 0) {
          throw new Error(`ADMISSION_NOT_FOUND: Admission right not found for asset ${dto.assetId}`);
        }
        const row = currentRes.rows[0];
        return {
          assetId: row.asset_id,
          alreadyAdmittedCount: row.already_admitted_count,
          maxCapacityPax: row.max_capacity_pax,
          isAllowed: row.is_allowed,
          isDuplicateScan: true,
        };
      }
    }

    // 2. Lock admission right row for update & check constraints
    const arRes = await client.query(
      `SELECT * FROM admission_rights WHERE asset_id = $1 FOR UPDATE`,
      [dto.assetId]
    );

    if (arRes.rows.length === 0) {
      throw new Error(`ADMISSION_NOT_FOUND: Admission right not found for asset ${dto.assetId}`);
    }

    const row = arRes.rows[0];

    if (!row.is_allowed) {
      throw new Error(`ADMISSION_DENIED: Admission right is disabled for asset ${dto.assetId}`);
    }

    if (row.already_admitted_count >= row.max_capacity_pax) {
      throw new Error(`CAPACITY_EXCEEDED: Maximum PAX capacity (${row.max_capacity_pax}) reached for asset ${dto.assetId}`);
    }

    // 3. Atomic increment with SQL boundary guard
    const updateRes = await client.query(
      `UPDATE admission_rights
       SET already_admitted_count = already_admitted_count + 1,
           version = version + 1,
           updated_at = NOW()
       WHERE asset_id = $1
         AND is_allowed = TRUE
         AND already_admitted_count < max_capacity_pax
       RETURNING *;`,
      [dto.assetId]
    );

    if (updateRes.rows.length === 0) {
      throw new Error(`CAPACITY_EXCEEDED: Maximum PAX capacity reached for asset ${dto.assetId}`);
    }

    const updatedRow = updateRes.rows[0];

    return {
      assetId: updatedRow.asset_id,
      alreadyAdmittedCount: updatedRow.already_admitted_count,
      maxCapacityPax: updatedRow.max_capacity_pax,
      isAllowed: updatedRow.is_allowed,
      isDuplicateScan: false,
    };
  }

  /**
   * Toggles `is_allowed` state of an admission right in PostgreSQL mode.
   * Transaction Contract: Must be invoked inside an active UnitOfWork transaction block (`PoolClient`).
   */
  public static async toggleAdmissionRightPg(
    client: PoolClient,
    assetId: string,
    isAllowed: boolean
  ): Promise<void> {
    const res = await client.query(
      `UPDATE admission_rights
       SET is_allowed = $1, version = version + 1, updated_at = NOW()
       WHERE asset_id = $2;`,
      [isAllowed, assetId]
    );

    if (res.rowCount === 0) {
      throw new Error(`ADMISSION_NOT_FOUND: Admission right not found for asset ${assetId}`);
    }
  }
}
