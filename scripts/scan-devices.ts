/**
 * Device Scanner — Detect connected serial and USB devices.
 *
 * Usage:
 *   pnpm scan-devices
 *
 * Scans for:
 *   - Serial ports (USB-to-serial adapters, FTDI, etc.)
 *   - USB HID devices (barcode scanners, NFC readers)
 *
 * Useful for identifying port paths and vendor/product IDs
 * before configuring hardware adapters.
 */

import { SerialPort } from 'serialport';

// ── Serial Ports ──

async function scanSerialPorts(): Promise<void> {
  console.log('═══════════════════════════════════════════');
  console.log('  Serial Ports');
  console.log('═══════════════════════════════════════════\n');

  const ports = await SerialPort.list();

  if (ports.length === 0) {
    console.log('  No serial ports found.\n');
    return;
  }

  for (const port of ports) {
    console.log(`  Port:         ${port.path}`);
    if (port.manufacturer) console.log(`  Manufacturer: ${port.manufacturer}`);
    if (port.vendorId) console.log(`  Vendor ID:    0x${port.vendorId}`);
    if (port.productId) console.log(`  Product ID:   0x${port.productId}`);
    if (port.serialNumber) console.log(`  Serial:       ${port.serialNumber}`);
    if (port.pnpId) console.log(`  PnP ID:       ${port.pnpId}`);
    if (port.locationId) console.log(`  Location:     ${port.locationId}`);

    // Attempt to identify known hardware
    const hints = identifySerialDevice(port);
    if (hints.length > 0) {
      console.log(`  → Possible:   ${hints.join(', ')}`);
    }

    console.log('');
  }
}

function identifySerialDevice(port: {
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  path: string;
}): string[] {
  const hints: string[] = [];
  const mfr = (port.manufacturer ?? '').toLowerCase();
  const vid = (port.vendorId ?? '').toLowerCase();
  // FTDI — commonly used by ITL (NV9, NV200) and many serial devices
  if (mfr.includes('ftdi') || vid === '0403') {
    hints.push('FTDI USB-to-Serial (NV9/NV200 bill validator, coin validator, printer)');
  }

  // Prolific — common USB-to-serial chip
  if (mfr.includes('prolific') || vid === '067b') {
    hints.push('Prolific USB-to-Serial adapter');
  }

  // Silicon Labs CP210x — used by some payment devices
  if (mfr.includes('silicon') || vid === '10c4') {
    hints.push('Silicon Labs CP210x USB-to-Serial');
  }

  // ITL specific
  if (mfr.includes('itl') || mfr.includes('innovative')) {
    hints.push('Innovative Technology (NV9/NV200 bill validator)');
  }

  // Custom (printer manufacturer)
  if (mfr.includes('custom') || vid === '0dd4') {
    hints.push('Custom S.p.A. (VKP80/TG2480 printer)');
  }

  return hints;
}

// ── USB HID Devices ──

async function scanUSBHID(): Promise<void> {
  console.log('═══════════════════════════════════════════');
  console.log('  USB HID Devices');
  console.log('═══════════════════════════════════════════\n');

  try {
    // node-hid may not be installed yet
    const HID = await import('node-hid').catch(() => null);

    if (!HID) {
      console.log('  node-hid not installed — skipping HID scan.');
      console.log('  Install with: pnpm --filter @kioskos/electron add node-hid\n');
      return;
    }

    const devices = HID.devices();

    if (devices.length === 0) {
      console.log('  No HID devices found.\n');
      return;
    }

    // Filter to show only interesting devices (skip keyboards, mice, etc.)
    const interesting = devices.filter((d) => {
      // Usage page 1 = Generic Desktop (keyboards, mice, gamepads)
      // We want to show everything else, plus barcode scanners that
      // appear as keyboards (usagePage 1, usage 6)
      return d.vendorId !== 0x0000;
    });

    // Group by vendor:product to deduplicate interfaces
    const seen = new Set<string>();
    for (const device of interesting) {
      const key = `${device.vendorId}:${device.productId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      console.log(`  Product:      ${device.product ?? 'Unknown'}`);
      console.log(`  Manufacturer: ${device.manufacturer ?? 'Unknown'}`);
      console.log(`  Vendor ID:    0x${device.vendorId.toString(16).padStart(4, '0')}`);
      console.log(`  Product ID:   0x${device.productId.toString(16).padStart(4, '0')}`);
      if (device.serialNumber) console.log(`  Serial:       ${device.serialNumber}`);
      console.log(`  Path:         ${device.path}`);

      const hints = identifyHIDDevice(device);
      if (hints.length > 0) {
        console.log(`  → Possible:   ${hints.join(', ')}`);
      }

      console.log('');
    }
  } catch (err) {
    console.log(`  HID scan error: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

function identifyHIDDevice(device: {
  vendorId: number;
  productId: number;
  product?: string;
  manufacturer?: string;
  usagePage?: number;
  usage?: number;
}): string[] {
  const hints: string[] = [];
  const product = (device.product ?? '').toLowerCase();
  const mfr = (device.manufacturer ?? '').toLowerCase();
  const vid = device.vendorId;

  // ACS NFC readers (ACR122U, etc.)
  if (vid === 0x072f) {
    hints.push('ACS NFC Reader (ACR122U)');
  }

  // Honeywell barcode scanners
  if (vid === 0x0c2e || mfr.includes('honeywell')) {
    hints.push('Honeywell Barcode Scanner');
  }

  // Zebra/Symbol barcode scanners
  if (vid === 0x05e0 || mfr.includes('zebra') || mfr.includes('symbol')) {
    hints.push('Zebra/Symbol Barcode Scanner');
  }

  // Datalogic barcode scanners
  if (vid === 0x05f9 || mfr.includes('datalogic')) {
    hints.push('Datalogic Barcode Scanner');
  }

  // Generic barcode scanner hint (keyboard-wedge mode)
  if (product.includes('barcode') || product.includes('scanner')) {
    hints.push('Barcode Scanner (keyboard wedge)');
  }

  // Generic NFC/smartcard hint
  if (
    product.includes('nfc') ||
    product.includes('contactless') ||
    product.includes('smart card')
  ) {
    hints.push('NFC/Smart Card Reader');
  }

  return hints;
}

// ── System Info ──

function printSystemInfo(): void {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  KioskOS Device Scanner');
  console.log('═══════════════════════════════════════════');
  console.log(`  Platform:     ${process.platform}`);
  console.log(`  Architecture: ${process.arch}`);
  console.log(`  Node.js:      ${process.version}`);
  console.log('');
}

// ── Main ──

async function main(): Promise<void> {
  printSystemInfo();
  await scanSerialPorts();
  await scanUSBHID();

  console.log('═══════════════════════════════════════════');
  console.log('  Scan complete.');
  console.log('═══════════════════════════════════════════\n');
}

main().catch(console.error);
