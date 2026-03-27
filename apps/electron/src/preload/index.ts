import { contextBridge, ipcRenderer } from 'electron';
import type {
  BillEvent,
  CoinEvent,
  NFCEvent,
  BarcodeEvent,
  HardwareHealthReport,
  ReceiptData,
  UserEvent,
  KioskAPI,
} from '@kioskos/shared-types';
import { IPC_CHANNELS } from '@kioskos/shared-types';

function createEventListener<T>(channel: string) {
  return (cb: (data: T) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data as T);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

/**
 * The preload script exposes a typed `kioskAPI` to the renderer.
 * This is the ONLY bridge between the web app and the main process.
 */
const kioskAPI: KioskAPI = {
  // ── Hardware events (renderer subscribes) ──
  onBillInserted: createEventListener<BillEvent>(IPC_CHANNELS.BILL_INSERTED),
  onBillStacked: createEventListener<BillEvent>(IPC_CHANNELS.BILL_STACKED),
  onCoinInserted: createEventListener<CoinEvent>(IPC_CHANNELS.COIN_INSERTED),
  onNFCRead: createEventListener<NFCEvent>(IPC_CHANNELS.NFC_READ),
  onBarcodeScanned: createEventListener<BarcodeEvent>(IPC_CHANNELS.BARCODE_SCANNED),
  onHardwareStatus: createEventListener<HardwareHealthReport>(IPC_CHANNELS.HARDWARE_STATUS),

  onKioskDisabled: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on(IPC_CHANNELS.KIOSK_DISABLED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.KIOSK_DISABLED, handler);
  },

  // ── Hardware commands (renderer invokes) ──
  enableBillAcceptor: () => ipcRenderer.invoke(IPC_CHANNELS.ENABLE_BILL_ACCEPTOR),
  disableBillAcceptor: () => ipcRenderer.invoke(IPC_CHANNELS.DISABLE_BILL_ACCEPTOR),
  enableCoinAcceptor: () => ipcRenderer.invoke(IPC_CHANNELS.ENABLE_COIN_ACCEPTOR),
  disableCoinAcceptor: () => ipcRenderer.invoke(IPC_CHANNELS.DISABLE_COIN_ACCEPTOR),
  returnBill: () => ipcRenderer.invoke(IPC_CHANNELS.RETURN_BILL),
  printReceipt: (data: ReceiptData) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_RECEIPT, data),
  openCashDrawer: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_CASH_DRAWER),

  // ── State queries ──
  getSessionBalance: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_BALANCE),
  getHardwareStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HARDWARE_STATUS),
  getKioskConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_KIOSK_CONFIG),

  // ── User events ──
  reportUserEvent: (event: UserEvent) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_USER_EVENT, event),
};

contextBridge.exposeInMainWorld('kioskAPI', kioskAPI);
