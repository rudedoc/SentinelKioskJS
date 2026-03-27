import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { ReceiptData } from '@kioskos/shared-types';
import { IPC_CHANNELS, KioskConfig } from '@kioskos/shared-types';
import { TransactionRepo } from '../db/repositories/TransactionRepo';
import { UserEventRepo } from '../db/repositories/UserEventRepo';
import type { HardwareManager } from '../hardware/HardwareManager';
import type { BillValidatorAdapter } from '../hardware/adapters/bill-validators/BillValidatorAdapter';
import type { CoinValidatorAdapter } from '../hardware/adapters/coin-validators/CoinValidatorAdapter';
import type { PrinterAdapter } from '../hardware/adapters/printers/PrinterAdapter';
import { createModuleLogger } from '../logger';

const log = createModuleLogger('ipc');

/**
 * Registers all IPC handlers.
 * This is the single place where ipcMain.handle calls are made.
 */
export function registerIPCHandlers(
  db: Database.Database,
  config: KioskConfig,
  hardwareManager: HardwareManager,
): void {
  const transactionRepo = new TransactionRepo(db);
  const userEventRepo = new UserEventRepo(db);

  // ── State queries ──

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_BALANCE, async (_event, sessionId: string) => {
    log.debug('Getting session balance', { sessionId });
    const totalCents = transactionRepo.getSessionTotalCents(sessionId);
    return { cents: totalCents, currency: 'USD' };
  });

  ipcMain.handle(IPC_CHANNELS.GET_HARDWARE_STATUS, async () => {
    log.debug('Getting hardware status');
    return hardwareManager.healthCheck();
  });

  ipcMain.handle(IPC_CHANNELS.GET_KIOSK_CONFIG, async () => {
    return {
      kioskId: config.kioskId,
      environment: config.environment,
      appVersion: '0.1.0',
      disabled: false,
    };
  });

  // ── User events ──

  ipcMain.handle(
    IPC_CHANNELS.REPORT_USER_EVENT,
    async (_event, userEvent: { eventType: string; payload?: Record<string, unknown> }) => {
      log.debug('User event reported', { eventType: userEvent.eventType });
      userEventRepo.create({
        sessionId: 'placeholder-session',
        eventType: userEvent.eventType,
        ...(userEvent.payload !== undefined && { payload: userEvent.payload }),
      });
    },
  );

  // ── Hardware commands ──

  ipcMain.handle(IPC_CHANNELS.ENABLE_BILL_ACCEPTOR, async () => {
    log.info('Bill acceptor enable requested');
    const adapters = hardwareManager.getByCategory('bill-validator');
    for (const adapter of adapters) {
      await (adapter as BillValidatorAdapter).enable();
    }
  });

  ipcMain.handle(IPC_CHANNELS.DISABLE_BILL_ACCEPTOR, async () => {
    log.info('Bill acceptor disable requested');
    const adapters = hardwareManager.getByCategory('bill-validator');
    for (const adapter of adapters) {
      await (adapter as BillValidatorAdapter).disable();
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENABLE_COIN_ACCEPTOR, async () => {
    log.info('Coin acceptor enable requested');
    const adapters = hardwareManager.getByCategory('coin-validator');
    for (const adapter of adapters) {
      await (adapter as CoinValidatorAdapter).enable();
    }
  });

  ipcMain.handle(IPC_CHANNELS.DISABLE_COIN_ACCEPTOR, async () => {
    log.info('Coin acceptor disable requested');
    const adapters = hardwareManager.getByCategory('coin-validator');
    for (const adapter of adapters) {
      await (adapter as CoinValidatorAdapter).disable();
    }
  });

  ipcMain.handle(IPC_CHANNELS.RETURN_BILL, async () => {
    log.info('Bill return requested');
    const adapters = hardwareManager.getByCategory('bill-validator');
    for (const adapter of adapters) {
      await (adapter as BillValidatorAdapter).returnBill();
    }
  });

  ipcMain.handle(IPC_CHANNELS.PRINT_RECEIPT, async (_event, data: ReceiptData) => {
    log.info('Print receipt requested');
    const adapters = hardwareManager.getByCategory('printer');
    if (adapters.length === 0) {
      return { success: false, errorMessage: 'No printer connected' };
    }
    return (adapters[0] as PrinterAdapter).printReceipt(data);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_CASH_DRAWER, async () => {
    log.info('Cash drawer open requested');
    const adapters = hardwareManager.getByCategory('printer');
    for (const adapter of adapters) {
      await (adapter as PrinterAdapter).openCashDrawer();
    }
  });

  log.info('All IPC handlers registered');
}
