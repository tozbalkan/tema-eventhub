export interface AdmissionRightRecord {
  assetId: string;
  purchaserName: string;
  isAllowed: boolean;
  saleId?: string;
  reservationId?: string;
  alreadyAdmittedCount: number;
  maxCapacityPax: number;
}

export class AdmissionRightsProjection {
  private static rightsMap: Map<string, AdmissionRightRecord> = new Map();

  public static setRight(record: AdmissionRightRecord): void {
    AdmissionRightsProjection.rightsMap.set(record.assetId, record);
  }

  public static getRight(assetId: string): AdmissionRightRecord | undefined {
    return AdmissionRightsProjection.rightsMap.get(assetId);
  }

  public static recordAdmission(assetId: string): void {
    const right = AdmissionRightsProjection.getRight(assetId);
    if (right) {
      right.alreadyAdmittedCount += 1;
    }
  }
}
