import type { Logger } from 'winston';
import { HardwareError, HardwareErrorCode } from '@kioskos/shared-types';
import { HardwareAdapter } from './HardwareAdapter';

// Import all known adapters
import { NV9Adapter } from './adapters/bill-validators/NV9Adapter';
import { MockBillValidatorAdapter } from './adapters/bill-validators/MockBillValidatorAdapter';
import { MockCoinValidatorAdapter } from './adapters/coin-validators/MockCoinValidatorAdapter';
import { MockPrinterAdapter } from './adapters/printers/MockPrinterAdapter';
import { MockNFCAdapter } from './adapters/nfc/MockNFCAdapter';
import { MockBarcodeAdapter } from './adapters/barcode/MockBarcodeAdapter';

type AdapterConstructor = new (deviceId: string, logger: Logger) => HardwareAdapter;

export class AdapterFactory {
  private registry: Map<string, AdapterConstructor> = new Map();

  registerAdapter(name: string, ctor: AdapterConstructor): void {
    this.registry.set(name, ctor);
  }

  createAdapter(name: string, deviceId: string, logger: Logger): HardwareAdapter {
    const Ctor = this.registry.get(name);
    if (!Ctor) {
      throw new HardwareError(
        `Unknown adapter: ${name}`,
        HardwareErrorCode.UNKNOWN_DEVICE,
        deviceId,
        'unknown',
      );
    }
    return new Ctor(deviceId, logger);
  }

  getRegisteredNames(): string[] {
    return Array.from(this.registry.keys());
  }
}

export function buildAdapterFactory(): AdapterFactory {
  const factory = new AdapterFactory();

  // Real adapters
  factory.registerAdapter('NV9', NV9Adapter);

  // Mock adapters
  factory.registerAdapter('MockBillValidator', MockBillValidatorAdapter);
  factory.registerAdapter('MockCoinValidator', MockCoinValidatorAdapter);
  factory.registerAdapter('MockPrinter', MockPrinterAdapter);
  factory.registerAdapter('MockNFC', MockNFCAdapter);
  factory.registerAdapter('MockBarcode', MockBarcodeAdapter);

  return factory;
}
