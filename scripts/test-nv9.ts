/**
 * NV9 Bill Validator — Isolated Hardware Test
 *
 * Tests the NV9Adapter in isolation without the full Electron app.
 *
 * Usage:
 *   1. Connect the NV9 via USB-to-serial
 *   2. Find the port:  pnpm tsx scripts/list-ports.ts
 *   3. Run:            NV9_PORT=/dev/cu.usbserial-XXXX pnpm tsx scripts/test-nv9.ts
 *
 * Or edit the PORT constant below.
 *
 * Press Ctrl+C to gracefully shut down.
 */

import winston from 'winston';
import {
  NV9Adapter,
  NV9AdapterConfig,
} from '../apps/electron/src/main/hardware/adapters/bill-validators/NV9Adapter';
import type { BillEvent } from '../packages/shared-types/src/hardware';

// ── Configuration ──

const PORT = process.env.NV9_PORT || '/dev/cu.usbserial-1420';

const CHANNEL_VALUES: Record<number, number> = {
  1: 5, // €5
  2: 10, // €10
  3: 20, // €20
  4: 50, // €50
  5: 100, // €100
  6: 200, // €200
  7: 500, // €500
};

const CURRENCY = 'EUR';

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

// ── Adapter ──

const adapter = new NV9Adapter('nv9-test', logger);
let totalCents = 0;

// ── Event handlers ──

adapter.on('bill:inserted', (event: BillEvent) => {
  logger.info(`Bill inserted: ${event.amountCents / 100} ${event.currency}`, {
    channel: (event as Record<string, unknown>).channel,
  });
});

adapter.on('bill:stacked', (event: BillEvent) => {
  totalCents += event.amountCents;
  console.log('');
  logger.info(`★ CREDIT: ${event.amountCents / 100} ${event.currency}`);
  logger.info(`  Running total: ${totalCents / 100} ${CURRENCY}`);
  console.log('');
});

adapter.on('bill:rejected', (event: BillEvent) => {
  logger.warn(`Bill rejected: ${event.reason ?? 'unknown reason'}`);
});

adapter.on('bill:returned', () => {
  logger.info('Bill returned to user');
});

adapter.on('state-change', ({ previous, current }) => {
  logger.info(`State: ${previous} → ${current}`);
});

adapter.on('error', (err) => {
  logger.error(`Hardware error: ${err.message}`, { code: err.code });
});

// ── Start ──

const config: NV9AdapterConfig = {
  port: PORT,
  baudRate: 9600,
  channelValues: CHANNEL_VALUES,
  currency: CURRENCY,
  escrow: false,
  maxReconnectAttempts: 10,
  reconnectDelay: 3000,
};

console.log('╔══════════════════════════════════════════╗');
console.log('║     NV9 Adapter — Isolated Test          ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');
logger.info(`Port: ${PORT}`);
logger.info(
  `Channels: ${Object.entries(CHANNEL_VALUES)
    .map(([ch, v]) => `${ch}=€${v}`)
    .join(', ')}`,
);
console.log('');

adapter
  .connect(config)
  .then(() => {
    logger.info('Connect initiated — waiting for device to initialize...');
  })
  .catch((err) => {
    logger.error(`Failed to connect: ${err.message}`);
    process.exit(1);
  });

// ── Shutdown ──

const shutdown = async () => {
  console.log('');
  logger.info('Shutting down...');
  await adapter.disconnect();
  logger.info(`Session total: ${totalCents / 100} ${CURRENCY}`);
  logger.info('Done. Goodbye.');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
