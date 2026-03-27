import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { IPC_CHANNELS, KioskConfig } from '@kioskos/shared-types';
import { TransactionRepo } from '../db/repositories/TransactionRepo';
import { UserEventRepo } from '../db/repositories/UserEventRepo';
import { createModuleLogger } from '../logger';

const log = createModuleLogger('ipc');

/**
 * Registers all IPC handlers.
 * This is the single place where ipcMain.handle calls are made.
 */
export function registerIPCHandlers(db: Database.Database, config: KioskConfig): void {
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
    // TODO: Wire to HardwareManager when implemented (Phase 2)
    return {
      timestamp: new Date().toISOString(),
      devices: [],
      overallHealthy: true,
    };
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
      // TODO: Get real session ID from session manager
      userEventRepo.create({
        sessionId: 'placeholder-session',
        eventType: userEvent.eventType,
        ...(userEvent.payload !== undefined && { payload: userEvent.payload }),
      });
    },
  );

  // ── Hardware commands (stubs until Phase 2) ──

  ipcMain.handle(IPC_CHANNELS.ENABLE_BILL_ACCEPTOR, async () => {
    log.info('Bill acceptor enable requested');
  });

  ipcMain.handle(IPC_CHANNELS.DISABLE_BILL_ACCEPTOR, async () => {
    log.info('Bill acceptor disable requested');
  });

  ipcMain.handle(IPC_CHANNELS.ENABLE_COIN_ACCEPTOR, async () => {
    log.info('Coin acceptor enable requested');
  });

  ipcMain.handle(IPC_CHANNELS.DISABLE_COIN_ACCEPTOR, async () => {
    log.info('Coin acceptor disable requested');
  });

  ipcMain.handle(IPC_CHANNELS.RETURN_BILL, async () => {
    log.info('Bill return requested');
  });

  ipcMain.handle(IPC_CHANNELS.PRINT_RECEIPT, async () => {
    log.info('Print receipt requested');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_CASH_DRAWER, async () => {
    log.info('Cash drawer open requested');
  });

  log.info('All IPC handlers registered');
}
