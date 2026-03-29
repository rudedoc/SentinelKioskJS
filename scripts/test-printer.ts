/**
 * Printer Integration Test — Print a test receipt on a real USB printer.
 *
 * Usage:
 *   1. Run find-printers to discover your device:
 *        pnpm find-printers
 *
 *   2. Set environment variables or edit the constants below:
 *        PRINTER_ADAPTER=EpsonTM88V \
 *        PRINTER_VID=0x0519 \
 *        PRINTER_PID=0x2013 \
 *        PRINTER_INTERFACE=0 \
 *        PRINTER_OUT_EP=0x03 \
 *        PRINTER_IN_EP=0x81 \
 *        pnpm test:printer
 *
 *   3. Or just edit the defaults below and run:
 *        pnpm test:printer
 *
 * Press Ctrl+C to exit.
 */

import winston from 'winston';
import { buildAdapterFactory } from '../apps/electron/src/main/hardware/AdapterFactory';
import type { PrinterAdapter } from '../apps/electron/src/main/hardware/adapters/printers/PrinterAdapter';
import type { ReceiptData, USBAdapterConfig } from '../packages/shared-types/src/index';

// ── Configuration (env vars or edit these) ──

const ADAPTER_NAME = process.env.PRINTER_ADAPTER || 'StarTSP100';

function parseHexOrDec(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  return val.startsWith('0x') ? parseInt(val, 16) : parseInt(val, 10);
}

// Defaults match Star TSP143IIIU discovered via find-printers
const USB_CONFIG: USBAdapterConfig = {
  vendorId: parseHexOrDec(process.env.PRINTER_VID, 0x0519),
  productId: parseHexOrDec(process.env.PRINTER_PID, 0x0003),
  interface: parseHexOrDec(process.env.PRINTER_INTERFACE, 0),
  outEndpoint: parseHexOrDec(process.env.PRINTER_OUT_EP, 0x02),
  inEndpoint: process.env.PRINTER_IN_EP ? parseHexOrDec(process.env.PRINTER_IN_EP, 0x81) : 0x81,
};

// ── Logger ──

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level} ${message}${metaStr}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

// ── Test Receipt ──

const TEST_RECEIPT: ReceiptData = {
  lines: [
    { type: 'text', content: 'KioskOS', align: 'center', bold: true },
    { type: 'text', content: 'Printer Integration Test', align: 'center' },
    { type: 'divider' },
    { type: 'text', content: '' },
    { type: 'text', content: 'If you can read this, the', align: 'center' },
    { type: 'text', content: 'printer adapter is working!', align: 'center' },
    { type: 'text', content: '' },
    { type: 'divider' },
    { type: 'text', content: `Adapter: ${ADAPTER_NAME}`, align: 'left' },
    {
      type: 'text',
      content: `VID: 0x${USB_CONFIG.vendorId.toString(16).padStart(4, '0')}`,
      align: 'left',
    },
    {
      type: 'text',
      content: `PID: 0x${USB_CONFIG.productId.toString(16).padStart(4, '0')}`,
      align: 'left',
    },
    { type: 'text', content: `Date: ${new Date().toISOString()}`, align: 'left' },
    { type: 'text', content: '' },
    { type: 'barcode', value: '1234567890', format: 'CODE128' },
  ],
  cutAfter: true,
};

// ── Main ──

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Printer Adapter — Integration Test    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  logger.info(`Adapter:  ${ADAPTER_NAME}`);
  logger.info(
    `VID:PID:  0x${USB_CONFIG.vendorId.toString(16)}:0x${USB_CONFIG.productId.toString(16)}`,
  );
  logger.info(`Interface: ${USB_CONFIG.interface ?? 0}`);
  logger.info(`OUT EP:   0x${(USB_CONFIG.outEndpoint ?? 0).toString(16)}`);
  if (USB_CONFIG.inEndpoint !== undefined) {
    logger.info(`IN EP:    0x${USB_CONFIG.inEndpoint.toString(16)}`);
  }
  console.log('');

  // Create adapter via factory
  const factory = buildAdapterFactory();
  const registeredNames = factory.getRegisteredNames();

  if (!registeredNames.includes(ADAPTER_NAME)) {
    logger.error(`Unknown adapter: ${ADAPTER_NAME}`);
    logger.info(
      `Available adapters: ${registeredNames.filter((n) => !n.startsWith('Mock')).join(', ')}`,
    );
    process.exit(1);
  }

  const adapter = factory.createAdapter(ADAPTER_NAME, 'test-printer', logger) as PrinterAdapter;

  adapter.on('state-change', ({ previous, current }: { previous: string; current: string }) => {
    logger.info(`State: ${previous} → ${current}`);
  });

  adapter.on('error', (err: { message: string; code?: string }) => {
    logger.error(`Hardware error: ${err.message}`, { code: err.code });
  });

  // Connect
  logger.info('Connecting...');
  try {
    await adapter.connect(USB_CONFIG);
    logger.info('Connected successfully');
  } catch (err) {
    logger.error(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Print test receipt
  console.log('');
  logger.info('Printing test receipt...');
  const result = await adapter.printReceipt(TEST_RECEIPT);

  if (result.success) {
    logger.info('Print successful!');
  } else {
    logger.error(`Print failed: ${result.errorMessage}`);
  }

  // Check status
  const status = adapter.getPrinterStatus();
  logger.info('Printer status', {
    paperLow: status.paperLow,
    coverOpen: status.coverOpen,
    errorState: status.errorState,
  });

  // Give the printer time to process the data before releasing the USB interface
  await new Promise<void>((resolve) => setTimeout(resolve, 2000));

  // Disconnect
  console.log('');
  logger.info('Disconnecting...');
  await adapter.disconnect();
  logger.info('Done. Goodbye.');
}

main().catch((err) => {
  logger.error(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
