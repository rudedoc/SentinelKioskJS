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
import { renderReceipt } from '../star/StarRasterRenderer';
import {
  buildRasterJob,
  initRaster,
  enterRaster,
  quitRaster,
  setFFMode,
  driveDrawer,
} from '../star/StarCommands';

export class StarTSP100Adapter extends PrinterAdapter {
  readonly manufacturer = 'Star';
  readonly model = 'TSP100';
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
      // Send raster init to put the printer in a known state
      await this.connection.write(initRaster());
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
      // Render the receipt content to raster rows
      const rows = await renderReceipt(data);

      // Build the complete raster print job
      const job = buildRasterJob(rows, {
        cut: data.cutAfter ?? false,
        drawer: data.openDrawer ?? false,
      });

      await this.connection.write(job);
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
    await this.connection.write(driveDrawer(1));
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
    // Enter raster mode with partial cut FF mode, then immediately quit to trigger cut
    await this.connection.write(
      Buffer.concat([initRaster(), setFFMode(2), enterRaster(), quitRaster()]),
    );
  }

  getPrinterStatus(): PrinterStatus {
    return {
      paperLow: false,
      coverOpen: false,
      errorState: this.connectionState === 'error' ? 'Device error' : null,
    };
  }
}
