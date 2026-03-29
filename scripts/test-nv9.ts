/**
 * NV9 Bill Validator — Isolated Hardware Test
 *
 * Reads configuration from config.json (billValidator section).
 * Falls back to NV9_PORT env var or hardcoded defaults.
 *
 * Usage:
 *   1. Configure in config.json (hardware.billValidator)
 *   2. Run: pnpm test:nv9
 *
 *   Or override the port:
 *   NV9_PORT=/dev/tty.usbserial-XXXX pnpm test:nv9
 *
 * Press Ctrl+C to gracefully shut down.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import winston from 'winston';
import {
  NV9Adapter,
  NV9AdapterConfig,
} from '../apps/electron/src/main/hardware/adapters/bill-validators/NV9Adapter';
import type { BillEvent } from '../packages/shared-types/src/hardware';

// ── Load config from config.json ──

interface ConfigFile {
  hardware?: {
    billValidator?: {
      config?: {
        port?: string;
        baudRate?: number;
        channelValues?: Record<string, number>;
        currency?: string;
        escrow?: boolean;
        maxReconnectAttempts?: number;
        reconnectDelay?: number;
      };
    };
  };
}

function loadNV9Config(): NV9AdapterConfig {
  const configPath = resolve(__dirname, '..', 'config.json');
  let fileConfig: ConfigFile = {};

  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as ConfigFile;
    } catch {
      // Fall through to defaults
    }
  }

  const nv9 = fileConfig.hardware?.billValidator?.config;

  // Channel values from config come as string keys — convert to number keys
  let channelValues: Record<number, number> = {
    1: 5,
    2: 10,
    3: 20,
    4: 50,
    5: 100,
    6: 200,
    7: 500,
  };

  if (nv9?.channelValues) {
    channelValues = {};
    for (const [k, v] of Object.entries(nv9.channelValues)) {
      channelValues[Number(k)] = v;
    }
  }

  return {
    port: process.env.NV9_PORT || nv9?.port || '/dev/tty.usbserial-AI05HDWJ',
    baudRate: nv9?.baudRate ?? 9600,
    channelValues,
    currency: nv9?.currency ?? 'EUR',
    escrow: nv9?.escrow ?? false,
    maxReconnectAttempts: nv9?.maxReconnectAttempts ?? 10,
    reconnectDelay: nv9?.reconnectDelay ?? 3000,
  };
}

const config = loadNV9Config();

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
  logger.info(`CREDIT: ${event.amountCents / 100} ${event.currency}`);
  logger.info(`  Running total: ${totalCents / 100} ${config.currency}`);
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

console.log('╔══════════════════════════════════════════╗');
console.log('║     NV9 Adapter — Isolated Test          ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');
logger.info(`Port: ${config.port}`);
logger.info(`Baud: ${config.baudRate}`);
logger.info(
  `Channels: ${Object.entries(config.channelValues)
    .map(([ch, v]) => `${ch}=${config.currency}${v}`)
    .join(', ')}`,
);
logger.info(`Escrow: ${config.escrow ?? false}`);
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
  logger.info(`Session total: ${totalCents / 100} ${config.currency}`);
  logger.info('Done. Goodbye.');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
