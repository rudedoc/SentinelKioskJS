import { describe, it, expect, vi } from 'vitest';
import type { Logger } from 'winston';
import { HardwareErrorCode } from '@kioskos/shared-types';
import { AdapterFactory, buildAdapterFactory } from './AdapterFactory';
import { MockBillValidatorAdapter } from './adapters/bill-validators/MockBillValidatorAdapter';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('AdapterFactory', () => {
  it('should create a registered adapter', () => {
    const factory = new AdapterFactory();
    factory.registerAdapter('TestBill', MockBillValidatorAdapter);

    const adapter = factory.createAdapter('TestBill', 'test-001', createMockLogger());
    expect(adapter).toBeInstanceOf(MockBillValidatorAdapter);
    expect(adapter.deviceId).toBe('test-001');
  });

  it('should throw for unknown adapter name', () => {
    const factory = new AdapterFactory();

    try {
      factory.createAdapter('NonExistent', 'test-001', createMockLogger());
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as { code: string }).code).toBe(HardwareErrorCode.UNKNOWN_DEVICE);
    }
  });

  it('should list registered adapter names', () => {
    const factory = new AdapterFactory();
    factory.registerAdapter('AdapterA', MockBillValidatorAdapter);
    factory.registerAdapter('AdapterB', MockBillValidatorAdapter);

    const names = factory.getRegisteredNames();
    expect(names).toContain('AdapterA');
    expect(names).toContain('AdapterB');
    expect(names).toHaveLength(2);
  });
});

describe('buildAdapterFactory', () => {
  it('should register all known adapters', () => {
    const factory = buildAdapterFactory();
    const names = factory.getRegisteredNames();

    expect(names).toContain('NV9');
    expect(names).toContain('MockBillValidator');
    expect(names).toContain('MockCoinValidator');
    expect(names).toContain('MockPrinter');
    expect(names).toContain('MockNFC');
    expect(names).toContain('MockBarcode');
  });

  it('should create mock adapters from the factory', () => {
    const factory = buildAdapterFactory();
    const logger = createMockLogger();

    const bill = factory.createAdapter('MockBillValidator', 'b1', logger);
    expect(bill.category).toBe('bill-validator');

    const printer = factory.createAdapter('MockPrinter', 'p1', logger);
    expect(printer.category).toBe('printer');

    const nfc = factory.createAdapter('MockNFC', 'n1', logger);
    expect(nfc.category).toBe('nfc');
  });
});
