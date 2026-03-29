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

const CODEPAGE = 16; // CP1252
const ENCODING = 'cp1252';
const CHARS_PER_LINE = 42;

export class EpsonTM88VAdapter extends PrinterAdapter {
  readonly manufacturer = 'Epson';
  readonly model = 'TM-88V';
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

      // Reset and set encoding
      parts.push(cmd.initialize());
      parts.push(cmd.setCodepage(CODEPAGE));

      // Process lines
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
            try {
              parts.push(
                cmd.nativeBarcode(line.value, line.format ?? 'CODE39', {
                  width: 3,
                  height: 110,
                  position: 'below',
                  font: 'a',
                }),
              );
              parts.push(cmd.lineFeed());
            } catch {
              // Fallback: print barcode value as text
              parts.push(cmd.text(line.value + '\n', ENCODING));
            }
            break;
          }
          case 'qr': {
            // Epson supports native QR via GS ( k — simplified version here
            parts.push(cmd.align('center'));
            parts.push(cmd.text(`[QR: ${line.value}]\n`, ENCODING));
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
        parts.push(cmd.cutStandard());
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
    await this.connection.write(cmd.cutStandard());
  }

  getPrinterStatus(): PrinterStatus {
    return {
      paperLow: false,
      coverOpen: false,
      errorState: this.connectionState === 'error' ? 'Device error' : null,
    };
  }
}
