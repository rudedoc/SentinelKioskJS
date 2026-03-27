import type { Logger } from 'winston';
import type { CoinEvent, CoinValidatorState, MockAdapterOptions } from '@kioskos/shared-types';
import { CoinValidatorAdapter } from './CoinValidatorAdapter';

const DEFAULT_DENOMINATIONS = [5, 10, 20, 50, 100, 200];
const DEFAULT_INTERVAL_MS = 8000;
const DEFAULT_FAILURE_RATE = 0.05;

export interface MockCoinValidatorConfig {
  port: string;
  baudRate: number;
  denominations?: number[];
  currency?: string;
  mockOptions?: MockAdapterOptions;
}

export class MockCoinValidatorAdapter extends CoinValidatorAdapter {
  readonly manufacturer = 'Mock';
  readonly model = 'MockCoinValidator';
  readonly deviceId: string;

  private interval: ReturnType<typeof setInterval> | null = null;
  private denominations: number[];
  private currency: string;
  private failureRate: number;
  private intervalMs: number;
  private enabled = false;
  private validatorState: CoinValidatorState = 'disabled';

  constructor(deviceId: string, logger: Logger) {
    super(logger);
    this.deviceId = deviceId;
    this.denominations = DEFAULT_DENOMINATIONS;
    this.currency = 'EUR';
    this.failureRate = DEFAULT_FAILURE_RATE;
    this.intervalMs = DEFAULT_INTERVAL_MS;
  }

  async connect(config: MockCoinValidatorConfig): Promise<void> {
    this.setConnectionState('connecting');
    this.denominations = config.denominations ?? DEFAULT_DENOMINATIONS;
    this.currency = config.currency ?? 'EUR';
    this.failureRate = config.mockOptions?.failureRate ?? DEFAULT_FAILURE_RATE;
    this.intervalMs = config.mockOptions?.simulationIntervalMs ?? DEFAULT_INTERVAL_MS;

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    this.setConnectionState('connected');
    this.validatorState = 'idle';
    this.logger.info('Mock coin validator connected', { deviceId: this.deviceId });
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
    this.logger.info('Mock coin validator enabled', { deviceId: this.deviceId });
  }

  async disable(): Promise<void> {
    this.enabled = false;
    this.validatorState = 'disabled';
    this.stopSimulation();
    this.logger.info('Mock coin validator disabled', { deviceId: this.deviceId });
  }

  getValidatorState(): CoinValidatorState {
    return this.validatorState;
  }

  private startSimulation(): void {
    this.stopSimulation();
    this.interval = setInterval(() => {
      if (!this.enabled) return;
      this.simulateCoinInsert();
    }, this.intervalMs);
  }

  private stopSimulation(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private simulateCoinInsert(): void {
    const denomination = this.denominations[Math.floor(Math.random() * this.denominations.length)]!;

    if (Math.random() < this.failureRate) {
      const rejectEvent: CoinEvent = {
        type: 'rejected',
        amountCents: denomination,
        currency: this.currency,
        deviceId: this.deviceId,
        timestamp: new Date().toISOString(),
        reason: 'Mock rejection',
      };
      this.emit('coin:rejected', rejectEvent);
    } else {
      const insertEvent: CoinEvent = {
        type: 'inserted',
        amountCents: denomination,
        currency: this.currency,
        deviceId: this.deviceId,
        timestamp: new Date().toISOString(),
      };
      this.emit('coin:inserted', insertEvent);
    }
  }
}
