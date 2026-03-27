import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'winston';
import type { HardwareCategory } from '@kioskos/shared-types';
import { HardwareError } from '@kioskos/shared-types';
import { HardwareAdapter } from './HardwareAdapter';

class StubAdapter extends HardwareAdapter<{ port: string }> {
  readonly category: HardwareCategory = 'printer';
  readonly manufacturer = 'Test';
  readonly model = 'StubDevice';
  readonly deviceId = 'stub-001';

  async connect(_config: { port: string }): Promise<void> {
    this.setConnectionState('connecting');
    this.setConnectionState('connected');
  }

  async disconnect(): Promise<void> {
    this.setConnectionState('disconnected');
  }
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

describe('HardwareAdapter', () => {
  let adapter: StubAdapter;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    adapter = new StubAdapter(logger);
  });

  it('should start in disconnected state', () => {
    expect(adapter.getConnectionState()).toBe('disconnected');
  });

  it('should transition through states on connect', async () => {
    const states: string[] = [];
    adapter.on('state-change', ({ current }) => states.push(current));

    await adapter.connect({ port: '/dev/ttyUSB0' });

    expect(states).toEqual(['connecting', 'connected']);
    expect(adapter.getConnectionState()).toBe('connected');
  });

  it('should transition to disconnected on disconnect', async () => {
    await adapter.connect({ port: '/dev/ttyUSB0' });
    await adapter.disconnect();

    expect(adapter.getConnectionState()).toBe('disconnected');
  });

  it('should return correct status structure', async () => {
    await adapter.connect({ port: '/dev/ttyUSB0' });
    const status = adapter.getStatus();

    expect(status.category).toBe('printer');
    expect(status.deviceId).toBe('stub-001');
    expect(status.manufacturer).toBe('Test');
    expect(status.model).toBe('StubDevice');
    expect(status.connectionState).toBe('connected');
    expect(status.lastSeen).toBeTruthy();
  });

  it('should return null lastSeen when disconnected', () => {
    const status = adapter.getStatus();
    expect(status.lastSeen).toBeNull();
  });

  it('should set error state and emit on emitError', () => {
    const errorHandler = vi.fn();
    adapter.on('error', errorHandler);

    const error = new HardwareError('Connection lost', 'CONNECTION_LOST', 'stub-001', 'printer');
    adapter['emitError'](error);

    expect(adapter.getConnectionState()).toBe('error');
    expect(errorHandler).toHaveBeenCalledWith(error);
    expect(logger.error).toHaveBeenCalled();
  });

  it('should not emit state-change when state is unchanged', async () => {
    await adapter.connect({ port: '/dev/ttyUSB0' });

    const stateHandler = vi.fn();
    adapter.on('state-change', stateHandler);

    // Setting to same state should not emit
    adapter['setConnectionState']('connected');
    expect(stateHandler).not.toHaveBeenCalled();
  });

  it('should log state transitions', async () => {
    await adapter.connect({ port: '/dev/ttyUSB0' });

    expect(logger.info).toHaveBeenCalledWith('Connection state changed', {
      deviceId: 'stub-001',
      previous: 'disconnected',
      current: 'connecting',
    });
    expect(logger.info).toHaveBeenCalledWith('Connection state changed', {
      deviceId: 'stub-001',
      previous: 'connecting',
      current: 'connected',
    });
  });
});
