'use server';

import {
  ProcessExternalSaleConfirmationUseCase,
  ProcessExternalSaleConfirmationDTO,
  ProcessExternalSaleConfirmationResult,
} from '@/services/ProcessExternalSaleConfirmationUseCase';

export async function processExternalSaleConfirmationAction(
  dto: ProcessExternalSaleConfirmationDTO
): Promise<ProcessExternalSaleConfirmationResult> {
  return ProcessExternalSaleConfirmationUseCase.execute(dto);
}
