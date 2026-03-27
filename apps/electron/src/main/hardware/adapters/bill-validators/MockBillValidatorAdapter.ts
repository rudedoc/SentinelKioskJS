import type { Logger } from 'winston';
import type { BillEvent, BillValidatorState, MockAdapterOptions } from '@kioskos/shared-types';
import { BillValidatorAdapter } from './BillValidatorAdapter';

const DEFAULT_DENOMINATIONS = [500, 1000, 2000, 5000, 10000];
const DEFAULT_INTERVAL_MS = 10000;
const DEFAULT_FAILURE_RATE = 0.1;

export interface MockBillValidatorConfig {
  port: string;
  baudRate: number;
  denominations?: number[];
  currency?: string;
  mockOptions?: MockAdapterOptions;
}

export class MockBillValidatorAdapter extends BillValidatorAdapter {
  readonly manufacturer = 'Mock';
  readonly model = 'MockBillValidator';
  readonly deviceId: string;

  private interval: ReturnType<typeof setInterval> | null = null;
  private denominations: number[];
  private currency: string;
  private failureRate: number;
  private intervalMs: number;
  private enabled = false;
  private validatorState: BillValidatorState = 'disabled';

  constructor(deviceId: string, logger: Logger) {
    super(logger);
    this.deviceId = deviceId;
    this.denominations = DEFAULT_DENOMINATIONS;
    this.currency = 'EUR';
    this.failureRate = DEFAULT_FAILURE_RATE;
    this.intervalMs = DEFAULT_INTERVAL_MS;
  }

  async connect(config: MockBillValidatorConfig): Promise<void> {
    this.setConnectionState('connecting');
    this.denominations = config.denominations ?? DEFAULT_DENOMINATIONS;
    this.currency = config.currency ?? 'EUR';
    this.failureRate = config.mockOptions?.failureRate ?? DEFAULT_FAILURE_RATE;
    this.intervalMs = config.mockOptions?.simulationIntervalMs ?? DEFAULT_INTERVAL_MS;

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    this.setConnectionState('connected');
    this.validatorState = 'idle';
    this.logger.info('Mock bill validator connected', { deviceId: this.deviceId });
  }

  async disconnect(): Promise<void> {
    this.stopSimulation();
    this.enabled = false;
    this.validatorState = 'disabled';
    this.setConnectionState('disconnected');
  }

  async enable(): Promise<void> {
    this.enabled = true;
    this.validatorState = 'accepting';
    this.startSimulation();
    this.logger.info('Mock bill validator enabled', { deviceId: this.deviceId });
  }

  async disable(): Promise<void> {
    this.enabled = false;
    this.validatorState = 'disabled';
    this.stopSimulation();
    this.logger.info('Mock bill validator disabled', { deviceId: this.deviceId });
  }

  async returnBill(): Promise<void> {
    if (this.validatorState === 'escrowed') {
      this.validatorState = 'returning';
      const event: BillEvent = {
        type: 'returned',
        amountCents: 0,
        currency: this.currency,
        deviceId: this.deviceId,
        timestamp: new Date().toISOString(),
      };
      this.emit('bill:returned', event);
      this.validatorState = 'accepting';
    }
  }

  getValidatorState(): BillValidatorState {
    return this.validatorState;
  }

  private startSimulation(): void {
    this.stopSimulation();
    this.interval = setInterval(() => {
      if (!this.enabled) return;
      this.simulateBillInsert();
    }, this.intervalMs);
  }

  private stopSimulation(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private simulateBillInsert(): void {
    const denomination = this.denominations[Math.floor(Math.random() * this.denominations.length)]!;

    const insertEvent: BillEvent = {
      type: 'inserted',
      amountCents: denomination,
      currency: this.currency,
      deviceId: this.deviceId,
      timestamp: new Date().toISOString(),
    };
    this.emit('bill:inserted', insertEvent);

    // Simulate reject or stack after a short delay
    setTimeout(() => {
      if (!this.enabled) return;

      if (Math.random() < this.failureRate) {
        const rejectEvent: BillEvent = {
          type: 'rejected',
          amountCents: denomination,
          currency: this.currency,
          deviceId: this.deviceId,
          timestamp: new Date().toISOString(),
          reason: 'Mock rejection',
        };
        this.emit('bill:rejected', rejectEvent);
      } else {
        const stackEvent: BillEvent = {
          type: 'stacked',
          amountCents: denomination,
          currency: this.currency,
          deviceId: this.deviceId,
          timestamp: new Date().toISOString(),
        };
        this.emit('bill:stacked', stackEvent);
      }
    }, 500);
  }
}
