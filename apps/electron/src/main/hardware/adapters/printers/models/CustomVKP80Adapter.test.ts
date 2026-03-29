import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { ReceiptData } from '@kioskos/shared-types';
import { HardwareErrorCode } from '@kioskos/shared-types';
import { CustomVKP80Adapter } from './CustomVKP80Adapter';

const mockWrite = vi.fn().mockResolvedValue(undefined);

vi.mock('../usb/USBPrinterConnection', () => ({
  USBPrinterConnection: vi.fn().mockImplementation(() => ({
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    write: mockWrite,
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

describe('CustomVKP80Adapter', () => {
  let adapter: CustomVKP80Adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new CustomVKP80Adapter('test-vkp80', createMockLogger());
  });

  it('should have correct metadata', () => {
    expect(adapter.manufacturer).toBe('Custom');
    expect(adapter.model).toBe('VKP-80');
  });

  describe('printReceipt', () => {
    it('should print receipt with image barcode', async () => {
      await adapter.connect({ vendorId: 0x0dd4, productId: 0x0001 });

      const receipt: ReceiptData = {
        lines: [
          { type: 'text', content: 'VKP-80 Test', align: 'center', bold: true },
          { type: 'barcode', value: '12345670', format: 'EAN8' },
        ],
        cutAfter: true,
      };

      const result = await adapter.printReceipt(receipt);
      expect(result.success).toBe(true);
    });
  });

  describe('cutPaper', () => {
    it('should send cut + eject sequence', async () => {
      await adapter.connect({ vendorId: 0x0dd4, productId: 0x0001 });
      await adapter.cutPaper();

      // Verify the write was called with a buffer containing the cut + eject bytes
      const writtenData = mockWrite.mock.calls[mockWrite.mock.calls.length - 1]![0] as Buffer;
      // Cut command: 0x1b 0x69
      expect(writtenData).toContain(0x1b);
      expect(writtenData).toContain(0x69);
      // Eject command: 0x1d 0x65 0x05
      expect(writtenData).toContain(0x1d);
      expect(writtenData).toContain(0x65);
      expect(writtenData).toContain(0x05);
    });

    it('should throw when not connected', async () => {
      await expect(adapter.cutPaper()).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });
  });
});
