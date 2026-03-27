import type { BrowserWindow } from 'electron';
import type { Logger } from 'winston';
import { IPC_CHANNELS } from '@kioskos/shared-types';
import type { HardwareManager } from '../hardware/HardwareManager';

const EVENT_TO_CHANNEL: Record<string, string> = {
  'bill:inserted': IPC_CHANNELS.BILL_INSERTED,
  'bill:stacked': IPC_CHANNELS.BILL_STACKED,
  'coin:inserted': IPC_CHANNELS.COIN_INSERTED,
  'nfc:read': IPC_CHANNELS.NFC_READ,
  'barcode:scanned': IPC_CHANNELS.BARCODE_SCANNED,
};

/**
 * Forwards hardware events from HardwareManager to the renderer process
 * via IPC send (push from main → renderer).
 */
export function registerHardwareEventForwarding(
  hardwareManager: HardwareManager,
  mainWindow: BrowserWindow,
  logger: Logger,
): void {
  for (const [event, channel] of Object.entries(EVENT_TO_CHANNEL)) {
    hardwareManager.on(event, (data: unknown) => {
      if (mainWindow.isDestroyed()) return;
      mainWindow.webContents.send(channel, data);
      logger.debug('Forwarded hardware event to renderer', { event, channel });
    });
  }

  hardwareManager.on('adapter-error', ({ id, error }) => {
    logger.warn('Hardware adapter error', { id, code: error.code, message: error.message });
  });

  logger.info('Hardware event forwarding registered');
}
