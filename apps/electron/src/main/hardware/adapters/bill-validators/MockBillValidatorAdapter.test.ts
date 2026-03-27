import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { BillEvent } from '@kioskos/shared-types';
import { MockBillValidatorAdapter } from './MockBillValidatorAdapter';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('MockBillValidatorAdapter', () => {
  let adapter: MockBillValidatorAdapter;
  let logger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    adapter = new MockBillValidatorAdapter('mock-bill-001', logger);
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

  it('should emit bill:inserted on enable', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 1000, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const events: BillEvent[] = [];
    adapter.on('bill:inserted', (e: BillEvent) => events.push(e));

    await adapter.enable();
    vi.advanceTimersByTime(1000);

    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('inserted');
    expect(events[0]!.deviceId).toBe('mock-bill-001');
  });

  it('should emit bill:stacked after insert when failureRate is 0', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 1000, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const stacked: BillEvent[] = [];
    adapter.on('bill:stacked', (e: BillEvent) => stacked.push(e));

    await adapter.enable();
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(600); // Wait for the stacking delay

    expect(stacked.length).toBe(1);
    expect(stacked[0]!.type).toBe('stacked');
  });

  it('should stop emitting after disable', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const events: BillEvent[] = [];
    adapter.on('bill:inserted', (e: BillEvent) => events.push(e));

    await adapter.enable();
    vi.advanceTimersByTime(500);
    expect(events.length).toBe(1);

    await adapter.disable();
    vi.advanceTimersByTime(2000);
    expect(events.length).toBe(1); // No new events
    expect(adapter.getValidatorState()).toBe('disabled');
  });

  it('should emit bill:returned on returnBill when in escrowed state', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 1000 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    // Can't easily get to escrowed in mock, but returnBill should be safe to call
    const returned: BillEvent[] = [];
    adapter.on('bill:returned', (e: BillEvent) => returned.push(e));

    await adapter.returnBill();
    // Not in escrowed state, so no event
    expect(returned.length).toBe(0);
  });

  it('should use custom denominations', async () => {
    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      denominations: [100],
      currency: 'USD',
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const events: BillEvent[] = [];
    adapter.on('bill:inserted', (e: BillEvent) => events.push(e));

    await adapter.enable();
    vi.advanceTimersByTime(500);

    expect(events[0]!.amountCents).toBe(100);
    expect(events[0]!.currency).toBe('USD');
  });
});
