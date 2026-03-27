import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'winston';
import { MockPrinterAdapter } from './MockPrinterAdapter';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('MockPrinterAdapter', () => {
  let adapter: MockPrinterAdapter;
  let logger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    adapter = new MockPrinterAdapter('mock-printer-001', logger);
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.useRealTimers();
  });

  it('should connect successfully', async () => {
    const connectPromise = adapter.connect({ port: '/dev/mock', baudRate: 9600 });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    expect(adapter.getConnectionState()).toBe('connected');
  });

  it('should print receipt successfully', async () => {
    const connectPromise = adapter.connect({ port: '/dev/mock', baudRate: 9600 });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const resultPromise = adapter.printReceipt({
      lines: [
        { type: 'text', content: 'Test Receipt', align: 'center', bold: true },
        { type: 'divider' },
        { type: 'text', content: 'Item 1: $5.00' },
      ],
    });
    await vi.advanceTimersByTimeAsync(300);
    const result = await resultPromise;

    expect(result.success).toBe(true);
  });

  it('should fail print when disconnected', async () => {
    const result = await adapter.printReceipt({
      lines: [{ type: 'text', content: 'Test' }],
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Printer not connected');
  });

  it('should return healthy printer status', async () => {
    const connectPromise = adapter.connect({ port: '/dev/mock', baudRate: 9600 });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const status = adapter.getPrinterStatus();
    expect(status.paperLow).toBe(false);
    expect(status.coverOpen).toBe(false);
    expect(status.errorState).toBeNull();
  });

  it('should handle cutPaper and openCashDrawer', async () => {
    const connectPromise = adapter.connect({ port: '/dev/mock', baudRate: 9600 });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    await adapter.cutPaper();
    await adapter.openCashDrawer();

    expect(logger.info).toHaveBeenCalledWith('Mock paper cut', { deviceId: 'mock-printer-001' });
    expect(logger.info).toHaveBeenCalledWith('Mock cash drawer opened', {
      deviceId: 'mock-printer-001',
    });
  });
});
