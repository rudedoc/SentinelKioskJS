import type { Logger } from 'winston';
import type { SerialAdapterConfig, BillValidatorState } from '@kioskos/shared-types';
import { HardwareAdapter } from '../../HardwareAdapter';

/**
 * Abstract base for all bill validator adapters.
 *
 * Subclasses must emit the following typed events:
 * - 'bill:inserted' (BillEvent)
 * - 'bill:stacked' (BillEvent)
 * - 'bill:rejected' (BillEvent)
 * - 'bill:returned' (BillEvent)
 */
export abstract class BillValidatorAdapter extends HardwareAdapter<SerialAdapterConfig> {
  readonly category = 'bill-validator' as const;

  constructor(logger: Logger) {
    super(logger);
  }

  abstract enable(): Promise<void>;
  abstract disable(): Promise<void>;
  abstract returnBill(): Promise<void>;
  abstract getValidatorState(): BillValidatorState;
}
