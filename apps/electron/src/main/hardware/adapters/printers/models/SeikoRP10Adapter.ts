import type { Logger } from 'winston';
import type {
  ReceiptData,
  PrintResult,
  PrinterStatus,
  USBAdapterConfig,
} from '@kioskos/shared-types';
import { HardwareError, HardwareErrorCode } from '@kioskos/shared-types';
import { PrinterAdapter } from '../PrinterAdapter';
import { USBPrinterConnection } from '../usb/USBPrinterConnection';
import * as cmd from '../escpos/ESCPOSCommandBuilder';
import { renderBarcode, renderQR } from '../escpos/BarcodeRenderer';

const CODEPAGE = 16; // CP1252
const ENCODING = 'cp1252';
const CHARS_PER_LINE = 42;
const CUT_COMMAND = Buffer.from([0x1d, 0x56, 0x00]); // GS V 0
const BARCODE_DPI = 203;

export class SeikoRP10Adapter extends PrinterAdapter {
  readonly manufacturer = 'Seiko';
  readonly model = 'SII RP-10';
  readonly deviceId: string;

  private connection: USBPrinterConnection;

  constructor(deviceId: string, logger: Logger) {
    super(logger);
    this.deviceId = deviceId;
    this.connection = new USBPrinterConnection(deviceId, logger);
  }

  async connect(config: USBAdapterConfig): Promise<void> {
    this.setConnectionState('connecting');

    try {
      await this.connection.open(config);
      await this.connection.write(Buffer.concat([cmd.initialize(), cmd.setCodepage(CODEPAGE)]));
      this.setConnectionState('connected');
    } catch (err) {
      this.setConnectionState('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.close();
    this.setConnectionState('disconnected');
  }

  async printReceipt(data: ReceiptData): Promise<PrintResult> {
    if (this.connectionState !== 'connected') {
      return { success: false, errorMessage: 'Printer not connected' };
    }

    try {
      const parts: Buffer[] = [];

      parts.push(cmd.initialize());
      parts.push(cmd.setCodepage(CODEPAGE));

      for (const line of data.lines) {
        switch (line.type) {
          case 'text': {
            if (line.align) parts.push(cmd.align(line.align));
            if (line.bold) parts.push(cmd.bold(true));
            parts.push(cmd.text(line.content + '\n', ENCODING));
            if (line.bold) parts.push(cmd.bold(false));
            break;
          }
          case 'barcode': {
            parts.push(cmd.align('center'));
            const barcode = await renderBarcode(line.value, line.format ?? 'CODE128', {
              dpi: BARCODE_DPI,
              moduleWidth: 0.3,
              moduleHeight: 10,
              includeText: true,
            });
            parts.push(cmd.rasterImage(barcode.data, barcode.width, barcode.height));
            parts.push(cmd.lineFeed());
            break;
          }
          case 'qr': {
            parts.push(cmd.align('center'));
            const qr = await renderQR(line.value, { dpi: BARCODE_DPI });
            parts.push(cmd.rasterImage(qr.data, qr.width, qr.height));
            parts.push(cmd.lineFeed());
            break;
          }
          case 'divider': {
            parts.push(cmd.align('left'));
            parts.push(cmd.divider('-', CHARS_PER_LINE, ENCODING));
            break;
          }
          case 'feed': {
            parts.push(cmd.feed(line.lines ?? 1));
            break;
          }
        }
      }

      if (data.openDrawer) {
        parts.push(cmd.openDrawer());
      }

      if (data.cutAfter) {
        parts.push(CUT_COMMAND);
      }

      await this.connection.write(Buffer.concat(parts));
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Print failed', { deviceId: this.deviceId, error: message });
      return { success: false, errorMessage: message };
    }
  }

  async openCashDrawer(): Promise<void> {
    if (this.connectionState !== 'connected') {
      throw new HardwareError(
        'Printer not connected',
        HardwareErrorCode.NOT_INITIALIZED,
        this.deviceId,
        'printer',
      );
    }
    await this.connection.write(cmd.openDrawer());
  }

  async cutPaper(): Promise<void> {
    if (this.connectionState !== 'connected') {
      throw new HardwareError(
        'Printer not connected',
        HardwareErrorCode.NOT_INITIALIZED,
        this.deviceId,
        'printer',
      );
    }
    await this.connection.write(CUT_COMMAND);
  }

  getPrinterStatus(): PrinterStatus {
    return {
      paperLow: false,
      coverOpen: false,
      errorState: this.connectionState === 'error' ? 'Device error' : null,
    };
  }
}
