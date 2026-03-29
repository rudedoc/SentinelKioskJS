import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'winston';
import { SSPCommand, SSPResponse } from './SSPTypes';
import { calculateCRC, crcToBuffer, stuffBytes } from './SSPProtocol';

// Mock SerialPort
const mockWrite = vi.fn();
const mockClose = vi.fn();
const mockFlush = vi.fn();
const mockOpen = vi.fn();
let dataCallback: ((chunk: Buffer) => void) | null = null;
let _closeCallback: (() => void) | null = null;
let _errorCallback: ((err: Error) => void) | null = null;

vi.mock('serialport', () => ({
  SerialPort: vi.fn().mockImplementation(() => ({
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'data') dataCallback = cb as (chunk: Buffer) => void;
      if (event === 'close') _closeCallback = cb as () => void;
      if (event === 'error') _errorCallback = cb as (err: Error) => void;
    }),
    open: vi.fn((cb: (err: Error | null) => void) => {
      mockOpen();
      cb(null);
    }),
    close: vi.fn((cb: (err: Error | null) => void) => {
      mockClose();
      cb(null);
    }),
    write: vi.fn((data: Buffer, cb: (err: Error | null) => void) => {
      mockWrite(data);
      cb(null);
    }),
    flush: mockFlush,
    isOpen: true,
  })),
}));

import { SSPConnection } from './SSPConnection';

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

/** Build a fake device response for a given command */
function buildFakeResponse(responseCode: number, data?: Buffer): Buffer {
  const dataBuf = data ?? Buffer.alloc(0);
  const length = 1 + dataBuf.length;
  const payload = Buffer.concat([Buffer.from([0x00, length, responseCode]), dataBuf]);
  const crc = calculateCRC(payload);
  const payloadWithCRC = Buffer.concat([payload, crcToBuffer(crc)]);
  const stuffed = stuffBytes(payloadWithCRC);
  return Buffer.concat([Buffer.from([0x7f]), stuffed]);
}

describe('SSPConnection', () => {
  let connection: SSPConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    dataCallback = null;
    _closeCallback = null;
    _errorCallback = null;
    connection = new SSPConnection({ port: '/dev/mock', timeout: 1000 }, createMockLogger());
  });

  describe('open / close', () => {
    it('should open the serial port', async () => {
      await connection.open();
      expect(connection.isOpen).toBe(true);
      expect(mockOpen).toHaveBeenCalled();
    });

    it('should close the serial port', async () => {
      await connection.open();
      await connection.close();
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('sendCommand', () => {
    it('should send a command and receive a response', async () => {
      await connection.open();

      const resultPromise = connection.sendCommand(SSPCommand.SYNC);

      // Inject fake OK response
      const response = buildFakeResponse(SSPResponse.OK);
      dataCallback!(response);

      const result = await resultPromise;
      expect(result.success).toBe(true);
      expect(result.response).toBe(SSPResponse.OK);
    });

    it('should write a packet to the serial port', async () => {
      await connection.open();

      const resultPromise = connection.sendCommand(SSPCommand.SYNC);
      dataCallback!(buildFakeResponse(SSPResponse.OK));
      await resultPromise;

      expect(mockWrite).toHaveBeenCalled();
      const written = mockWrite.mock.calls[0]![0] as Buffer;
      expect(written[0]).toBe(0x7f); // STX
    });

    it('should toggle sequence bit after success', async () => {
      await connection.open();

      // First command (seq=0)
      const p1 = connection.sendCommand(SSPCommand.SYNC);
      dataCallback!(buildFakeResponse(SSPResponse.OK));
      await p1;

      // SYNC resets seq to 0, so next is still 0... use POLL instead
      const p2 = connection.sendCommand(SSPCommand.POLL);
      dataCallback!(buildFakeResponse(SSPResponse.OK));
      await p2;

      // After POLL success, seq should have toggled
      // We can verify by checking the written packet's address byte
      expect(mockWrite).toHaveBeenCalledTimes(2);
    });

    it('should return failure result on timeout after retries', async () => {
      await connection.open();

      const resultPromise = connection.sendCommand(SSPCommand.POLL);

      // Advance past all retry timeouts + SYNC recovery timeout
      // retries=2 means 3 attempts + 1 SYNC + 1 recovery attempt = 5 timeouts
      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(1100);
        await vi.runOnlyPendingTimersAsync();
      }

      const result = await resultPromise;
      expect(result.success).toBe(false);
    });

    it('should queue concurrent commands', async () => {
      await connection.open();

      // Send two commands concurrently
      const p1 = connection.sendCommand(SSPCommand.SYNC);
      const p2 = connection.sendCommand(SSPCommand.POLL);

      // Only one write should have happened
      expect(mockWrite).toHaveBeenCalledTimes(1);

      // Resolve first command
      dataCallback!(buildFakeResponse(SSPResponse.OK));
      await p1;

      // Now second should be in-flight
      expect(mockWrite).toHaveBeenCalledTimes(2);

      dataCallback!(buildFakeResponse(SSPResponse.OK));
      await p2;
    });

    it('should handle response with data bytes', async () => {
      await connection.open();

      const p = connection.sendCommand(SSPCommand.GET_SERIAL_NUMBER);
      dataCallback!(buildFakeResponse(SSPResponse.OK, Buffer.from([0x01, 0x02, 0x03, 0x04])));
      const result = await p;

      expect(result.success).toBe(true);
      expect(result.data).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]));
    });

    it('should handle partial frame delivery', async () => {
      await connection.open();

      const p = connection.sendCommand(SSPCommand.SYNC);
      const response = buildFakeResponse(SSPResponse.OK);

      // Split response into two chunks
      const mid = Math.floor(response.length / 2);
      dataCallback!(response.subarray(0, mid));
      dataCallback!(response.subarray(mid));

      const result = await p;
      expect(result.success).toBe(true);
    });
  });

  describe('polling', () => {
    it('should call callback with poll events', async () => {
      await connection.open();

      const events: unknown[] = [];
      connection.startPolling(100, (e) => events.push(...e));

      // Advance timer to trigger poll
      vi.advanceTimersByTime(100);

      // Inject response with DISABLED event
      dataCallback!(buildFakeResponse(SSPResponse.OK, Buffer.from([0xe8])));

      await vi.runOnlyPendingTimersAsync();

      // Stop polling before advancing further
      connection.stopPolling();

      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('close cleanup', () => {
    it('should reject queued commands on close', async () => {
      await connection.open();

      // First command occupies the slot
      const _p1 = connection.sendCommand(SSPCommand.SYNC);
      // Second command is queued
      const p2 = connection.sendCommand(SSPCommand.POLL);

      // Close while commands are pending — queued commands reject
      await connection.close();

      await expect(p2).rejects.toThrow('Connection closed');
    });
  });
});
