import { AdmissionRightsProjection } from '../../projections/AdmissionRightsProjection';

export type AdmissionOutcome =
  | 'Granted'
  | 'Denied'
  | 'AlreadyAdmitted'
  | 'ReservationExpired'
  | 'WrongVenue'
  | 'Blocked';

export interface AdmissionDecision {
  outcome: AdmissionOutcome;
  code: string;
  message: string;
  auditReason: 'ADMISSION_SUCCESS' | 'NO_VALID_PURCHASE' | 'CAPACITY_EXCEEDED' | 'RESERVATION_EXPIRED' | 'BLOCKED_CUSTOMER';
  retryAllowed: boolean;
  assetId: string;
}

export class AdmissionPolicy {
  public static evaluate(assetId: string): AdmissionDecision {
    const right = AdmissionRightsProjection.getRight(assetId);

    if (!right || !right.isAllowed) {
      return {
        outcome: 'Denied',
        code: 'NO_VALID_PURCHASE',
        message: 'Bu alan için geçerli bir satış veya konfirme edilmiş opsiyon bulunamadı.',
        auditReason: 'NO_VALID_PURCHASE',
        retryAllowed: true,
        assetId,
      };
    }

    if (right.alreadyAdmittedCount >= right.maxCapacityPax) {
      return {
        outcome: 'AlreadyAdmitted',
        code: 'CAPACITY_EXCEEDED',
        message: `Masa kapasitesi doldu (${right.alreadyAdmittedCount}/${right.maxCapacityPax} Pax).`,
        auditReason: 'CAPACITY_EXCEEDED',
        retryAllowed: false,
        assetId,
      };
    }

    return {
      outcome: 'Granted',
      code: 'ADMISSION_SUCCESS',
      message: `Kapı girişi onaylandı (${right.purchaserName}).`,
      auditReason: 'ADMISSION_SUCCESS',
      retryAllowed: false,
      assetId,
    };
  }
}
