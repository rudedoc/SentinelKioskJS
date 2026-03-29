import { describe, it, expect } from 'vitest';
import {
  initialize,
  setCodepage,
  text,
  bold,
  align,
  setSize,
  feed,
  lineFeed,
  cutStandard,
  openDrawer,
  divider,
  nativeBarcode,
  rasterImage,
  buildReceiptCommands,
} from './ESCPOSCommandBuilder';

describe('ESCPOSCommandBuilder', () => {
  describe('initialize', () => {
    it('should return ESC @ sequence', () => {
      expect(initialize()).toEqual(Buffer.from([0x1b, 0x40]));
    });
  });

  describe('setCodepage', () => {
    it('should return ESC t n for CP437 (page 0)', () => {
      expect(setCodepage(0)).toEqual(Buffer.from([0x1b, 0x74, 0x00]));
    });

    it('should return ESC t n for CP1252 (page 16)', () => {
      expect(setCodepage(16)).toEqual(Buffer.from([0x1b, 0x74, 0x10]));
    });

    it('should return ESC t n for CP858 (page 19)', () => {
      expect(setCodepage(19)).toEqual(Buffer.from([0x1b, 0x74, 0x13]));
    });
  });

  describe('text', () => {
    it('should encode ASCII text', () => {
      const result = text('Hello', 'ascii');
      expect(result.toString('ascii')).toBe('Hello');
    });

    it('should encode text with CP437 encoding', () => {
      const result = text('Test', 'cp437');
      expect(result.length).toBe(4);
    });
  });

  describe('bold', () => {
    it('should turn bold on', () => {
      expect(bold(true)).toEqual(Buffer.from([0x1b, 0x45, 0x01]));
    });

    it('should turn bold off', () => {
      expect(bold(false)).toEqual(Buffer.from([0x1b, 0x45, 0x00]));
    });
  });

  describe('align', () => {
    it('should align left', () => {
      expect(align('left')).toEqual(Buffer.from([0x1b, 0x61, 0x00]));
    });

    it('should align center', () => {
      expect(align('center')).toEqual(Buffer.from([0x1b, 0x61, 0x01]));
    });

    it('should align right', () => {
      expect(align('right')).toEqual(Buffer.from([0x1b, 0x61, 0x02]));
    });
  });

  describe('setSize', () => {
    it('should set normal size (1x1)', () => {
      expect(setSize(1, 1)).toEqual(Buffer.from([0x1d, 0x21, 0x00]));
    });

    it('should set double width and height (2x2)', () => {
      expect(setSize(2, 2)).toEqual(Buffer.from([0x1d, 0x21, 0x11]));
    });

    it('should clamp values to valid range', () => {
      // Max is 8x8 -> encoded as 0x77
      expect(setSize(8, 8)).toEqual(Buffer.from([0x1d, 0x21, 0x77]));
    });
  });

  describe('feed', () => {
    it('should feed specified lines', () => {
      expect(feed(3)).toEqual(Buffer.from([0x1b, 0x64, 0x03]));
    });

    it('should clamp to 0-255', () => {
      expect(feed(0)).toEqual(Buffer.from([0x1b, 0x64, 0x00]));
    });
  });

  describe('lineFeed', () => {
    it('should return LF byte', () => {
      expect(lineFeed()).toEqual(Buffer.from([0x0a]));
    });
  });

  describe('cutStandard', () => {
    it('should return GS V 1 partial cut', () => {
      expect(cutStandard()).toEqual(Buffer.from([0x1d, 0x56, 0x01]));
    });
  });

  describe('openDrawer', () => {
    it('should generate pulse on pin 0', () => {
      const result = openDrawer(0);
      expect(result[0]).toBe(0x1b);
      expect(result[1]).toBe(0x70);
      expect(result[2]).toBe(0x00); // pin 0
    });

    it('should generate pulse on pin 1', () => {
      const result = openDrawer(1);
      expect(result[2]).toBe(0x01); // pin 1
    });

    it('should default to pin 0', () => {
      const result = openDrawer();
      expect(result[2]).toBe(0x00);
    });
  });

  describe('divider', () => {
    it('should create a line of repeated characters', () => {
      const result = divider('-', 10, 'ascii');
      expect(result.toString('ascii')).toBe('----------\n');
    });
  });

  describe('nativeBarcode', () => {
    it('should generate CODE128 barcode commands', () => {
      const result = nativeBarcode('12345', 'CODE128');
      // Should contain GS H (position), GS w (width), GS h (height), GS k (barcode data)
      expect(result).toContain(0x1d); // GS
      expect(result).toContain(73); // CODE128 format code
    });

    it('should throw for unsupported format', () => {
      expect(() => nativeBarcode('123', 'INVALID')).toThrow('Unsupported native barcode format');
    });

    it('should apply width and height options', () => {
      const result = nativeBarcode('123', 'EAN8', { width: 4, height: 120 });
      // GS w 4
      const wIdx = result.indexOf(Buffer.from([0x1d, 0x77]));
      expect(wIdx).toBeGreaterThanOrEqual(0);
      expect(result[wIdx + 2]).toBe(4);
      // GS h 120
      const hIdx = result.indexOf(Buffer.from([0x1d, 0x68]));
      expect(hIdx).toBeGreaterThanOrEqual(0);
      expect(result[hIdx + 2]).toBe(120);
    });
  });

  describe('rasterImage', () => {
    it('should build GS v 0 header with correct dimensions', () => {
      // 16px wide x 2px tall = 2 bytes per row, 2 rows = 4 bytes image data
      const imageData = Buffer.from([0xff, 0x00, 0xaa, 0x55]);
      const result = rasterImage(imageData, 16, 2);

      // GS v 0 m xL xH yL yH d1...dk
      expect(result[0]).toBe(0x1d); // GS
      expect(result[1]).toBe(0x76); // v
      expect(result[2]).toBe(0x30); // 0
      expect(result[3]).toBe(0x00); // m (normal)
      expect(result[4]).toBe(2); // xL (2 bytes per row)
      expect(result[5]).toBe(0); // xH
      expect(result[6]).toBe(2); // yL (2 rows)
      expect(result[7]).toBe(0); // yH
      // Image data follows
      expect(result.subarray(8)).toEqual(imageData);
    });
  });

  describe('buildReceiptCommands', () => {
    it('should build commands for text lines', () => {
      const lines = [
        { type: 'text', content: 'Hello', align: 'center' as const, bold: true },
        { type: 'text', content: 'World' },
      ];
      const result = buildReceiptCommands(lines, 'ascii', 42);
      // Should contain align center, bold on, text, bold off, then more text
      expect(result.length).toBeGreaterThan(0);
      const str = result.toString('ascii');
      expect(str).toContain('Hello');
      expect(str).toContain('World');
    });

    it('should build divider line', () => {
      const lines = [{ type: 'divider' }];
      const result = buildReceiptCommands(lines, 'ascii', 42);
      expect(result.toString('ascii')).toContain('-'.repeat(42));
    });

    it('should build feed command', () => {
      const lines = [{ type: 'feed', lines: 3 }];
      const result = buildReceiptCommands(lines, 'ascii', 42);
      expect(result).toContain(0x1b); // ESC
      expect(result).toContain(0x64); // d
    });

    it('should skip unknown line types', () => {
      const lines = [{ type: 'barcode', value: '123' }];
      const result = buildReceiptCommands(lines, 'ascii', 42);
      expect(result.length).toBe(0);
    });
  });
});
