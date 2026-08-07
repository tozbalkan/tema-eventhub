import { InMemoryEventBus } from './EventBus';
import { OperationsSaleRecordedHandler } from '@/operations/application/handlers/OperationsSaleRecordedHandler';
import { AccountingSaleRecordedHandler } from '@/accounting/application/handlers/AccountingSaleRecordedHandler';

/**
 * StageOps Application Composition Root / Bootstrap
 * Registers all Bounded Context Event Handlers once at application startup.
 */
let isInitialized = false;

export function bootstrapStageOpsApplication(): void {
  if (isInitialized) return;

  const eventBus = InMemoryEventBus.getInstance();
  eventBus.subscribe('SaleRecorded', OperationsSaleRecordedHandler.handle);
  eventBus.subscribe('SaleRecorded', AccountingSaleRecordedHandler.handle);

  isInitialized = true;
}
