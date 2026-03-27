import type { Logger } from 'winston';
import type { USBAdapterConfig } from '@kioskos/shared-types';
import { HardwareAdapter } from '../../HardwareAdapter';

/**
 * Abstract base for all barcode scanner adapters.
 *
 * Subclasses must emit the following typed events:
 * - 'barcode:scanned' (BarcodeEvent)
 */
export abstract class BarcodeAdapter extends HardwareAdapter<USBAdapterConfig> {
  readonly category = 'barcode' as const;

  constructor(logger: Logger) {
    super(logger);
  }

  abstract startListening(): Promise<void>;
  abstract stopListening(): Promise<void>;
}
