import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { NFCEvent } from '@kioskos/shared-types';
import { MockNFCAdapter } from './MockNFCAdapter';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('MockNFCAdapter', () => {
  let adapter: MockNFCAdapter;
  let logger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    adapter = new MockNFCAdapter('mock-nfc-001', logger);
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.useRealTimers();
  });

  it('should connect successfully', async () => {
    const connectPromise = adapter.connect({
      vendorId: 0x1234,
      productId: 0x5678,
      mockOptions: { simulationIntervalMs: 1000 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    expect(adapter.getConnectionState()).toBe('connected');
  });

  it('should emit nfc:read when polling', async () => {
    const connectPromise = adapter.connect({
      vendorId: 0x1234,
      productId: 0x5678,
      mockOptions: { simulationIntervalMs: 500 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const reads: NFCEvent[] = [];
    adapter.on('nfc:read', (e: NFCEvent) => reads.push(e));

    await adapter.startPolling();
    vi.advanceTimersByTime(500);

    expect(reads.length).toBe(1);
    expect(reads[0]!.type).toBe('read');
    expect(reads[0]!.uid).toBeTruthy();
    expect(reads[0]!.deviceId).toBe('mock-nfc-001');
  });

  it('should emit nfc:removed after read', async () => {
    const connectPromise = adapter.connect({
      vendorId: 0x1234,
      productId: 0x5678,
      mockOptions: { simulationIntervalMs: 500 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const removed: NFCEvent[] = [];
    adapter.on('nfc:removed', (e: NFCEvent) => removed.push(e));

    await adapter.startPolling();
    vi.advanceTimersByTime(500); // Read fires
    vi.advanceTimersByTime(2000); // Remove fires

    expect(removed.length).toBe(1);
    expect(removed[0]!.type).toBe('removed');
  });

  it('should stop emitting after stopPolling', async () => {
    const connectPromise = adapter.connect({
      vendorId: 0x1234,
      productId: 0x5678,
      mockOptions: { simulationIntervalMs: 500 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const reads: NFCEvent[] = [];
    adapter.on('nfc:read', (e: NFCEvent) => reads.push(e));

    await adapter.startPolling();
    vi.advanceTimersByTime(500);
    expect(reads.length).toBe(1);

    await adapter.stopPolling();
    vi.advanceTimersByTime(2000);
    expect(reads.length).toBe(1);
  });
});
