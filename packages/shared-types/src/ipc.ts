import type {
  BillEvent,
  CoinEvent,
  NFCEvent,
  BarcodeEvent,
  ReceiptData,
  PrintResult,
  HardwareHealthReport,
} from './hardware';
import type { MoneyAmount, UserEvent } from './events';

/**
 * The KioskAPI interface defines every method and event the wrapped web app
 * can access via window.kioskAPI. This is the contract between the renderer
 * (web app) and the main process.
 *
 * Every addition to this interface requires:
 * 1. A handler in main/ipc/
 * 2. A bridge entry in preload/index.ts
 * 3. A channel constant in this file's IPC_CHANNELS
 */
export interface KioskAPI {
  // ── Hardware → Web App (events, renderer listens) ──
  onBillInserted: (cb: (event: BillEvent) => void) => () => void;
  onBillStacked: (cb: (event: BillEvent) => void) => () => void;
  onCoinInserted: (cb: (event: CoinEvent) => void) => () => void;
  onNFCRead: (cb: (event: NFCEvent) => void) => () => void;
  onBarcodeScanned: (cb: (event: BarcodeEvent) => void) => () => void;
  onHardwareStatus: (cb: (status: HardwareHealthReport) => void) => () => void;
  onKioskDisabled: (cb: () => void) => () => void;

  // ── Web App → Hardware (commands, renderer calls) ──
  enableBillAcceptor: () => Promise<void>;
  disableBillAcceptor: () => Promise<void>;
  enableCoinAcceptor: () => Promise<void>;
  disableCoinAcceptor: () => Promise<void>;
  returnBill: () => Promise<void>;
  printReceipt: (data: ReceiptData) => Promise<PrintResult>;
  openCashDrawer: () => Promise<void>;

  // ── Web App → State (queries) ──
  getSessionBalance: () => Promise<MoneyAmount>;
  getHardwareStatus: () => Promise<HardwareHealthReport>;
  getKioskConfig: () => Promise<PublicKioskConfig>;

  // ── Web App → Kiosk (user events) ──
  reportUserEvent: (event: UserEvent) => Promise<void>;
}

/**
 * Subset of kiosk config safe to expose to the web app renderer.
 */
export interface PublicKioskConfig {
  kioskId: string;
  environment: string;
  appVersion: string;
  disabled: boolean;
}

/**
 * IPC channel names — single source of truth.
 * Main and preload must use these constants, never raw strings.
 */
export const IPC_CHANNELS = {
  // Commands (invoke/handle)
  ENABLE_BILL_ACCEPTOR: 'hardware:bill-acceptor:enable',
  DISABLE_BILL_ACCEPTOR: 'hardware:bill-acceptor:disable',
  ENABLE_COIN_ACCEPTOR: 'hardware:coin-acceptor:enable',
  DISABLE_COIN_ACCEPTOR: 'hardware:coin-acceptor:disable',
  RETURN_BILL: 'hardware:bill-acceptor:return',
  PRINT_RECEIPT: 'hardware:printer:print-receipt',
  OPEN_CASH_DRAWER: 'hardware:printer:open-drawer',
  GET_SESSION_BALANCE: 'state:session-balance',
  GET_HARDWARE_STATUS: 'state:hardware-status',
  GET_KIOSK_CONFIG: 'state:kiosk-config',
  REPORT_USER_EVENT: 'event:user',

  // Events (send/on)
  BILL_INSERTED: 'event:bill-inserted',
  BILL_STACKED: 'event:bill-stacked',
  COIN_INSERTED: 'event:coin-inserted',
  NFC_READ: 'event:nfc-read',
  BARCODE_SCANNED: 'event:barcode-scanned',
  HARDWARE_STATUS: 'event:hardware-status',
  KIOSK_DISABLED: 'event:kiosk-disabled',
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
