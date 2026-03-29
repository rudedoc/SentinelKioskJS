/**
 * List all available serial ports.
 *
 * Usage:
 *   pnpm tsx scripts/list-ports.ts
 *
 * Look for your NV9's USB-to-serial adapter (usually manufacturer "FTDI" or similar).
 */

import { SerialPort } from 'serialport';

async function listPorts() {
  console.log('Scanning for serial ports...\n');

  const ports = await SerialPort.list();

  if (ports.length === 0) {
    console.log('No serial ports found.');
    console.log('\nMake sure your device is connected via USB-to-serial adapter.');
    return;
  }

  console.log(`Found ${ports.length} port(s):\n`);

  for (const port of ports) {
    console.log(`  Port:         ${port.path}`);
    if (port.manufacturer) console.log(`  Manufacturer: ${port.manufacturer}`);
    if (port.vendorId) console.log(`  Vendor ID:    ${port.vendorId}`);
    if (port.productId) console.log(`  Product ID:   ${port.productId}`);
    if (port.serialNumber) console.log(`  Serial:       ${port.serialNumber}`);
    if (port.pnpId) console.log(`  PnP ID:       ${port.pnpId}`);
    console.log('');
  }
}

listPorts().catch(console.error);
