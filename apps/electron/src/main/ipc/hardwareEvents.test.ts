import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'winston';
// Event types used implicitly via mock adapter emissions
import { IPC_CHANNELS } from '@kioskos/shared-types';
import { HardwareManager } from '../hardware/HardwareManager';
import { MockBillValidatorAdapter } from '../hardware/adapters/bill-validators/MockBillValidatorAdapter';
import { MockCoinValidatorAdapter } from '../hardware/adapters/coin-validators/MockCoinValidatorAdapter';
import { registerHardwareEventForwarding } from './hardwareEvents';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

function createMockHardwareEventRepo() {
  return { create: vi.fn(), getUnsynced: vi.fn(), markSynced: vi.fn(), getRecent: vi.fn() };
}

function createMockBrowserWindow() {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
    },
  };
}

describe('registerHardwareEventForwarding', () => {
  let manager: HardwareManager;
  let mockWindow: ReturnType<typeof createMockBrowserWindow>;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new HardwareManager(createMockLogger(), createMockHardwareEventRepo() as never);
    mockWindow = createMockBrowserWindow();
    registerHardwareEventForwarding(manager, mockWindow as never, createMockLogger());
  });

  afterEach(async () => {
    await manager.disconnectAll();
    vi.useRealTimers();
  });

  it('should forward bill:inserted events to renderer', async () => {
    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', bill);

    const connectPromise = bill.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    await bill.enable();
    vi.advanceTimersByTime(500);

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.BILL_INSERTED,
      expect.objectContaining({ type: 'inserted' }),
    );
  });

  it('should forward bill:stacked events to renderer', async () => {
    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', bill);

    const connectPromise = bill.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    await bill.enable();
    vi.advanceTimersByTime(500); // Insert fires
    vi.advanceTimersByTime(600); // Stack fires

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.BILL_STACKED,
      expect.objectContaining({ type: 'stacked' }),
    );
  });

  it('should forward coin:inserted events to renderer', async () => {
    const coin = new MockCoinValidatorAdapter('coin-001', createMockLogger());
    manager.register('coin-001', coin);

    const connectPromise = coin.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    await coin.enable();
    vi.advanceTimersByTime(500);

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.COIN_INSERTED,
      expect.objectContaining({ type: 'inserted' }),
    );
  });

  it('should not send events to a destroyed window', async () => {
    mockWindow.isDestroyed.mockReturnValue(true);

    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', bill);

    const connectPromise = bill.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    await bill.enable();
    vi.advanceTimersByTime(500);

    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });
});
