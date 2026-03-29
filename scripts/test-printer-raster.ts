/**
 * Star TSP100III — Raster mode raw test
 *
 * The TSP100III is raster-only via direct USB.
 * Uses Star Graphic Mode raster commands:
 *   ESC * r A    — Enter raster mode
 *   b n1 n2 d... — Send one raster line (auto line feed)
 *   ESC * r B    — Quit raster mode (prints + cuts if FF mode set)
 *
 * Print width: 72mm at 203 DPI = 576 pixels = 72 bytes per line
 */

import { findByIds, type OutEndpoint } from 'usb';

const VID = 0x0519;
const PID = 0x0003;
const IFACE = 0;
const OUT_EP = 0x02;

const BYTES_PER_LINE = 72; // 576 pixels / 8

const device = findByIds(VID, PID);
if (!device) {
  console.log('Printer not found');
  process.exit(1);
}

device.open();
const iface = device.interfaces![IFACE]!;

try {
  if (iface.isKernelDriverActive()) iface.detachKernelDriver();
} catch {
  /* ignore */
}

iface.claim();

const outEp = iface.endpoints.find((e) => e.address === OUT_EP) as OutEndpoint;
if (!outEp || outEp.direction !== 'out') {
  console.log('OUT endpoint not found');
  process.exit(1);
}

// ── Raster commands ──

const ENTER_RASTER = Buffer.from([0x1b, 0x2a, 0x72, 0x41]); // ESC * r A
const QUIT_RASTER = Buffer.from([0x1b, 0x2a, 0x72, 0x42]); // ESC * r B
const INIT_RASTER = Buffer.from([0x1b, 0x2a, 0x72, 0x52]); // ESC * r R

// Set FF mode to cut after quit: ESC * r F n NUL
// n=2 means partial cut + feed
const SET_FF_CUT = Buffer.from([0x1b, 0x2a, 0x72, 0x46, 0x32, 0x00]); // ESC * r F "2" NUL

/** Build a raster line command: b n1 n2 d1...dk */
function rasterLine(lineData: Buffer): Buffer {
  const n1 = lineData.length & 0xff;
  const n2 = (lineData.length >> 8) & 0xff;
  return Buffer.concat([Buffer.from([0x62, n1, n2]), lineData]);
}

/** Create a blank (white) raster line */
function blankLine(): Buffer {
  return rasterLine(Buffer.alloc(BYTES_PER_LINE, 0x00));
}

/** Create a solid black line */
function solidLine(): Buffer {
  return rasterLine(Buffer.alloc(BYTES_PER_LINE, 0xff));
}

/**
 * Render a single line of 1-bit text using a hardcoded 5x7 pixel font.
 * This is crude but proves the raster pipeline works.
 */
const FONT: Record<string, number[]> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
  A: [0x7e, 0x09, 0x09, 0x09, 0x7e],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x41, 0x3e],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x3a],
  H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x41, 0x7f, 0x41, 0x00, 0x00],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x04, 0x02, 0x7f],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x26, 0x49, 0x49, 0x49, 0x32],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  W: [0x3f, 0x40, 0x30, 0x40, 0x3f],
  '!': [0x00, 0x00, 0x5f, 0x00, 0x00],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
  '1': [0x00, 0x42, 0x7f, 0x40, 0x00],
  '2': [0x62, 0x51, 0x49, 0x49, 0x46],
  '3': [0x22, 0x41, 0x49, 0x49, 0x36],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  ':': [0x00, 0x36, 0x36, 0x00, 0x00],
};

/**
 * Render text as a series of raster lines (7 rows per text row, scaled 2x).
 * Returns an array of Buffers, one per raster dot row.
 */
function renderTextLines(text: string, scale: number = 2): Buffer[] {
  const charWidth = 5 * scale + scale; // 5 pixel cols + 1 gap, scaled
  const rows: Buffer[] = [];

  // Center the text
  const textPixelWidth = text.length * charWidth;
  const offsetPixels = Math.max(0, Math.floor((BYTES_PER_LINE * 8 - textPixelWidth) / 2));

  for (let fontRow = 0; fontRow < 7; fontRow++) {
    for (let sy = 0; sy < scale; sy++) {
      const line = Buffer.alloc(BYTES_PER_LINE, 0x00);

      for (let charIdx = 0; charIdx < text.length; charIdx++) {
        const glyph = FONT[text[charIdx]!.toUpperCase()] ?? FONT[' ']!;

        for (let col = 0; col < 5; col++) {
          const bit = (glyph[col]! >> fontRow) & 1;
          if (bit) {
            for (let sx = 0; sx < scale; sx++) {
              const px = offsetPixels + charIdx * charWidth + col * scale + sx;
              const byteIdx = Math.floor(px / 8);
              const bitIdx = 7 - (px % 8);
              if (byteIdx < BYTES_PER_LINE) {
                line[byteIdx]! |= 1 << bitIdx;
              }
            }
          }
        }
      }

      rows.push(rasterLine(line));
    }
  }

  return rows;
}

// ── Build the print job ──

const parts: Buffer[] = [];

// Initialize and enter raster mode
parts.push(INIT_RASTER);
parts.push(SET_FF_CUT);
parts.push(ENTER_RASTER);

// Blank lines (top margin)
for (let i = 0; i < 20; i++) parts.push(blankLine());

// Header
parts.push(...renderTextLines('KIOSKOS', 3));
for (let i = 0; i < 10; i++) parts.push(blankLine());

// Divider
parts.push(solidLine());
parts.push(blankLine());

// Body text
parts.push(...renderTextLines('STAR TSP100 TEST'));
for (let i = 0; i < 8; i++) parts.push(blankLine());
parts.push(...renderTextLines('RASTER MODE'));
for (let i = 0; i < 8; i++) parts.push(blankLine());

// Another divider
parts.push(solidLine());
for (let i = 0; i < 10; i++) parts.push(blankLine());

parts.push(...renderTextLines('IT WORKS!', 3));

// Bottom margin
for (let i = 0; i < 40; i++) parts.push(blankLine());

// Quit raster mode (triggers FF mode = cut)
parts.push(QUIT_RASTER);

const data = Buffer.concat(parts);
console.log(`Sending ${data.length} bytes (Star Raster Mode)...`);

outEp.transfer(data, (err) => {
  if (err) {
    console.log('Transfer error:', err.message);
  } else {
    console.log('Transfer complete');
  }

  setTimeout(() => {
    iface.release(true, () => {
      device.close();
      console.log('Done');
    });
  }, 3000);
});
