import bwipjs from 'bwip-js';
import { inflateSync } from 'zlib';

export interface BarcodeRenderOptions {
  dpi?: number;
  moduleWidth?: number;
  moduleHeight?: number;
  quietZone?: number;
  includeText?: boolean;
}

export interface RasterResult {
  data: Buffer;
  width: number;
  height: number;
}

// Map common barcode format names to bwip-js encoder names
const FORMAT_MAP: Record<string, string> = {
  CODE128: 'code128',
  CODE39: 'code39',
  EAN13: 'ean13',
  EAN8: 'ean8',
  UPC_A: 'upca',
  UPC_E: 'upce',
  ITF: 'interleaved2of5',
  CODABAR: 'rationalizedCodabar',
  CODE93: 'code93',
  QR: 'qrcode',
};

function resolveBwipEncoder(format: string): string {
  return FORMAT_MAP[format.toUpperCase()] ?? format.toLowerCase();
}

/**
 * Render a barcode to a 1-bit raster bitmap suitable for ESC/POS GS v 0.
 * Returns the bitmap data, width, and height.
 */
export async function renderBarcode(
  value: string,
  format: string,
  options?: BarcodeRenderOptions,
): Promise<RasterResult> {
  const dpi = options?.dpi ?? 203;
  const scale = dpi / 72; // bwip-js default is 72 DPI

  const renderOpts: bwipjs.RenderOptions = {
    bcid: resolveBwipEncoder(format),
    text: value,
    scale,
    height: options?.moduleHeight ?? 12,
    includetext: options?.includeText ?? true,
    textsize: 8,
    paddingwidth: options?.quietZone ?? 2,
    paddingheight: 1,
  };

  if (options?.moduleWidth !== undefined) {
    renderOpts.width = options.moduleWidth;
  }

  const pngBuffer = await bwipjs.toBuffer(renderOpts);

  return pngToMonochromeBitmap(pngBuffer);
}

/**
 * Render a QR code to a 1-bit raster bitmap.
 */
export async function renderQR(
  value: string,
  options?: BarcodeRenderOptions,
): Promise<RasterResult> {
  const dpi = options?.dpi ?? 203;
  const scale = dpi / 72;

  const pngBuffer = await bwipjs.toBuffer({
    bcid: 'qrcode',
    text: value,
    scale,
    paddingwidth: options?.quietZone ?? 2,
    paddingheight: 2,
  });

  return pngToMonochromeBitmap(pngBuffer);
}

/**
 * Convert a PNG buffer to a 1-bit monochrome bitmap for ESC/POS raster printing.
 * Output format: MSB-first, each row padded to full bytes.
 *
 * Uses minimal PNG parsing — extracts IHDR for dimensions and IDAT for pixel data.
 * Only supports 8-bit grayscale and 8-bit RGBA PNG (which is what bwip-js produces).
 */
export function pngToMonochromeBitmap(pngBuffer: Buffer): RasterResult {
  // Parse PNG header to get dimensions
  const { width, height, pixels } = decodePNG(pngBuffer);

  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4; // RGBA
      const r = pixels[pixelIndex]!;
      const g = pixels[pixelIndex + 1]!;
      const b = pixels[pixelIndex + 2]!;
      const a = pixels[pixelIndex + 3]!;

      // Treat transparent as white, otherwise threshold at 128
      const luminance = a === 0 ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const isDark = luminance < 128;

      if (isDark) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitPosition = 7 - (x % 8);
        bitmap[byteIndex]! |= 1 << bitPosition;
      }
    }
  }

  return { data: bitmap, width, height };
}

/**
 * Minimal PNG decoder that extracts RGBA pixel data.
 * bwip-js produces simple non-interlaced PNGs, so we only need basic support.
 */
function decodePNG(buf: Buffer): { width: number; height: number; pixels: Uint8Array } {
  // Verify PNG signature
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.subarray(0, 8).compare(PNG_SIG) !== 0) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');

    if (type === 'IHDR') {
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
      bitDepth = buf[offset + 16]!;
      colorType = buf[offset + 17]!;
    } else if (type === 'IDAT') {
      idatChunks.push(buf.subarray(offset + 8, offset + 8 + length));
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length; // length(4) + type(4) + data(length) + crc(4)
  }

  if (width === 0 || height === 0) throw new Error('PNG IHDR not found');

  // Decompress IDAT
  const compressed = Buffer.concat(idatChunks);
  const raw = inflateSync(compressed);

  // Determine bytes per pixel and reconstruct scanlines
  let bpp: number;
  if (colorType === 0)
    bpp = 1; // Grayscale
  else if (colorType === 2)
    bpp = 3; // RGB
  else if (colorType === 4)
    bpp = 2; // Grayscale + Alpha
  else if (colorType === 6)
    bpp = 4; // RGBA
  else throw new Error(`Unsupported PNG color type: ${colorType}`);

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);

  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * 4); // Always output RGBA

  // PNG filter reconstruction
  const prevRow = new Uint8Array(stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset++]!;
    const row = new Uint8Array(stride);

    for (let i = 0; i < stride; i++) {
      const rawByte = raw[rawOffset++]!;
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = prevRow[i]!;
      const c = i >= bpp ? prevRow[i - bpp]! : 0;

      switch (filterType) {
        case 0:
          row[i] = rawByte;
          break;
        case 1:
          row[i] = (rawByte + a) & 0xff;
          break;
        case 2:
          row[i] = (rawByte + b) & 0xff;
          break;
        case 3:
          row[i] = (rawByte + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4:
          row[i] = (rawByte + paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          row[i] = rawByte;
      }
    }

    // Convert row to RGBA
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      if (colorType === 0) {
        // Grayscale
        const g = row[x]!;
        pixels[dstIdx] = g;
        pixels[dstIdx + 1] = g;
        pixels[dstIdx + 2] = g;
        pixels[dstIdx + 3] = 255;
      } else if (colorType === 2) {
        // RGB
        pixels[dstIdx] = row[x * 3]!;
        pixels[dstIdx + 1] = row[x * 3 + 1]!;
        pixels[dstIdx + 2] = row[x * 3 + 2]!;
        pixels[dstIdx + 3] = 255;
      } else if (colorType === 4) {
        // Grayscale + Alpha
        const g = row[x * 2]!;
        pixels[dstIdx] = g;
        pixels[dstIdx + 1] = g;
        pixels[dstIdx + 2] = g;
        pixels[dstIdx + 3] = row[x * 2 + 1]!;
      } else if (colorType === 6) {
        // RGBA
        pixels[dstIdx] = row[x * 4]!;
        pixels[dstIdx + 1] = row[x * 4 + 1]!;
        pixels[dstIdx + 2] = row[x * 4 + 2]!;
        pixels[dstIdx + 3] = row[x * 4 + 3]!;
      }
    }

    prevRow.set(row);
  }

  return { width, height, pixels };
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
