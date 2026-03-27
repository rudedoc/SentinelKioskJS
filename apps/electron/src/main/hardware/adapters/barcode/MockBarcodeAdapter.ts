import type { Logger } from 'winston';
import type { BarcodeEvent, MockAdapterOptions, USBAdapterConfig } from '@kioskos/shared-types';
import { BarcodeAdapter } from './BarcodeAdapter';

const DEFAULT_INTERVAL_MS = 12000;
const SAMPLE_BARCODES = [
  { value: '4006381333931', format: 'EAN13' },
  { value: '012345678905', format: 'UPC-A' },
  { value: 'KIOSK-TICKET-001', format: 'CODE128' },
  { value: 'https://example.com/order/12345', format: 'QR' },
  { value: '978-3-16-148410-0', format: 'EAN13' },
];

export interface MockBarcodeConfig extends USBAdapterConfig {
  mockOptions?: MockAdapterOptions;
}

export class MockBarcodeAdapter extends BarcodeAdapter {
  readonly manufacturer = 'Mock';
  readonly model = 'MockBarcode';
  readonly deviceId: string;

  private interval: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private listening = false;

  constructor(deviceId: string, logger: Logger) {
    super(logger);
    this.deviceId = deviceId;
    this.intervalMs = DEFAULT_INTERVAL_MS;
  }

  async connect(config: MockBarcodeConfig): Promise<void> {
    this.setConnectionState('connecting');
    this.intervalMs = config.mockOptions?.simulationIntervalMs ?? DEFAULT_INTERVAL_MS;

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    this.setConnectionState('connected');
    this.logger.info('Mock barcode scanner connected', { deviceId: this.deviceId });
  }

  async disconnect(): Promise<void> {
    await this.stopListening();
    this.setConnectionState('disconnected');
  }

  async startListening(): Promise<void> {
    this.listening = true;
    this.stopInterval();
    this.interval = setInterval(() => {
      if (!this.listening) return;
      this.simulateBarcodeScan();
    }, this.intervalMs);
    this.logger.info('Mock barcode listening started', { deviceId: this.deviceId });
  }

  async stopListening(): Promise<void> {
    this.listening = false;
    this.stopInterval();
    this.logger.info('Mock barcode listening stopped', { deviceId: this.deviceId });
  }

  private stopInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private simulateBarcodeScan(): void {
    const sample = SAMPLE_BARCODES[Math.floor(Math.random() * SAMPLE_BARCODES.length)]!;
    const event: BarcodeEvent = {
      type: 'scanned',
      value: sample.value,
      format: sample.format,
      deviceId: this.deviceId,
      timestamp: new Date().toISOString(),
    };
    this.emit('barcode:scanned', event);
  }
}
