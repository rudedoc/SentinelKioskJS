import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { BarcodeEvent } from '@kioskos/shared-types';
import { MockBarcodeAdapter } from './MockBarcodeAdapter';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('MockBarcodeAdapter', () => {
  let adapter: MockBarcodeAdapter;
  let logger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    adapter = new MockBarcodeAdapter('mock-barcode-001', logger);
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

  it('should emit barcode:scanned when listening', async () => {
    const connectPromise = adapter.connect({
      vendorId: 0x1234,
      productId: 0x5678,
      mockOptions: { simulationIntervalMs: 500 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const scans: BarcodeEvent[] = [];
    adapter.on('barcode:scanned', (e: BarcodeEvent) => scans.push(e));

    await adapter.startListening();
    vi.advanceTimersByTime(500);

    expect(scans.length).toBe(1);
    expect(scans[0]!.type).toBe('scanned');
    expect(scans[0]!.value).toBeTruthy();
    expect(scans[0]!.format).toBeTruthy();
    expect(scans[0]!.deviceId).toBe('mock-barcode-001');
  });

  it('should stop emitting after stopListening', async () => {
    const connectPromise = adapter.connect({
      vendorId: 0x1234,
      productId: 0x5678,
      mockOptions: { simulationIntervalMs: 500 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const scans: BarcodeEvent[] = [];
    adapter.on('barcode:scanned', (e: BarcodeEvent) => scans.push(e));

    await adapter.startListening();
    vi.advanceTimersByTime(500);
    expect(scans.length).toBe(1);

    await adapter.stopListening();
    vi.advanceTimersByTime(2000);
    expect(scans.length).toBe(1);
  });

  it('should emit multiple scans over time', async () => {
    const connectPromise = adapter.connect({
      vendorId: 0x1234,
      productId: 0x5678,
      mockOptions: { simulationIntervalMs: 300 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const scans: BarcodeEvent[] = [];
    adapter.on('barcode:scanned', (e: BarcodeEvent) => scans.push(e));

    await adapter.startListening();
    vi.advanceTimersByTime(900);

    expect(scans.length).toBe(3);
  });
});
