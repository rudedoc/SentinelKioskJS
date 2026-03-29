/**
 * USB Printer Discovery — Enumerate USB devices and output config snippets.
 *
 * Usage:
 *   pnpm find-printers
 *
 * Scans all USB devices, identifies bulk IN/OUT endpoints suitable for
 * ESC/POS printers, and prints config JSON you can paste into kiosk config.
 */

import { getDeviceList } from 'usb';

// Known printer vendors for hint matching
const KNOWN_PRINTERS: Record<number, string> = {
  0x04b8: 'Epson',
  0x0519: 'Epson (alt)',
  0x0dd4: 'Custom S.p.A. (VKP-80 / K80)',
  0x0619: 'Seiko Instruments (SII)',
  0x0fe6: 'Kontron / ICS',
  0x0801: 'MagTek',
  0x0416: 'Winbond (thermal)',
  0x0483: 'STMicroelectronics',
  0x0525: 'Star Micronics (composite)',
  0x0519: 'Star Micronics',
  0x1504: 'CUSTOM Engineering',
};

const BULK_TRANSFER_TYPE = 2;

interface EndpointInfo {
  address: number;
  direction: 'in' | 'out';
  transferType: number;
}

interface PrinterCandidate {
  vendorId: number;
  productId: number;
  manufacturer: string;
  product: string;
  serialNumber: string;
  interfaces: Array<{
    number: number;
    class: number;
    endpoints: EndpointInfo[];
  }>;
  suggestedConfig: {
    vendorId: number;
    productId: number;
    interface: number;
    inEndpoint: number | null;
    outEndpoint: number | null;
  } | null;
}

async function getStringDescriptor(
  device: ReturnType<typeof getDeviceList>[0],
  index: number,
): Promise<string> {
  if (index === 0) return '';
  return new Promise<string>((resolve) => {
    try {
      device.getStringDescriptor(index, (err, str) => {
        resolve(err || !str ? '' : str);
      });
    } catch {
      resolve('');
    }
  });
}

async function scanUSBDevices(): Promise<PrinterCandidate[]> {
  const devices = getDeviceList();
  const candidates: PrinterCandidate[] = [];

  for (const device of devices) {
    const desc = device.deviceDescriptor;
    const vid = desc.idVendor;
    const pid = desc.idProduct;

    // Skip USB hubs and root hubs (class 9)
    if (desc.bDeviceClass === 9) continue;

    let manufacturer = '';
    let product = '';
    let serialNumber = '';

    try {
      device.open();
      manufacturer = await getStringDescriptor(device, desc.iManufacturer);
      product = await getStringDescriptor(device, desc.iProduct);
      serialNumber = await getStringDescriptor(device, desc.iSerialNumber);
    } catch {
      // Can't open device — still show basic info
    }

    const interfaces: PrinterCandidate['interfaces'] = [];
    let suggestedConfig: PrinterCandidate['suggestedConfig'] = null;

    try {
      const deviceInterfaces = device.interfaces;
      if (deviceInterfaces) {
        for (const iface of deviceInterfaces) {
          const endpoints: EndpointInfo[] = [];

          for (const ep of iface.endpoints) {
            endpoints.push({
              address: ep.address,
              direction: ep.direction,
              transferType: ep.transferType,
            });
          }

          interfaces.push({
            number: iface.interfaceNumber,
            class: iface.descriptor.bInterfaceClass,
            endpoints,
          });

          // Look for a printer-usable interface (has bulk OUT endpoint)
          if (!suggestedConfig) {
            const bulkOut = endpoints.find(
              (e) => e.direction === 'out' && e.transferType === BULK_TRANSFER_TYPE,
            );
            const bulkIn = endpoints.find(
              (e) => e.direction === 'in' && e.transferType === BULK_TRANSFER_TYPE,
            );

            if (bulkOut) {
              suggestedConfig = {
                vendorId: vid,
                productId: pid,
                interface: iface.interfaceNumber,
                outEndpoint: bulkOut.address,
                inEndpoint: bulkIn?.address ?? null,
              };
            }
          }
        }
      }
    } catch {
      // Interface enumeration failed
    }

    try {
      device.close();
    } catch {
      // Best-effort close
    }

    // Only include devices that have at least one bulk OUT endpoint
    if (suggestedConfig) {
      candidates.push({
        vendorId: vid,
        productId: pid,
        manufacturer,
        product,
        serialNumber,
        interfaces,
        suggestedConfig,
      });
    }
  }

  return candidates;
}

function formatHex(n: number, pad = 4): string {
  return '0x' + n.toString(16).padStart(pad, '0');
}

function transferTypeName(type: number): string {
  switch (type) {
    case 0:
      return 'Control';
    case 1:
      return 'Isochronous';
    case 2:
      return 'Bulk';
    case 3:
      return 'Interrupt';
    default:
      return `Unknown(${type})`;
  }
}

function guessAdapterName(
  vid: number,
  _pid: number,
  manufacturer: string,
  product: string,
): string | null {
  const mfr = manufacturer.toLowerCase();
  const prod = product.toLowerCase();

  // Star check first — Star and Epson can share VID 0x0519
  if (mfr.includes('star') || prod.includes('tsp')) return 'StarTSP100';
  if (mfr.includes('epson') || vid === 0x04b8) return 'EpsonTM88V';
  if (mfr.includes('custom') || vid === 0x0dd4) return 'CustomVKP80';
  if (mfr.includes('seiko') || mfr.includes('sii') || vid === 0x0619) return 'SeikoRP10';
  if (prod.includes('tl60') || prod.includes('tl-60')) return 'ThermalTL60';
  return null;
}

async function main(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║        KioskOS USB Printer Discovery             ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  const candidates = await scanUSBDevices();

  if (candidates.length === 0) {
    console.log('  No USB devices with bulk endpoints found.');
    console.log('  Make sure your printer is connected and powered on.');
    console.log('');
    return;
  }

  console.log(`  Found ${candidates.length} device(s) with bulk endpoints:\n`);

  for (const dev of candidates) {
    const knownVendor = KNOWN_PRINTERS[dev.vendorId];
    const hint = guessAdapterName(dev.vendorId, dev.productId, dev.manufacturer, dev.product);

    console.log('  ─────────────────────────────────────────────');
    console.log(`  Product:      ${dev.product || 'Unknown'}`);
    console.log(`  Manufacturer: ${dev.manufacturer || 'Unknown'}`);
    console.log(
      `  VID:PID:      ${formatHex(dev.vendorId)}:${formatHex(dev.productId)} (${dev.vendorId}:${dev.productId})`,
    );
    if (dev.serialNumber) console.log(`  Serial:       ${dev.serialNumber}`);
    if (knownVendor) console.log(`  Known as:     ${knownVendor}`);
    if (hint) console.log(`  Adapter hint: ${hint}`);

    console.log('');
    console.log('  Interfaces:');
    for (const iface of dev.interfaces) {
      console.log(`    Interface ${iface.number} (class ${iface.class}):`);
      for (const ep of iface.endpoints) {
        console.log(
          `      Endpoint ${formatHex(ep.address, 2)}  ${ep.direction.toUpperCase().padEnd(3)}  ${transferTypeName(ep.transferType)}`,
        );
      }
    }

    if (dev.suggestedConfig) {
      const cfg = dev.suggestedConfig;
      console.log('');
      console.log('  Suggested config.json:');
      console.log('  ┌──────────────────────────────────────────');

      const configObj: Record<string, unknown> = {
        adapter: hint ?? 'UNKNOWN',
        config: {
          vendorId: cfg.vendorId,
          productId: cfg.productId,
          interface: cfg.interface,
          ...(cfg.inEndpoint !== null ? { inEndpoint: cfg.inEndpoint } : {}),
          outEndpoint: cfg.outEndpoint,
        },
      };

      const json = JSON.stringify({ printer: configObj }, null, 2);
      for (const line of json.split('\n')) {
        console.log(`  │ ${line}`);
      }
      console.log('  └──────────────────────────────────────────');
    }

    console.log('');
  }

  console.log('  Done.\n');
}

main().catch(console.error);
