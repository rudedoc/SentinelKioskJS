import type { Logger } from 'winston';
import type { USBAdapterConfig } from '@kioskos/shared-types';
import { HardwareAdapter } from '../../HardwareAdapter';

/**
 * Abstract base for all NFC reader adapters.
 *
 * Subclasses must emit the following typed events:
 * - 'nfc:read' (NFCEvent)
 * - 'nfc:removed' (NFCEvent)
 */
export abstract class NFCAdapter extends HardwareAdapter<USBAdapterConfig> {
  readonly category = 'nfc' as const;

  constructor(logger: Logger) {
    super(logger);
  }

  abstract startPolling(): Promise<void>;
  abstract stopPolling(): Promise<void>;
}
