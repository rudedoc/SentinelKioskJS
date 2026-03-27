import type { Logger } from 'winston';
import type { SerialAdapterConfig, CoinValidatorState } from '@kioskos/shared-types';
import { HardwareAdapter } from '../../HardwareAdapter';

/**
 * Abstract base for all coin validator adapters.
 *
 * Subclasses must emit the following typed events:
 * - 'coin:inserted' (CoinEvent)
 * - 'coin:rejected' (CoinEvent)
 */
export abstract class CoinValidatorAdapter extends HardwareAdapter<SerialAdapterConfig> {
  readonly category = 'coin-validator' as const;

  constructor(logger: Logger) {
    super(logger);
  }

  abstract enable(): Promise<void>;
  abstract disable(): Promise<void>;
  abstract getValidatorState(): CoinValidatorState;
}
