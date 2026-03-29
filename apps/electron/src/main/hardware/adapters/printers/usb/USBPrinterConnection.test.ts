import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'winston';
import { HardwareErrorCode } from '@kioskos/shared-types';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

// Mock endpoint factory
function createMockEndpoint(direction: 'in' | 'out', address: number) {
  return {
    direction,
    address,
    transferType: 2, // BULK
    transfer: vi.fn(),
  };
}

// Mock interface factory
function createMockInterface(endpoints: ReturnType<typeof createMockEndpoint>[]) {
  return {
    endpoints,
    claim: vi.fn(),
    release: vi.fn((_closeEps: boolean, cb: () => void) => cb()),
    isKernelDriverActive: vi.fn(() => false),
    detachKernelDriver: vi.fn(),
  };
}

// Mock device factory
function createMockDevice(iface: ReturnType<typeof createMockInterface>) {
  return {
    open: vi.fn(),
    close: vi.fn(),
    interfaces: [iface],
  };
}

vi.mock('usb', () => ({
  findByIds: vi.fn(),
}));

import { findByIds } from 'usb';
import { USBPrinterConnection } from './USBPrinterConnection';

const mockedFindByIds = vi.mocked(findByIds);

describe('USBPrinterConnection', () => {
  let connection: USBPrinterConnection;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connection = new USBPrinterConnection('test-printer', logger);
  });

  describe('open', () => {
    it('should open a USB device and claim interface', async () => {
      const outEp = createMockEndpoint('out', 0x03);
      const inEp = createMockEndpoint('in', 0x81);
      const iface = createMockInterface([inEp, outEp]);
      const device = createMockDevice(iface);
      mockedFindByIds.mockReturnValue(device as never);

      await connection.open({ vendorId: 0x0519, productId: 0x2013 });

      expect(device.open).toHaveBeenCalled();
      expect(iface.claim).toHaveBeenCalled();
      expect(connection.isOpen).toBe(true);
    });

    it('should use specified interface and endpoints', async () => {
      const outEp = createMockEndpoint('out', 0x03);
      const inEp = createMockEndpoint('in', 0x81);
      const iface = createMockInterface([inEp, outEp]);
      const device = createMockDevice(iface);
      mockedFindByIds.mockReturnValue(device as never);

      await connection.open({
        vendorId: 0x0519,
        productId: 0x2013,
        interface: 0,
        inEndpoint: 0x81,
        outEndpoint: 0x03,
      });

      expect(connection.isOpen).toBe(true);
    });

    it('should throw CONNECTION_FAILED when device not found', async () => {
      mockedFindByIds.mockReturnValue(undefined);

      await expect(connection.open({ vendorId: 0xffff, productId: 0xffff })).rejects.toMatchObject({
        code: HardwareErrorCode.CONNECTION_FAILED,
      });
    });

    it('should throw CONNECTION_FAILED when no OUT endpoint found', async () => {
      const inEp = createMockEndpoint('in', 0x81);
      const iface = createMockInterface([inEp]);
      const device = createMockDevice(iface);
      mockedFindByIds.mockReturnValue(device as never);

      await expect(connection.open({ vendorId: 0x0519, productId: 0x2013 })).rejects.toMatchObject({
        code: HardwareErrorCode.CONNECTION_FAILED,
      });
    });

    it('should detach kernel driver if active', async () => {
      const outEp = createMockEndpoint('out', 0x03);
      const iface = createMockInterface([outEp]);
      iface.isKernelDriverActive.mockReturnValue(true);
      const device = createMockDevice(iface);
      mockedFindByIds.mockReturnValue(device as never);

      await connection.open({ vendorId: 0x0519, productId: 0x2013 });

      expect(iface.detachKernelDriver).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should release interface and close device', async () => {
      const outEp = createMockEndpoint('out', 0x03);
      const iface = createMockInterface([outEp]);
      const device = createMockDevice(iface);
      mockedFindByIds.mockReturnValue(device as never);

      await connection.open({ vendorId: 0x0519, productId: 0x2013 });
      await connection.close();

      expect(iface.release).toHaveBeenCalled();
      expect(device.close).toHaveBeenCalled();
      expect(connection.isOpen).toBe(false);
    });

    it('should be idempotent', async () => {
      await connection.close();
      expect(connection.isOpen).toBe(false);
    });
  });

  describe('write', () => {
    it('should transfer data to OUT endpoint', async () => {
      const outEp = createMockEndpoint('out', 0x03);
      outEp.transfer.mockImplementation((_data: Buffer, cb: (err: null) => void) => cb(null));
      const iface = createMockInterface([outEp]);
      const device = createMockDevice(iface);
      mockedFindByIds.mockReturnValue(device as never);

      await connection.open({ vendorId: 0x0519, productId: 0x2013 });

      const data = Buffer.from([0x1b, 0x40]);
      await connection.write(data);

      expect(outEp.transfer).toHaveBeenCalledWith(data, expect.any(Function));
    });

    it('should throw NOT_INITIALIZED when not open', async () => {
      await expect(connection.write(Buffer.from([0x00]))).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });

    it('should throw CONNECTION_LOST on transfer error', async () => {
      const outEp = createMockEndpoint('out', 0x03);
      outEp.transfer.mockImplementation((_data: Buffer, cb: (err: Error) => void) =>
        cb(new Error('Transfer failed')),
      );
      const iface = createMockInterface([outEp]);
      const device = createMockDevice(iface);
      mockedFindByIds.mockReturnValue(device as never);

      await connection.open({ vendorId: 0x0519, productId: 0x2013 });

      await expect(connection.write(Buffer.from([0x00]))).rejects.toMatchObject({
        code: HardwareErrorCode.CONNECTION_LOST,
      });
    });
  });

  describe('read', () => {
    it('should transfer data from IN endpoint', async () => {
      const inEp = createMockEndpoint('in', 0x81);
      const outEp = createMockEndpoint('out', 0x03);
      const responseData = Buffer.from([0x00, 0x01]);
      inEp.transfer.mockImplementation((_len: number, cb: (err: null, data: Buffer) => void) =>
        cb(null, responseData),
      );
      const iface = createMockInterface([inEp, outEp]);
      const device = createMockDevice(iface);
      mockedFindByIds.mockReturnValue(device as never);

      await connection.open({ vendorId: 0x0519, productId: 0x2013 });
      const result = await connection.read(2);

      expect(result).toEqual(responseData);
    });

    it('should throw NOT_INITIALIZED when not open', async () => {
      await expect(connection.read(1)).rejects.toMatchObject({
        code: HardwareErrorCode.NOT_INITIALIZED,
      });
    });
  });
});
