import { describe, it, expect } from 'vitest';
import {
  calculateCRC,
  crcToBuffer,
  stuffBytes,
  unstuffBytes,
  buildPacket,
  extractFrame,
  parseResponse,
  parsePollEvents,
} from './SSPProtocol';
import { SSP_STX, SSPCommand, SSPResponse, SSPEvent } from './SSPTypes';

describe('SSPProtocol', () => {
  describe('calculateCRC', () => {
    it('should calculate CRC for a SYNC command payload', () => {
      // Payload: [addr=0x00, length=0x01, command=0x11]
      const payload = Buffer.from([0x00, 0x01, 0x11]);
      const crc = calculateCRC(payload);
      // Verify it produces a 16-bit value
      expect(crc).toBeGreaterThanOrEqual(0);
      expect(crc).toBeLessThanOrEqual(0xffff);
    });

    it('should produce different CRCs for different data', () => {
      const crc1 = calculateCRC(Buffer.from([0x00, 0x01, 0x11]));
      const crc2 = calculateCRC(Buffer.from([0x00, 0x01, 0x07]));
      expect(crc1).not.toBe(crc2);
    });

    it('should be deterministic', () => {
      const data = Buffer.from([0x00, 0x01, 0x11]);
      expect(calculateCRC(data)).toBe(calculateCRC(data));
    });

    it('should handle empty buffer', () => {
      const crc = calculateCRC(Buffer.alloc(0));
      expect(crc).toBe(0xffff); // seed unchanged
    });
  });

  describe('crcToBuffer', () => {
    it('should pack CRC as little-endian', () => {
      const buf = crcToBuffer(0x1234);
      expect(buf[0]).toBe(0x34); // low byte first
      expect(buf[1]).toBe(0x12);
    });
  });

  describe('stuffBytes / unstuffBytes', () => {
    it('should not modify data without 0x7F', () => {
      const data = Buffer.from([0x00, 0x01, 0x02]);
      expect(stuffBytes(data)).toEqual(data);
    });

    it('should double 0x7F bytes', () => {
      const data = Buffer.from([0x01, SSP_STX, 0x02]);
      const stuffed = stuffBytes(data);
      expect(stuffed).toEqual(Buffer.from([0x01, SSP_STX, SSP_STX, 0x02]));
    });

    it('should handle consecutive 0x7F bytes', () => {
      const data = Buffer.from([SSP_STX, SSP_STX]);
      const stuffed = stuffBytes(data);
      expect(stuffed).toEqual(Buffer.from([SSP_STX, SSP_STX, SSP_STX, SSP_STX]));
    });

    it('should round-trip: unstuff(stuff(x)) === x', () => {
      const original = Buffer.from([0x00, SSP_STX, 0x01, SSP_STX, SSP_STX, 0xff]);
      const roundTripped = unstuffBytes(stuffBytes(original));
      expect(roundTripped).toEqual(original);
    });

    it('should unstuff doubled 0x7F pairs', () => {
      const stuffed = Buffer.from([0x01, SSP_STX, SSP_STX, 0x02]);
      expect(unstuffBytes(stuffed)).toEqual(Buffer.from([0x01, SSP_STX, 0x02]));
    });
  });

  describe('buildPacket', () => {
    it('should build a SYNC packet', () => {
      const packet = buildPacket(0x00, 0, SSPCommand.SYNC);

      // First byte must be STX
      expect(packet[0]).toBe(SSP_STX);
      // Packet must be longer than just STX
      expect(packet.length).toBeGreaterThan(1);
    });

    it('should include params in the packet', () => {
      const packet1 = buildPacket(0x00, 0, SSPCommand.SYNC);
      const packet2 = buildPacket(0x00, 0, SSPCommand.SET_INHIBITS, Buffer.from([0xff, 0xff]));
      // Packet with params should be longer
      expect(packet2.length).toBeGreaterThan(packet1.length);
    });

    it('should set sequence bit in address byte', () => {
      const pktSeq0 = buildPacket(0x00, 0, SSPCommand.SYNC);
      const pktSeq1 = buildPacket(0x00, 1, SSPCommand.SYNC);

      // After STX, first unstuffed byte is addr|seq
      const unstuffed0 = unstuffBytes(pktSeq0.subarray(1));
      const unstuffed1 = unstuffBytes(pktSeq1.subarray(1));

      expect(unstuffed0[0]! & 0x80).toBe(0x00);
      expect(unstuffed1[0]! & 0x80).toBe(0x80);
    });
  });

  describe('extractFrame', () => {
    it('should extract a complete frame', () => {
      // Build a valid packet and strip the STX, then prepend it back as if received
      const packet = buildPacket(0x00, 0, SSPCommand.SYNC);

      // Simulate receiving the packet bytes
      const result = extractFrame(packet);

      expect(result).not.toBeNull();
      expect(result!.payload.length).toBeGreaterThanOrEqual(3);
      // Response payload: [addr|seq, length, command]
      expect(result!.payload[2]).toBe(SSPCommand.SYNC);
    });

    it('should return null for incomplete data', () => {
      const packet = buildPacket(0x00, 0, SSPCommand.SYNC);
      // Only send first 3 bytes
      const partial = packet.subarray(0, 3);
      expect(extractFrame(partial)).toBeNull();
    });

    it('should return null for empty buffer', () => {
      expect(extractFrame(Buffer.alloc(0))).toBeNull();
    });

    it('should handle extra bytes after the frame', () => {
      const packet = buildPacket(0x00, 0, SSPCommand.SYNC);
      const withExtra = Buffer.concat([packet, Buffer.from([0xde, 0xad])]);
      const result = extractFrame(withExtra);

      expect(result).not.toBeNull();
      expect(result!.remainder.length).toBeGreaterThanOrEqual(2);
    });

    it('should skip garbage before STX', () => {
      const packet = buildPacket(0x00, 0, SSPCommand.SYNC);
      const withGarbage = Buffer.concat([Buffer.from([0xaa, 0xbb]), packet]);
      const result = extractFrame(withGarbage);

      expect(result).not.toBeNull();
    });
  });

  describe('parseResponse', () => {
    it('should parse an OK response', () => {
      // Simulate payload: [addr=0x00, len=0x01, response=0xF0]
      const payload = Buffer.from([0x00, 0x01, SSPResponse.OK]);
      const result = parseResponse(payload);

      expect(result.success).toBe(true);
      expect(result.response).toBe(SSPResponse.OK);
      expect(result.data.length).toBe(0);
    });

    it('should parse a response with data', () => {
      // Payload: [addr, len=3, OK, data1, data2]
      const payload = Buffer.from([0x00, 0x03, SSPResponse.OK, 0xaa, 0xbb]);
      const result = parseResponse(payload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(Buffer.from([0xaa, 0xbb]));
    });

    it('should report failure for non-OK response', () => {
      const payload = Buffer.from([0x00, 0x01, SSPResponse.COMMAND_NOT_KNOWN]);
      const result = parseResponse(payload);

      expect(result.success).toBe(false);
      expect(result.response).toBe(SSPResponse.COMMAND_NOT_KNOWN);
    });

    it('should handle too-short payload', () => {
      const result = parseResponse(Buffer.from([0x00]));
      expect(result.success).toBe(false);
    });
  });

  describe('parsePollEvents', () => {
    it('should parse DISABLED event (no channel)', () => {
      const events = parsePollEvents(Buffer.from([SSPEvent.DISABLED]));
      expect(events).toHaveLength(1);
      expect(events[0]!.code).toBe(SSPEvent.DISABLED);
      expect(events[0]!.name).toBe('DISABLED');
      expect(events[0]!.channel).toBeUndefined();
    });

    it('should parse READ_NOTE event with channel', () => {
      const events = parsePollEvents(Buffer.from([SSPEvent.READ_NOTE, 0x03]));
      expect(events).toHaveLength(1);
      expect(events[0]!.code).toBe(SSPEvent.READ_NOTE);
      expect(events[0]!.channel).toBe(3);
    });

    it('should parse multiple events in sequence', () => {
      const data = Buffer.from([
        SSPEvent.READ_NOTE,
        0x02, // channel 2
        SSPEvent.STACKING,
        SSPEvent.STACKED,
      ]);

      const events = parsePollEvents(data);
      expect(events).toHaveLength(3);
      expect(events[0]!.code).toBe(SSPEvent.READ_NOTE);
      expect(events[0]!.channel).toBe(2);
      expect(events[1]!.code).toBe(SSPEvent.STACKING);
      expect(events[2]!.code).toBe(SSPEvent.STACKED);
    });

    it('should parse CREDIT_NOTE with channel', () => {
      const events = parsePollEvents(Buffer.from([SSPEvent.CREDIT_NOTE, 0x04]));
      expect(events).toHaveLength(1);
      expect(events[0]!.code).toBe(SSPEvent.CREDIT_NOTE);
      expect(events[0]!.channel).toBe(4);
    });

    it('should return empty array for empty data', () => {
      expect(parsePollEvents(Buffer.alloc(0))).toEqual([]);
    });

    it('should handle SLAVE_RESET (no channel)', () => {
      const events = parsePollEvents(Buffer.from([SSPEvent.SLAVE_RESET]));
      expect(events).toHaveLength(1);
      expect(events[0]!.name).toBe('SLAVE_RESET');
    });
  });
});
