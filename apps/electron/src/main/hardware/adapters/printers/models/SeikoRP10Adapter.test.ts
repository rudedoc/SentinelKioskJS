import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { ReceiptData } from '@kioskos/shared-types';
import { HardwareErrorCode } from '@kioskos/shared-types';
import { SeikoRP10Adapter } from './SeikoRP10Adapter';

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

describe('SeikoRP10Adapter', () => {
  let adapter: SeikoRP10Adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SeikoRP10Adapter('test-seiko', createMockLogger());
  });

  it('should have correct metadata', () => {
    expect(adapter.manufacturer).toBe('Seiko');
    expect(adapter.model).toBe('SII RP-10');
  });

  describe('connect / disconnect', () => {
    it('should connect and set state', async () => {
      await adapter.connect({ vendorId: 0x0619, productId: 0x0123 });
      expect(adapter.getConnectionState()).toBe('connected');
    });
  });

  describe('printReceipt', () => {
    it('should print receipt with image barcode (CODE128 default)', async () => {
      await adapter.connect({ vendorId: 0x0619, productId: 0x0123 });

      const receipt: ReceiptData = {
        lines: [
          { type: 'text', content: 'Seiko RP-10 Test', align: 'center' },
          { type: 'barcode', value: '12345678' },
        ],
        cutAfter: true,
      };

      const result = await adapter.printReceipt(receipt);
      expect(result.success).toBe(true);
    });
  });

  describe('cutPaper', () => {
    it('should send GS V 0 cut command', async () => {
      await adapter.connect({ vendorId: 0x0619, productId: 0x0123 });
      await adapter.cutPaper();

      const writtenData = mockWrite.mock.calls[mockWrite.mock.calls.length - 1]![0] as Buffer;
      // GS V 0 = 0x1d 0x56 0x00
      expect(writtenData[0]).toBe(0x1d);
      expect(writtenData[1]).toBe(0x56);
      expect(writtenData[2]).toBe(0x00);
    });

    it('should throw when not connected', async () => {
      await expect(adapter.cutPaper()).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });
  });
});
