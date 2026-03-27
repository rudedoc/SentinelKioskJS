import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { CoinEvent } from '@kioskos/shared-types';
import { MockCoinValidatorAdapter } from './MockCoinValidatorAdapter';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('MockCoinValidatorAdapter', () => {
  let adapter: MockCoinValidatorAdapter;
  let logger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    adapter = new MockCoinValidatorAdapter('mock-coin-001', logger);
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.useRealTimers();
  });

  it('should connect and set state to connected', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 1000 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    expect(adapter.getConnectionState()).toBe('connected');
    expect(adapter.getValidatorState()).toBe('idle');
  });

  it('should emit coin:inserted on enable with failureRate 0', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const events: CoinEvent[] = [];
    adapter.on('coin:inserted', (e: CoinEvent) => events.push(e));

    await adapter.enable();
    vi.advanceTimersByTime(500);

    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('inserted');
    expect(events[0]!.deviceId).toBe('mock-coin-001');
  });

  it('should stop emitting after disable', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const events: CoinEvent[] = [];
    adapter.on('coin:inserted', (e: CoinEvent) => events.push(e));

    await adapter.enable();
    vi.advanceTimersByTime(500);
    expect(events.length).toBe(1);

    await adapter.disable();
    vi.advanceTimersByTime(2000);
    expect(events.length).toBe(1);
    expect(adapter.getValidatorState()).toBe('disabled');
  });

  it('should use custom denominations and currency', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      denominations: [50],
      currency: 'GBP',
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const events: CoinEvent[] = [];
    adapter.on('coin:inserted', (e: CoinEvent) => events.push(e));

    await adapter.enable();
    vi.advanceTimersByTime(500);

    expect(events[0]!.amountCents).toBe(50);
    expect(events[0]!.currency).toBe('GBP');
  });
});
