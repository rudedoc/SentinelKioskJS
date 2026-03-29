/**
 * Raw USB printer test — sends ESC/POS bytes directly to diagnose issues.
 * Bypasses the adapter layer entirely.
 */

import { findByIds } from 'usb';

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

const outEp = iface.endpoints.find((e) => e.address === OUT_EP);
if (!outEp || outEp.direction !== 'out') {
  console.log('OUT endpoint not found');
  process.exit(1);
}

// Build a minimal ESC/POS print sequence
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const data = Buffer.from([
  ESC,
  0x40, // ESC @ — Initialize
  ESC,
  0x61,
  0x01, // ESC a 1 — Center align
  ...Buffer.from('Hello from KioskOS!\n'),
  ESC,
  0x61,
  0x00, // ESC a 0 — Left align
  ...Buffer.from('Raw USB test\n'),
  ...Buffer.from('----------------------------\n'),
  ...Buffer.from(`Date: ${new Date().toISOString()}\n`),
  LF,
  LF,
  LF, // Feed 3 lines
  GS,
  0x56,
  0x01, // GS V 1 — Partial cut
]);

console.log(`Sending ${data.length} bytes to printer...`);
console.log('Hex:', data.toString('hex'));

(outEp as import('usb').OutEndpoint).transfer(data, (err) => {
  if (err) {
    console.log('Transfer error:', err.message);
  } else {
    console.log('Transfer complete');
  }

  // Wait for printer to process
  setTimeout(() => {
    iface.release(true, () => {
      device.close();
      console.log('Done');
    });
  }, 3000);
});
