/**
 * Star TSP100III — Star Line Mode raw test
 *
 * Tests printing using Star Line Mode commands (NOT ESC/POS).
 * The TSP100III defaults to Star Line Mode which uses different
 * command codes for alignment, cut, etc.
 *
 * Star Line Mode key differences from ESC/POS:
 * - Alignment: ESC GS a n (not ESC a n)
 * - Bold: ESC E (enable) / ESC F (cancel)
 * - Cut: ESC d n (0=full, 1=partial, 2=full+feed, 3=partial+feed)
 * - Line feed: LF (0x0A)
 * - Initialize: ESC @ (0x1B 0x40) — same as ESC/POS
 */

import { findByIds, type OutEndpoint } from 'usb';

const VID = 0x0519;
const PID = 0x0003;
const IFACE = 0;
const OUT_EP = 0x02;

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

// Star Line Mode command bytes
const ESC = 0x1b;
const LF = 0x0a;
const GS = 0x1d;

const parts: Buffer[] = [];

// ESC @ — Initialize
parts.push(Buffer.from([ESC, 0x40]));

// ESC GS a 1 — Center alignment (Star Line Mode uses ESC GS a, not ESC a)
parts.push(Buffer.from([ESC, GS, 0x61, 0x01]));

// ESC E — Bold on
parts.push(Buffer.from([ESC, 0x45]));
parts.push(Buffer.from('KioskOS\n'));
// ESC F — Bold off
parts.push(Buffer.from([ESC, 0x46]));

parts.push(Buffer.from('Star Line Mode Test\n'));

// ESC GS a 0 — Left alignment
parts.push(Buffer.from([ESC, GS, 0x61, 0x00]));
parts.push(Buffer.from('----------------------------\n'));
parts.push(Buffer.from(`Date: ${new Date().toISOString()}\n`));
parts.push(Buffer.from('If you can read this, Star\n'));
parts.push(Buffer.from('Line Mode is working!\n'));
parts.push(Buffer.from('----------------------------\n'));

// Feed a few lines
parts.push(Buffer.from([LF, LF, LF]));

// ESC d 3 — Partial cut with feed
parts.push(Buffer.from([ESC, 0x64, 0x03]));

const data = Buffer.concat(parts);
console.log(`Sending ${data.length} bytes (Star Line Mode)...`);

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
