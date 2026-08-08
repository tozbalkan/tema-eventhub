import type { PoolClient } from 'pg';
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
   * Initializes or updates an admission_rights record for a sold asset.
   * Executed within an active PoolClient transaction block.
   *
   * Note: On conflict (re-delivery or update), existing is_allowed status is preserved
   * to prevent re-enabling revoked entry rights.
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
        sale_id = EXCLUDED.sale_id,
        reservation_id = EXCLUDED.reservation_id,
        max_capacity_pax = EXCLUDED.max_capacity_pax,
        version = admission_rights.version + 1,
        updated_at = NOW();`,
      [
        dto.assetId,
        dto.purchaserName || null,
        dto.saleId,
        dto.reservationId || null,
        dto.maxCapacityPax,
      ]
    );
  }

  /**
   * Atomically processes a gate scan for an asset within an active PoolClient transaction.
   *
   * Transaction Atomicity & Idempotency Guarantee:
   * 1. Scan reference registration (admission_scans) and admission count increment (admission_rights)
   *    MUST execute inside the SAME active transaction block.
   * 2. Scan references are deduplicated per asset via composite UNIQUE (asset_id, scan_reference).
   * 3. Row locking (FOR UPDATE) serializes concurrent scans.
   * 4. SQL boundary guards and DB CHECK constraints prevent capacity overspills.
   */
  public static async processGateScanPg(
    client: PoolClient,
    dto: ProcessGateScanDTO
  ): Promise<GateScanResult> {
    // 1. If scanReference is supplied, register it FIRST inside the active transaction block
    if (dto.scanReference) {
      const scanId = IdGenerator.generateUUIDv7();
      const insertScanRes = await client.query(
        `INSERT INTO admission_scans (id, asset_id, scan_reference, scanned_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (asset_id, scan_reference) DO NOTHING
         RETURNING id;`,
        [scanId, dto.assetId, dto.scanReference]
      );

      // Duplicate scan detected within the SAME transaction -> return cached state without incrementing
      if (insertScanRes.rows.length === 0) {
        const arRes = await client.query(
          `SELECT asset_id, already_admitted_count, max_capacity_pax, is_allowed
           FROM admission_rights
           WHERE asset_id = $1;`,
          [dto.assetId]
        );

        if (arRes.rows.length === 0) {
          throw new Error(`ADMISSION_RIGHT_NOT_FOUND: No admission right registered for asset ${dto.assetId}`);
        }

        const row = arRes.rows[0];
        return {
          assetId: row.asset_id,
          alreadyAdmittedCount: row.already_admitted_count,
          maxCapacityPax: row.max_capacity_pax,
          isAllowed: row.is_allowed,
          isDuplicateScan: true,
        };
      }
    }

    // 2. Lock admission_rights row for atomic check & increment
    const arLockRes = await client.query(
      `SELECT asset_id, already_admitted_count, max_capacity_pax, is_allowed
       FROM admission_rights
       WHERE asset_id = $1
       FOR UPDATE;`,
      [dto.assetId]
    );

    if (arLockRes.rows.length === 0) {
      throw new Error(`ADMISSION_RIGHT_NOT_FOUND: No admission right registered for asset ${dto.assetId}`);
    }

    const currentRight = arLockRes.rows[0];

    // 3. Check is_allowed guard
    if (!currentRight.is_allowed) {
      throw new Error(`ADMISSION_DENIED: Admission right for asset ${dto.assetId} is disabled or revoked.`);
    }

    // 4. Check capacity boundary
    if (currentRight.already_admitted_count >= currentRight.max_capacity_pax) {
      throw new Error(
        `CAPACITY_EXCEEDED: Asset ${dto.assetId} capacity limit (${currentRight.max_capacity_pax} PAX) reached.`
      );
    }

    // 5. Execute guarded atomic increment
    const updateRes = await client.query(
      `UPDATE admission_rights
       SET already_admitted_count = already_admitted_count + 1,
           version = version + 1,
           updated_at = NOW()
       WHERE asset_id = $1
         AND is_allowed = TRUE
         AND already_admitted_count < max_capacity_pax
       RETURNING asset_id, already_admitted_count, max_capacity_pax, is_allowed;`,
      [dto.assetId]
    );

    if (updateRes.rows.length === 0) {
      throw new Error(`CAPACITY_EXCEEDED: Concurrent scan filled remaining capacity for asset ${dto.assetId}.`);
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
   * Toggles admission rights permission (is_allowed = true / false).
   */
  public static async toggleAdmissionRightPg(
    client: PoolClient,
    assetId: string,
    isAllowed: boolean
  ): Promise<void> {
    const res = await client.query(
      `UPDATE admission_rights
       SET is_allowed = $2,
           version = version + 1,
           updated_at = NOW()
       WHERE asset_id = $1;`,
      [assetId, isAllowed]
    );

    if (res.rowCount === 0) {
      throw new Error(`ADMISSION_RIGHT_NOT_FOUND: Cannot toggle non-existent admission right for asset ${assetId}`);
    }
  }
}
