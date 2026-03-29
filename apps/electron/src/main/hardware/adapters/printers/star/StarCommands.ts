/**
 * Star Line Mode raster command builders.
 *
 * The TSP100III requires all content as raster bitmaps via these commands:
 *   ESC * r R       — Initialize raster mode
 *   ESC * r A       — Enter raster mode
 *   b n1 n2 d1...dk — Transfer one raster line (auto line feed)
 *   ESC * r B       — Quit raster mode (triggers FF/cut mode)
 *   ESC * r D n NUL — Drive cash drawer
 *   ESC * r F n NUL — Set form feed mode (controls cut behavior)
 */

const ESC = 0x1b;

/** ESC * r R — Initialize raster mode */
export function initRaster(): Buffer {
  return Buffer.from([ESC, 0x2a, 0x72, 0x52]);
}

/** ESC * r A — Enter raster mode */
export function enterRaster(): Buffer {
  return Buffer.from([ESC, 0x2a, 0x72, 0x41]);
}

/** ESC * r B — Quit raster mode (prints remaining data, executes FF mode) */
export function quitRaster(): Buffer {
  return Buffer.from([ESC, 0x2a, 0x72, 0x42]);
}

/** ESC * r C — Clear raster image buffer */
export function clearRaster(): Buffer {
  return Buffer.from([ESC, 0x2a, 0x72, 0x43]);
}

/**
 * ESC * r F n NUL — Set form feed mode (executed when quitting raster)
 *   n=0: no cut
 *   n=1: full cut
 *   n=2: partial cut + feed to cut position
 *   n=3: partial cut
 *   n=8: tear bar (feed to tear position)
 */
export function setFFMode(mode: number): Buffer {
  const modeChar = mode.toString().charCodeAt(0);
  return Buffer.from([ESC, 0x2a, 0x72, 0x46, modeChar, 0x00]);
}

/**
 * b n1 n2 d1...dk — Transfer one raster line with auto line feed.
 * n1 + n2*256 = number of data bytes (k).
 */
export function rasterLine(lineData: Buffer): Buffer {
  const n1 = lineData.length & 0xff;
  const n2 = (lineData.length >> 8) & 0xff;
  return Buffer.concat([Buffer.from([0x62, n1, n2]), lineData]);
}

/**
 * ESC * r D n NUL — Drive cash drawer.
 *   n=1: drawer 1
 *   n=2: drawer 2
 */
export function driveDrawer(drawer: number = 1): Buffer {
  const drawerChar = drawer.toString().charCodeAt(0);
  return Buffer.from([ESC, 0x2a, 0x72, 0x44, drawerChar, 0x00]);
}

/**
 * Build a complete raster print job from an array of dot-row buffers.
 * Includes init, enter, all lines, and quit (which triggers cut via FF mode).
 */
export function buildRasterJob(
  rows: Buffer[],
  options?: { cut?: boolean; drawer?: boolean },
): Buffer {
  const parts: Buffer[] = [];

  parts.push(initRaster());

  // Set cut mode before entering raster
  if (options?.cut !== false) {
    parts.push(setFFMode(2)); // partial cut + feed
  } else {
    parts.push(setFFMode(0)); // no cut
  }

  parts.push(enterRaster());

  // Send each row as a raster line
  for (const row of rows) {
    parts.push(rasterLine(row));
  }

  // Quit raster mode — triggers the FF mode (cut)
  parts.push(quitRaster());

  // Cash drawer
  if (options?.drawer) {
    // Drawer command works outside raster mode
    parts.push(driveDrawer(1));
  }

  return Buffer.concat(parts);
}
