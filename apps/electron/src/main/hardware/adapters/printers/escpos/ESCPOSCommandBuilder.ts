import * as iconv from 'iconv-lite';

// ── ESC/POS Command Constants ──

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Alignment values for ESC a
const ALIGN_LEFT = 0x00;
const ALIGN_CENTER = 0x01;
const ALIGN_RIGHT = 0x02;

// Native barcode format codes for GS k
const BARCODE_FORMATS: Record<string, number> = {
  UPC_A: 65,
  UPC_E: 66,
  EAN13: 67,
  EAN8: 68,
  CODE39: 69,
  ITF: 70,
  CODABAR: 71,
  CODE93: 72,
  CODE128: 73,
};

export type Alignment = 'left' | 'center' | 'right';

export interface NativeBarcodeOptions {
  width?: number;
  height?: number;
  position?: 'none' | 'above' | 'below' | 'both';
  font?: 'a' | 'b';
}

/**
 * Builds ESC/POS command byte sequences.
 * All methods are pure — they return Buffers and perform no I/O.
 */

/** ESC @ — Initialize/reset printer */
export function initialize(): Buffer {
  return Buffer.from([ESC, 0x40]);
}

/** ESC t n — Select character code table */
export function setCodepage(page: number): Buffer {
  return Buffer.from([ESC, 0x74, page]);
}

/** Encode text string using the specified codepage encoding */
export function text(content: string, encoding: string): Buffer {
  return iconv.encode(content, encoding);
}

/** ESC E n — Turn bold on/off */
export function bold(on: boolean): Buffer {
  return Buffer.from([ESC, 0x45, on ? 0x01 : 0x00]);
}

/** ESC a n — Set justification */
export function align(alignment: Alignment): Buffer {
  const value =
    alignment === 'center' ? ALIGN_CENTER : alignment === 'right' ? ALIGN_RIGHT : ALIGN_LEFT;
  return Buffer.from([ESC, 0x61, value]);
}

/** GS ! n — Set character size (width multiplier 1-8, height multiplier 1-8) */
export function setSize(width: number, height: number): Buffer {
  const w = Math.max(0, Math.min(7, width - 1));
  const h = Math.max(0, Math.min(7, height - 1));
  const n = (w << 4) | h;
  return Buffer.from([GS, 0x21, n]);
}

/** ESC d n — Print and feed n lines */
export function feed(lines: number): Buffer {
  return Buffer.from([ESC, 0x64, Math.max(0, Math.min(255, lines))]);
}

/** Line feed */
export function lineFeed(): Buffer {
  return Buffer.from([LF]);
}

/** GS V 1 — Partial cut (standard) */
export function cutStandard(): Buffer {
  return Buffer.from([GS, 0x56, 0x01]);
}

/** ESC p m t1 t2 — Generate pulse to open cash drawer */
export function openDrawer(pin: number = 0): Buffer {
  const m = pin === 1 ? 0x01 : 0x00;
  return Buffer.from([ESC, 0x70, m, 0x19, 0x78]);
}

/** Build a text divider line */
export function divider(char: string, charsPerLine: number, encoding: string): Buffer {
  const line = char.repeat(charsPerLine) + '\n';
  return iconv.encode(line, encoding);
}

/**
 * GS k m d1...dk NUL — Print barcode using native ESC/POS commands.
 * Only works on printers that support the given format natively.
 */
export function nativeBarcode(
  value: string,
  format: string,
  options?: NativeBarcodeOptions,
): Buffer {
  const formatCode = BARCODE_FORMATS[format.toUpperCase()];
  if (formatCode === undefined) {
    throw new Error(`Unsupported native barcode format: ${format}`);
  }

  const parts: Buffer[] = [];

  // GS H n — Set barcode text position
  const posMap = { none: 0, above: 1, below: 2, both: 3 };
  const pos = posMap[options?.position ?? 'below'] ?? 2;
  parts.push(Buffer.from([GS, 0x48, pos]));

  // GS f n — Set barcode text font
  if (options?.font === 'b') {
    parts.push(Buffer.from([GS, 0x66, 0x01]));
  }

  // GS w n — Set barcode width (module size 2-6)
  const width = Math.max(2, Math.min(6, options?.width ?? 3));
  parts.push(Buffer.from([GS, 0x77, width]));

  // GS h n — Set barcode height (1-255 dots)
  const height = Math.max(1, Math.min(255, options?.height ?? 100));
  parts.push(Buffer.from([GS, 0x68, height]));

  // GS k m n d1...dn — Print barcode (format B: m >= 65)
  const data = Buffer.from(value, 'ascii');
  parts.push(Buffer.from([GS, 0x6b, formatCode, data.length]));
  parts.push(data);

  return Buffer.concat(parts);
}

/**
 * GS v 0 — Print raster bit image.
 * imageData: 1-bit-per-pixel buffer, row-major, MSB first.
 * width: width in pixels (will be rounded up to multiple of 8).
 * height: height in pixels (rows).
 */
export function rasterImage(imageData: Buffer, width: number, height: number): Buffer {
  const bytesPerRow = Math.ceil(width / 8);
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  // GS v 0 m xL xH yL yH d1...dk
  const header = Buffer.from([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
  return Buffer.concat([header, imageData]);
}

/**
 * Build a complete receipt from ReceiptLine array.
 * This is the main entry point for printing — it takes the same ReceiptData.lines
 * that the adapter receives and converts to ESC/POS commands.
 */
export function buildReceiptCommands(
  lines: Array<{
    type: string;
    content?: string;
    align?: Alignment;
    bold?: boolean;
    value?: string;
    format?: string;
    lines?: number;
  }>,
  encoding: string,
  charsPerLine: number,
): Buffer {
  const parts: Buffer[] = [];

  for (const line of lines) {
    switch (line.type) {
      case 'text': {
        if (line.align) parts.push(align(line.align));
        if (line.bold) parts.push(bold(true));
        parts.push(text((line.content ?? '') + '\n', encoding));
        if (line.bold) parts.push(bold(false));
        break;
      }
      case 'divider': {
        parts.push(align('left'));
        parts.push(divider('-', charsPerLine, encoding));
        break;
      }
      case 'feed': {
        parts.push(feed(line.lines ?? 1));
        break;
      }
      // barcode and qr are handled by the adapter (native or image rendering)
      default:
        break;
    }
  }

  return Buffer.concat(parts);
}
