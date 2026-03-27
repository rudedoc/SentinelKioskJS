import type { Logger } from 'winston';
import type {
  SerialAdapterConfig,
  USBAdapterConfig,
  NetworkAdapterConfig,
  ReceiptData,
  PrintResult,
  PrinterStatus,
} from '@kioskos/shared-types';
import { HardwareAdapter } from '../../HardwareAdapter';

export type PrinterConfig = SerialAdapterConfig | USBAdapterConfig | NetworkAdapterConfig;

export abstract class PrinterAdapter extends HardwareAdapter<PrinterConfig> {
  readonly category = 'printer' as const;

  constructor(logger: Logger) {
    super(logger);
  }

  abstract printReceipt(data: ReceiptData): Promise<PrintResult>;
  abstract openCashDrawer(): Promise<void>;
  abstract cutPaper(): Promise<void>;
  abstract getPrinterStatus(): PrinterStatus;
}
