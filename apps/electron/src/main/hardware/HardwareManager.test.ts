import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { BillEvent } from '@kioskos/shared-types';
import { HardwareError, HardwareErrorCode } from '@kioskos/shared-types';
import { HardwareManager } from './HardwareManager';
import { MockBillValidatorAdapter } from './adapters/bill-validators/MockBillValidatorAdapter';
import { MockCoinValidatorAdapter } from './adapters/coin-validators/MockCoinValidatorAdapter';
import { MockBarcodeAdapter } from './adapters/barcode/MockBarcodeAdapter';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

function createMockHardwareEventRepo() {
  return { create: vi.fn(), getUnsynced: vi.fn(), markSynced: vi.fn(), getRecent: vi.fn() };
}

describe('HardwareManager', () => {
  let manager: HardwareManager;
  let logger: Logger;
  let repo: ReturnType<typeof createMockHardwareEventRepo>;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    repo = createMockHardwareEventRepo();
    manager = new HardwareManager(logger, repo as never);
  });

  afterEach(async () => {
    await manager.disconnectAll();
    vi.useRealTimers();
  });

  it('should register and retrieve an adapter', () => {
    const adapter = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', adapter);

    const retrieved = manager.getAdapter<MockBillValidatorAdapter>('bill-001');
    expect(retrieved).toBe(adapter);
  });

  it('should throw on duplicate registration', () => {
    const adapter = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', adapter);

    expect(() => {
      manager.register('bill-001', adapter);
    }).toThrow('Adapter already registered');
  });

  it('should throw when getting unknown adapter', () => {
    expect(() => {
      manager.getAdapter('nonexistent');
    }).toThrow('Adapter not found');
  });

  it('should get adapters by category', () => {
    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    const coin = new MockCoinValidatorAdapter('coin-001', createMockLogger());
    const barcode = new MockBarcodeAdapter('barcode-001', createMockLogger());

    manager.register('bill-001', bill);
    manager.register('coin-001', coin);
    manager.register('barcode-001', barcode);

    const billAdapters = manager.getByCategory('bill-validator');
    expect(billAdapters).toHaveLength(1);
    expect(billAdapters[0]).toBe(bill);

    const nfcAdapters = manager.getByCategory('nfc');
    expect(nfcAdapters).toHaveLength(0);
  });

  it('should unregister and disconnect adapter', async () => {
    const adapter = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', adapter);

    const connectPromise = adapter.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 5000 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    await manager.unregister('bill-001');

    expect(() => manager.getAdapter('bill-001')).toThrow();
    expect(adapter.getConnectionState()).toBe('disconnected');
  });

  it('should handle unregister of unknown adapter', async () => {
    await manager.unregister('nonexistent');
    // Should not throw
  });

  it('should return health report from all adapters', async () => {
    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    const coin = new MockCoinValidatorAdapter('coin-001', createMockLogger());

    manager.register('bill-001', bill);
    manager.register('coin-001', coin);

    // Connect bill but not coin
    const connectPromise = bill.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 5000 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const report = manager.healthCheck();

    expect(report.devices).toHaveLength(2);
    expect(report.overallHealthy).toBe(false); // coin is not connected
    expect(report.timestamp).toBeTruthy();

    const billStatus = report.devices.find((d) => d.deviceId === 'bill-001');
    expect(billStatus?.connectionState).toBe('connected');

    const coinStatus = report.devices.find((d) => d.deviceId === 'coin-001');
    expect(coinStatus?.connectionState).toBe('disconnected');
  });

  it('should forward domain events from adapters', async () => {
    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', bill);

    const connectPromise = bill.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 500, failureRate: 0 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    const events: BillEvent[] = [];
    manager.on('bill:inserted', (e: BillEvent) => events.push(e));

    await bill.enable();
    vi.advanceTimersByTime(500);

    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('inserted');
  });

  it('should persist state changes to hardware event repo', async () => {
    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', bill);

    const connectPromise = bill.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 5000 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await connectPromise;

    // connecting + connected = 2 state changes
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceCategory: 'bill-validator',
        deviceId: 'bill-001',
        eventType: 'state_change',
        severity: 'info',
      }),
    );
  });

  it('should persist and forward adapter errors', () => {
    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    manager.register('bill-001', bill);

    const errors: { id: string; error: HardwareError }[] = [];
    manager.on('adapter-error', (e) => errors.push(e));

    const error = new HardwareError(
      'Test error',
      HardwareErrorCode.BILL_JAM,
      'bill-001',
      'bill-validator',
    );
    bill.emit('error', error);

    expect(errors.length).toBe(1);
    expect(errors[0]!.id).toBe('bill-001');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceCategory: 'bill-validator',
        deviceId: 'bill-001',
        eventType: 'error',
        severity: 'error',
      }),
    );
  });

  it('should disconnect all adapters', async () => {
    const bill = new MockBillValidatorAdapter('bill-001', createMockLogger());
    const coin = new MockCoinValidatorAdapter('coin-001', createMockLogger());

    manager.register('bill-001', bill);
    manager.register('coin-001', coin);

    const p1 = bill.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 5000 },
    });
    const p2 = coin.connect({
      port: '/dev/mock',
      baudRate: 9600,
      mockOptions: { simulationIntervalMs: 5000 },
    });
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all([p1, p2]);

    expect(bill.getConnectionState()).toBe('connected');
    expect(coin.getConnectionState()).toBe('connected');

    await manager.disconnectAll();

    expect(bill.getConnectionState()).toBe('disconnected');
    expect(coin.getConnectionState()).toBe('disconnected');
  });
});
