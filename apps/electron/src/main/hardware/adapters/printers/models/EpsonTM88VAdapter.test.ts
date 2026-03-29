import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { ReceiptData } from '@kioskos/shared-types';
import { HardwareErrorCode } from '@kioskos/shared-types';
import { EpsonTM88VAdapter } from './EpsonTM88VAdapter';

vi.mock('../usb/USBPrinterConnection', () => ({
  USBPrinterConnection: vi.fn().mockImplementation(() => ({
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    isOpen: true,
  })),
}));

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('EpsonTM88VAdapter', () => {
  let adapter: EpsonTM88VAdapter;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    adapter = new EpsonTM88VAdapter('test-epson', logger);
  });

  it('should have correct metadata', () => {
    expect(adapter.manufacturer).toBe('Epson');
    expect(adapter.model).toBe('TM-88V');
    expect(adapter.category).toBe('printer');
  });

  describe('connect', () => {
    it('should open USB connection and send init commands', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x2013 });
      expect(adapter.getConnectionState()).toBe('connected');
    });
  });

  describe('disconnect', () => {
    it('should close connection', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x2013 });
      await adapter.disconnect();
      expect(adapter.getConnectionState()).toBe('disconnected');
    });
  });

  describe('printReceipt', () => {
    it('should return failure when not connected', async () => {
      const result = await adapter.printReceipt({ lines: [], cutAfter: true });
      expect(result.success).toBe(false);
    });

    it('should print a receipt with text lines', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x2013 });

      const receipt: ReceiptData = {
        lines: [
          { type: 'text', content: 'Hello World', align: 'center', bold: true },
          { type: 'divider' },
          { type: 'text', content: 'Item 1' },
          { type: 'feed', lines: 2 },
        ],
        cutAfter: true,
      };

      const result = await adapter.printReceipt(receipt);
      expect(result.success).toBe(true);
    });

    it('should print a receipt with native barcode', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x2013 });

      const receipt: ReceiptData = {
        lines: [
          { type: 'text', content: 'Test', align: 'center' },
          { type: 'barcode', value: '12345678', format: 'CODE128' },
        ],
        cutAfter: true,
      };

      const result = await adapter.printReceipt(receipt);
      expect(result.success).toBe(true);
    });

    it('should handle open drawer flag', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x2013 });

      const receipt: ReceiptData = {
        lines: [{ type: 'text', content: 'Drawer test' }],
        openDrawer: true,
      };

      const result = await adapter.printReceipt(receipt);
      expect(result.success).toBe(true);
    });
  });

  describe('cutPaper', () => {
    it('should throw when not connected', async () => {
      await expect(adapter.cutPaper()).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });

    it('should send cut command when connected', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x2013 });
      await expect(adapter.cutPaper()).resolves.toBeUndefined();
    });
  });

  describe('openCashDrawer', () => {
    it('should throw when not connected', async () => {
      await expect(adapter.openCashDrawer()).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });
  });

  describe('getPrinterStatus', () => {
    it('should return healthy status', () => {
      const status = adapter.getPrinterStatus();
      expect(status.paperLow).toBe(false);
      expect(status.coverOpen).toBe(false);
    });
  });
});
