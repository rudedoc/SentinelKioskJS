import { describe, it, expect } from 'vitest';
import { renderBarcode, renderQR, pngToMonochromeBitmap } from './BarcodeRenderer';

describe('BarcodeRenderer', () => {
  describe('renderBarcode', () => {
    it('should render a CODE128 barcode to raster bitmap', async () => {
      const result = await renderBarcode('12345678', 'CODE128', { dpi: 203 });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.data).toBeInstanceOf(Buffer);

      // Verify bitmap size matches dimensions
      const expectedBytes = Math.ceil(result.width / 8) * result.height;
      expect(result.data.length).toBe(expectedBytes);
    });

    it('should render an EAN8 barcode', async () => {
      const result = await renderBarcode('12345670', 'EAN8', { dpi: 200 });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should render an EAN13 barcode', async () => {
      const result = await renderBarcode('5901234123457', 'EAN13');

      expect(result.width).toBeGreaterThan(0);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should contain dark pixels in the bitmap', async () => {
      const result = await renderBarcode('12345678', 'CODE128');

      // At least some bytes should be non-zero (dark pixels exist)
      const hasContent = result.data.some((byte) => byte !== 0);
      expect(hasContent).toBe(true);
    });
  });

  describe('renderQR', () => {
    it('should render a QR code to raster bitmap', async () => {
      const result = await renderQR('https://example.com', { dpi: 203 });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);

      const expectedBytes = Math.ceil(result.width / 8) * result.height;
      expect(result.data.length).toBe(expectedBytes);
    });

    it('should contain dark pixels', async () => {
      const result = await renderQR('test');
      const hasContent = result.data.some((byte) => byte !== 0);
      expect(hasContent).toBe(true);
    });
  });

  describe('pngToMonochromeBitmap', () => {
    it('should throw on invalid PNG data', () => {
      expect(() => pngToMonochromeBitmap(Buffer.from('not a png'))).toThrow('Invalid PNG');
    });
  });
});
