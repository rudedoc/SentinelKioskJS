import type { Logger } from 'winston';
import type {
  ReceiptData,
  PrintResult,
  PrinterStatus,
  MockAdapterOptions,
  SerialAdapterConfig,
} from '@kioskos/shared-types';
import { PrinterAdapter } from './PrinterAdapter';

const DEFAULT_FAILURE_RATE = 0;

export interface MockPrinterConfig extends SerialAdapterConfig {
  mockOptions?: MockAdapterOptions;
}

export class MockPrinterAdapter extends PrinterAdapter {
  readonly manufacturer = 'Mock';
  readonly model = 'MockPrinter';
  readonly deviceId: string;

  private failureRate: number;
  private paperLow = false;
  private coverOpen = false;

  constructor(deviceId: string, logger: Logger) {
    super(logger);
    this.deviceId = deviceId;
    this.failureRate = DEFAULT_FAILURE_RATE;
  }

  async connect(config: MockPrinterConfig): Promise<void> {
    this.setConnectionState('connecting');
    this.failureRate = config.mockOptions?.failureRate ?? DEFAULT_FAILURE_RATE;

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    this.setConnectionState('connected');
    this.logger.info('Mock printer connected', { deviceId: this.deviceId });
  }

  async disconnect(): Promise<void> {
    this.setConnectionState('disconnected');
  }

  async printReceipt(data: ReceiptData): Promise<PrintResult> {
    if (this.connectionState !== 'connected') {
      return { success: false, errorMessage: 'Printer not connected' };
    }

    if (Math.random() < this.failureRate) {
      this.logger.warn('Mock print failed (simulated)', { deviceId: this.deviceId });
      return { success: false, errorMessage: 'Simulated print failure' };
    }

    this.logger.info('Mock printing receipt', {
      deviceId: this.deviceId,
      lines: data.lines.length,
    });

    // Simulate print time
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    if (data.cutAfter) {
      await this.cutPaper();
    }
    if (data.openDrawer) {
      await this.openCashDrawer();
    }

    return { success: true };
  }

  async openCashDrawer(): Promise<void> {
    this.logger.info('Mock cash drawer opened', { deviceId: this.deviceId });
  }

  async cutPaper(): Promise<void> {
    this.logger.info('Mock paper cut', { deviceId: this.deviceId });
  }

  getPrinterStatus(): PrinterStatus {
    return {
      paperLow: this.paperLow,
      coverOpen: this.coverOpen,
      errorState: null,
    };
  }
}
