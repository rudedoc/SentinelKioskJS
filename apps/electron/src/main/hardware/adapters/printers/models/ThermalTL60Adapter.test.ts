import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { ReceiptData } from '@kioskos/shared-types';
import { HardwareErrorCode } from '@kioskos/shared-types';
import { ThermalTL60Adapter } from './ThermalTL60Adapter';

vi.mock('../usb/USBPrinterConnection', () => ({
  USBPrinterConnection: vi.fn().mockImplementation(() => ({
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    isOpen: true,
  })),
}));

vi.mock('../escpos/BarcodeRenderer', () => ({
  renderBarcode: vi.fn().mockResolvedValue({ data: Buffer.from([0xff]), width: 8, height: 1 }),
  renderQR: vi.fn().mockResolvedValue({ data: Buffer.from([0xff]), width: 8, height: 1 }),
}));

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('ThermalTL60Adapter', () => {
  let adapter: ThermalTL60Adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ThermalTL60Adapter('test-tl60', createMockLogger());
  });

  it('should have correct metadata', () => {
    expect(adapter.manufacturer).toBe('ThermalTL60');
    expect(adapter.model).toBe('TL60');
    expect(adapter.category).toBe('printer');
  });

  describe('connect / disconnect', () => {
    it('should transition through connection states', async () => {
      await adapter.connect({ vendorId: 0x0001, productId: 0x0001 });
      expect(adapter.getConnectionState()).toBe('connected');

      await adapter.disconnect();
      expect(adapter.getConnectionState()).toBe('disconnected');
    });
  });

  describe('printReceipt', () => {
    it('should print receipt with image barcode', async () => {
      await adapter.connect({ vendorId: 0x0001, productId: 0x0001 });

      const receipt: ReceiptData = {
        lines: [
          { type: 'text', content: 'TL60 Test', align: 'center' },
          { type: 'barcode', value: '12345678', format: 'CODE39' },
          { type: 'qr', value: 'https://example.com' },
        ],
        cutAfter: true,
      };

      const result = await adapter.printReceipt(receipt);
      expect(result.success).toBe(true);
    });

    it('should return failure when not connected', async () => {
      const result = await adapter.printReceipt({ lines: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('cutPaper', () => {
    it('should throw when not connected', async () => {
      await expect(adapter.cutPaper()).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });

    it('should send TL60 cut command when connected', async () => {
      await adapter.connect({ vendorId: 0x0001, productId: 0x0001 });
      await expect(adapter.cutPaper()).resolves.toBeUndefined();
    });
  });
});
