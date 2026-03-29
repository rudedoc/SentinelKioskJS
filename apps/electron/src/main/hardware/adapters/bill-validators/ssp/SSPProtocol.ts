import {
  SSP_STX,
  SSPResponse,
  EVENTS_WITH_CHANNEL,
  eventName,
  type SSPCommandResult,
  type SSPPollEvent,
} from './SSPTypes';

/**
 * CRC-16 with polynomial 0x8005 and seed 0xFFFF.
 * Matches the Python NV9Validator._calculate_crc implementation.
 */
export function calculateCRC(data: Buffer): number {
  const poly = 0x8005;
  let crc = 0xffff;

  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ poly) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc;
}

/** Pack CRC as 2 bytes little-endian */
export function crcToBuffer(crc: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(crc);
  return buf;
}

/**
 * Byte-stuff: replace every 0x7F with 0x7F 0x7F.
 */
export function stuffBytes(data: Buffer): Buffer {
  const parts: number[] = [];
  for (const byte of data) {
    parts.push(byte);
    if (byte === SSP_STX) {
      parts.push(SSP_STX);
    }
  }
  return Buffer.from(parts);
}

/**
 * Byte-unstuff: collapse every 0x7F 0x7F pair into a single 0x7F.
 */
export function unstuffBytes(data: Buffer): Buffer {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === SSP_STX && i + 1 < data.length && data[i + 1] === SSP_STX) {
      out.push(SSP_STX);
      i += 2;
    } else {
      out.push(data[i]!);
      i += 1;
    }
  }
  return Buffer.from(out);
}

/**
 * Build a complete SSP packet ready to send on the wire.
 *
 * Wire format: [STX] [stuffed(payload + CRC16-LE)]
 * Payload:     [addr|seq] [length] [command] [params...]
 * Length:      number of bytes after the length byte (command + params)
 */
export function buildPacket(
  address: number,
  sequence: number,
  command: number,
  params?: Buffer,
): Buffer {
  const addrSeq = (address & 0x7f) | ((sequence & 0x01) << 7);
  const paramBuf = params ?? Buffer.alloc(0);
  const length = 1 + paramBuf.length; // command byte + params

  const payload = Buffer.concat([Buffer.from([addrSeq, length, command]), paramBuf]);

  const crc = calculateCRC(payload);
  const payloadWithCRC = Buffer.concat([payload, crcToBuffer(crc)]);

  const stuffed = stuffBytes(payloadWithCRC);
  return Buffer.concat([Buffer.from([SSP_STX]), stuffed]);
}

/**
 * Try to extract one complete SSP frame from an accumulator buffer.
 *
 * Returns the parsed payload (unstuffed, CRC-verified, CRC removed)
 * and the remaining bytes, or null if no complete frame yet.
 */
export function extractFrame(buffer: Buffer): { payload: Buffer; remainder: Buffer } | null {
  // Find STX
  let stxIndex = -1;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === SSP_STX) {
      // Check if this is a real STX (not part of a stuffed pair from a previous partial)
      // Since we always start scanning from the beginning, the first 0x7F is STX
      stxIndex = i;
      break;
    }
  }

  if (stxIndex === -1) return null;

  // Everything after STX is stuffed data
  const afterStx = buffer.subarray(stxIndex + 1);

  // We need at least 2 unstuffed bytes to read addr|seq and length
  const unstuffed = unstuffBytes(afterStx);

  if (unstuffed.length < 3) return null; // need addr|seq, length, at least one response byte

  const declaredLength = unstuffed[1]!; // bytes after length field (command/response + params)
  if (declaredLength < 1) return null;

  const totalPayload = 2 + declaredLength; // addr|seq + length + (response + params)
  const totalWithCRC = totalPayload + 2;

  if (unstuffed.length < totalWithCRC) return null; // not enough data yet

  // Extract payload and CRC
  const payload = unstuffed.subarray(0, totalPayload);
  const rxCRC = unstuffed.readUInt16LE(totalPayload);
  const calcCRC = calculateCRC(Buffer.from(payload));

  if (rxCRC !== calcCRC) {
    // CRC mismatch — skip this STX and try to find next frame
    const remainder = buffer.subarray(stxIndex + 1);
    return extractFrame(remainder);
  }

  // Figure out how many raw bytes we consumed (STX + stuffed bytes for totalWithCRC unstuffed bytes)
  // Re-stuff the consumed portion to count raw bytes
  const consumedUnstuffed = unstuffed.subarray(0, totalWithCRC);
  const consumedStuffed = stuffBytes(Buffer.from(consumedUnstuffed));
  const rawBytesConsumed = 1 + consumedStuffed.length; // STX + stuffed data

  const remainder = buffer.subarray(stxIndex + rawBytesConsumed);

  return { payload: Buffer.from(payload), remainder };
}

/**
 * Parse a response payload (from extractFrame) into a command result.
 * Payload format: [addr|seq] [length] [response_code] [data...]
 */
export function parseResponse(payload: Buffer): SSPCommandResult {
  if (payload.length < 3) {
    return { success: false, response: 0xff, data: Buffer.alloc(0) };
  }

  const responseCode = payload[2]!;
  const data = payload.length > 3 ? Buffer.from(payload.subarray(3)) : Buffer.alloc(0);

  return {
    success: responseCode === SSPResponse.OK,
    response: responseCode,
    data,
  };
}

/**
 * Parse the data portion of a POLL response into event objects.
 * Events are a stream of 1-byte codes; some codes have a channel byte following.
 */
export function parsePollEvents(data: Buffer): SSPPollEvent[] {
  const events: SSPPollEvent[] = [];
  let i = 0;

  while (i < data.length) {
    const code = data[i]!;
    i++;

    const event: SSPPollEvent = { code, name: eventName(code) };

    if (EVENTS_WITH_CHANNEL.has(code) && i < data.length) {
      event.channel = data[i]!;
      i++;
    }

    events.push(event);
  }

  return events;
}
