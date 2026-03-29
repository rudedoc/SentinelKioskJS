import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { ReceiptData } from '@kioskos/shared-types';
import { HardwareErrorCode } from '@kioskos/shared-types';
import { StarTSP100Adapter } from './StarTSP100Adapter';

const mockWrite = vi.fn().mockResolvedValue(undefined);

vi.mock('../usb/USBPrinterConnection', () => ({
  USBPrinterConnection: vi.fn().mockImplementation(() => ({
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    write: mockWrite,
    isOpen: true,
  })),
}));

vi.mock('../star/StarRasterRenderer', () => ({
  renderReceipt: vi.fn().mockResolvedValue([Buffer.alloc(72, 0x00), Buffer.alloc(72, 0xff)]),
}));

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('StarTSP100Adapter', () => {
  let adapter: StarTSP100Adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new StarTSP100Adapter('test-star', createMockLogger());
  });

  it('should have correct metadata', () => {
    expect(adapter.manufacturer).toBe('Star');
    expect(adapter.model).toBe('TSP100');
    expect(adapter.category).toBe('printer');
  });

  describe('connect / disconnect', () => {
    it('should connect and send raster init', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x0003 });
      expect(adapter.getConnectionState()).toBe('connected');
      // Should have sent the init raster command
      expect(mockWrite).toHaveBeenCalled();
      const initData = mockWrite.mock.calls[0]![0] as Buffer;
      // ESC * r R = 0x1b 0x2a 0x72 0x52
      expect(initData[0]).toBe(0x1b);
      expect(initData[1]).toBe(0x2a);
      expect(initData[2]).toBe(0x72);
      expect(initData[3]).toBe(0x52);
    });

    it('should disconnect cleanly', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x0003 });
      await adapter.disconnect();
      expect(adapter.getConnectionState()).toBe('disconnected');
    });
  });

  describe('printReceipt', () => {
    it('should return failure when not connected', async () => {
      const result = await adapter.printReceipt({ lines: [] });
      expect(result.success).toBe(false);
    });

    it('should render receipt to raster and send', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x0003 });

      const receipt: ReceiptData = {
        lines: [
          { type: 'text', content: 'Star TSP100 Test', align: 'center', bold: true },
          { type: 'divider' },
          { type: 'text', content: 'Line item 1' },
          { type: 'barcode', value: '1234567890', format: 'CODE128' },
          { type: 'feed', lines: 2 },
        ],
        cutAfter: true,
      };

      const result = await adapter.printReceipt(receipt);
      expect(result.success).toBe(true);

      // Should have written the raster job (init on connect + raster job)
      expect(mockWrite).toHaveBeenCalledTimes(2);
      const jobData = mockWrite.mock.calls[1]![0] as Buffer;
      // Job should start with ESC * r R (init raster)
      expect(jobData[0]).toBe(0x1b);
      expect(jobData[1]).toBe(0x2a);
    });

    it('should handle open drawer flag', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x0003 });

      const receipt: ReceiptData = {
        lines: [{ type: 'text', content: 'Drawer test' }],
        openDrawer: true,
        cutAfter: true,
      };

      const result = await adapter.printReceipt(receipt);
      expect(result.success).toBe(true);
    });
  });

  describe('cutPaper', () => {
    it('should send raster cut sequence', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x0003 });
      await adapter.cutPaper();

      // Last write should contain the cut sequence
      const lastCall = mockWrite.mock.calls[mockWrite.mock.calls.length - 1]!;
      const data = lastCall[0] as Buffer;
      // Should contain ESC * r R, ESC * r F, ESC * r A, ESC * r B
      expect(data.length).toBeGreaterThan(0);
    });

    it('should throw when not connected', async () => {
      await expect(adapter.cutPaper()).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });
  });

  describe('openCashDrawer', () => {
    it('should throw when not connected', async () => {
      await expect(adapter.openCashDrawer()).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });

    it('should send drawer command when connected', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x0003 });
      await adapter.openCashDrawer();
      expect(mockWrite).toHaveBeenCalledTimes(2); // init + drawer
    });
  });

  describe('getPrinterStatus', () => {
    it('should return healthy status when connected', async () => {
      await adapter.connect({ vendorId: 0x0519, productId: 0x0003 });
      const status = adapter.getPrinterStatus();
      expect(status.paperLow).toBe(false);
      expect(status.coverOpen).toBe(false);
      expect(status.errorState).toBeNull();
    });
  });
});
