import type { Logger } from 'winston';
import type { USBAdapterConfig } from '@kioskos/shared-types';
import { HardwareError, HardwareErrorCode } from '@kioskos/shared-types';
import type { Device, Interface, InEndpoint, OutEndpoint } from 'usb';
import { findByIds } from 'usb';

const BULK_TRANSFER_TYPE = 2;
const DEFAULT_INTERFACE = 0;
const DEFAULT_READ_TIMEOUT = 5000;

export class USBPrinterConnection {
  private device: Device | null = null;
  private iface: Interface | null = null;
  private inEp: InEndpoint | null = null;
  private outEp: OutEndpoint | null = null;
  private _isOpen = false;
  private deviceId: string;

  constructor(
    deviceId: string,
    private readonly logger: Logger,
  ) {
    this.deviceId = deviceId;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  async open(config: USBAdapterConfig): Promise<void> {
    const device = findByIds(config.vendorId, config.productId);
    if (!device) {
      throw new HardwareError(
        `USB device not found: VID=0x${config.vendorId.toString(16)} PID=0x${config.productId.toString(16)}`,
        HardwareErrorCode.CONNECTION_FAILED,
        this.deviceId,
        'printer',
      );
    }

    try {
      device.open();
    } catch (err) {
      throw new HardwareError(
        `Failed to open USB device: ${err instanceof Error ? err.message : String(err)}`,
        HardwareErrorCode.CONNECTION_FAILED,
        this.deviceId,
        'printer',
      );
    }

    const ifaceNum = config.interface ?? DEFAULT_INTERFACE;
    const interfaces = device.interfaces;
    if (!interfaces || !interfaces[ifaceNum]) {
      device.close();
      throw new HardwareError(
        `USB interface ${ifaceNum} not found`,
        HardwareErrorCode.CONNECTION_FAILED,
        this.deviceId,
        'printer',
      );
    }

    const iface = interfaces[ifaceNum]!;

    try {
      if (iface.isKernelDriverActive()) {
        iface.detachKernelDriver();
        this.logger.debug('Detached kernel driver', {
          deviceId: this.deviceId,
          interface: ifaceNum,
        });
      }
    } catch {
      // Kernel driver detach not supported on all platforms — safe to ignore
    }

    try {
      iface.claim();
    } catch (err) {
      device.close();
      throw new HardwareError(
        `Failed to claim USB interface ${ifaceNum}: ${err instanceof Error ? err.message : String(err)}`,
        HardwareErrorCode.CONNECTION_FAILED,
        this.deviceId,
        'printer',
      );
    }

    const { inEp, outEp } = this.resolveEndpoints(iface, config);

    this.device = device;
    this.iface = iface;
    this.inEp = inEp;
    this.outEp = outEp;
    this._isOpen = true;

    this.logger.info('USB printer connection opened', {
      deviceId: this.deviceId,
      vendorId: `0x${config.vendorId.toString(16)}`,
      productId: `0x${config.productId.toString(16)}`,
      interface: ifaceNum,
    });
  }

  async close(): Promise<void> {
    if (!this._isOpen) return;

    try {
      if (this.iface) {
        await new Promise<void>((resolve) => {
          this.iface!.release(true, () => resolve());
        });
      }
    } catch {
      // Best-effort release
    }

    try {
      this.device?.close();
    } catch {
      // Best-effort close
    }

    this.device = null;
    this.iface = null;
    this.inEp = null;
    this.outEp = null;
    this._isOpen = false;

    this.logger.info('USB printer connection closed', { deviceId: this.deviceId });
  }

  async write(data: Buffer): Promise<void> {
    if (!this._isOpen || !this.outEp) {
      throw new HardwareError(
        'Cannot write: USB connection not open',
        HardwareErrorCode.NOT_INITIALIZED,
        this.deviceId,
        'printer',
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.outEp!.transfer(data, (err) => {
        if (err) {
          reject(
            new HardwareError(
              `USB write failed: ${err.message}`,
              HardwareErrorCode.CONNECTION_LOST,
              this.deviceId,
              'printer',
            ),
          );
        } else {
          resolve();
        }
      });
    });
  }

  async read(length: number, timeout?: number): Promise<Buffer> {
    if (!this._isOpen || !this.inEp) {
      throw new HardwareError(
        'Cannot read: USB connection not open or no IN endpoint',
        HardwareErrorCode.NOT_INITIALIZED,
        this.deviceId,
        'printer',
      );
    }

    const timeoutMs = timeout ?? DEFAULT_READ_TIMEOUT;

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new HardwareError(
            'USB read timed out',
            HardwareErrorCode.COMMAND_TIMEOUT,
            this.deviceId,
            'printer',
          ),
        );
      }, timeoutMs);

      this.inEp!.transfer(length, (err, data) => {
        clearTimeout(timer);
        if (err) {
          reject(
            new HardwareError(
              `USB read failed: ${err.message}`,
              HardwareErrorCode.CONNECTION_LOST,
              this.deviceId,
              'printer',
            ),
          );
        } else {
          resolve(data ?? Buffer.alloc(0));
        }
      });
    });
  }

  private resolveEndpoints(
    iface: Interface,
    config: USBAdapterConfig,
  ): { inEp: InEndpoint | null; outEp: OutEndpoint } {
    let inEp: InEndpoint | null = null;
    let outEp: OutEndpoint | null = null;

    if (config.inEndpoint !== undefined) {
      const ep = iface.endpoints.find((e) => e.address === config.inEndpoint);
      if (ep && ep.direction === 'in') {
        inEp = ep as InEndpoint;
      }
    }

    if (config.outEndpoint !== undefined) {
      const ep = iface.endpoints.find((e) => e.address === config.outEndpoint);
      if (ep && ep.direction === 'out') {
        outEp = ep as OutEndpoint;
      }
    }

    // Auto-detect if not specified
    if (!outEp) {
      for (const ep of iface.endpoints) {
        if (ep.direction === 'out' && ep.transferType === BULK_TRANSFER_TYPE) {
          outEp = ep as OutEndpoint;
          break;
        }
      }
    }

    if (!inEp) {
      for (const ep of iface.endpoints) {
        if (ep.direction === 'in' && ep.transferType === BULK_TRANSFER_TYPE) {
          inEp = ep as InEndpoint;
          break;
        }
      }
    }

    if (!outEp) {
      throw new HardwareError(
        'No suitable OUT endpoint found on USB interface',
        HardwareErrorCode.CONNECTION_FAILED,
        this.deviceId,
        'printer',
      );
    }

    return { inEp, outEp };
  }
}
