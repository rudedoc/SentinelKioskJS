import type { Logger } from 'winston';
import type { KioskConfig } from '@kioskos/shared-types';
import type { HardwareEventRepo } from '../db/repositories/HardwareEventRepo';
import { HardwareManager } from './HardwareManager';
import { buildAdapterFactory } from './AdapterFactory';

const IS_MOCK = process.env.KIOSKOS_MOCK_HARDWARE === 'true';

interface MockDefaults {
  name: string;
  id: string;
  config: Record<string, unknown>;
}

const MOCK_ADAPTERS: MockDefaults[] = [
  {
    name: 'MockBillValidator',
    id: 'mock-bill-001',
    config: {
      port: '/dev/mock',
      baudRate: 9600,
      denominations: [500, 1000, 2000, 5000, 10000],
      currency: 'EUR',
      mockOptions: { simulationIntervalMs: 10000, failureRate: 0.1 },
    },
  },
  {
    name: 'MockCoinValidator',
    id: 'mock-coin-001',
    config: {
      port: '/dev/mock',
      baudRate: 9600,
      denominations: [5, 10, 20, 50, 100, 200],
      currency: 'EUR',
      mockOptions: { simulationIntervalMs: 8000, failureRate: 0.05 },
    },
  },
  {
    name: 'MockPrinter',
    id: 'mock-printer-001',
    config: {
      port: '/dev/mock',
      baudRate: 9600,
    },
  },
  {
    name: 'MockNFC',
    id: 'mock-nfc-001',
    config: {
      vendorId: 0x0000,
      productId: 0x0000,
      mockOptions: { simulationIntervalMs: 15000 },
    },
  },
  {
    name: 'MockBarcode',
    id: 'mock-barcode-001',
    config: {
      vendorId: 0x0000,
      productId: 0x0000,
      mockOptions: { simulationIntervalMs: 12000 },
    },
  },
];

/**
 * Creates and initializes the hardware stack based on config and environment.
 *
 * - In mock mode (KIOSKOS_MOCK_HARDWARE=true): creates all 5 mock adapters
 * - In production: creates adapters based on config.hardware entries
 * - If no hardware is configured and not in mock mode: empty manager (no crash)
 */
export async function createHardwareStack(
  config: KioskConfig,
  hardwareEventRepo: HardwareEventRepo,
  logger: Logger,
): Promise<HardwareManager> {
  const manager = new HardwareManager(logger, hardwareEventRepo);
  const factory = buildAdapterFactory();

  if (IS_MOCK) {
    logger.warn('Running with MOCK hardware adapters');
    await setupMockAdapters(manager, factory, logger);
  } else {
    await setupConfiguredAdapters(config, manager, factory, logger);
  }

  return manager;
}

async function setupMockAdapters(
  manager: HardwareManager,
  factory: ReturnType<typeof buildAdapterFactory>,
  logger: Logger,
): Promise<void> {
  for (const mock of MOCK_ADAPTERS) {
    try {
      const adapter = factory.createAdapter(mock.name, mock.id, logger);
      manager.register(mock.id, adapter);
      await adapter.connect(mock.config as never);
      logger.info('Mock adapter connected', { id: mock.id, name: mock.name });
    } catch (err) {
      logger.error('Failed to create mock adapter', {
        name: mock.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function setupConfiguredAdapters(
  config: KioskConfig,
  manager: HardwareManager,
  factory: ReturnType<typeof buildAdapterFactory>,
  logger: Logger,
): Promise<void> {
  const hardwareConfig = config.hardware;
  const entries: { key: string; adapter: string; config: Record<string, unknown> }[] = [];

  if (hardwareConfig.printer) {
    entries.push({
      key: 'printer',
      adapter: hardwareConfig.printer.adapter,
      config: hardwareConfig.printer.config,
    });
  }
  if (hardwareConfig.billValidator) {
    entries.push({
      key: 'bill-validator',
      adapter: hardwareConfig.billValidator.adapter,
      config: hardwareConfig.billValidator.config,
    });
  }
  if (hardwareConfig.coinValidator) {
    entries.push({
      key: 'coin-validator',
      adapter: hardwareConfig.coinValidator.adapter,
      config: hardwareConfig.coinValidator.config,
    });
  }
  if (hardwareConfig.nfc) {
    entries.push({
      key: 'nfc',
      adapter: hardwareConfig.nfc.adapter,
      config: hardwareConfig.nfc.config,
    });
  }
  if (hardwareConfig.barcode) {
    entries.push({
      key: 'barcode',
      adapter: hardwareConfig.barcode.adapter,
      config: hardwareConfig.barcode.config,
    });
  }

  if (entries.length === 0) {
    logger.info('No hardware configured — running without adapters');
    return;
  }

  for (const entry of entries) {
    try {
      const adapter = factory.createAdapter(entry.adapter, entry.key, logger);
      manager.register(entry.key, adapter);
      await adapter.connect(entry.config as never);
      logger.info('Adapter connected', { id: entry.key, adapter: entry.adapter });
    } catch (err) {
      logger.error('Failed to connect adapter', {
        id: entry.key,
        adapter: entry.adapter,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
