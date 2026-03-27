# KioskOS — Phase 2: Hardware Abstraction Guide

> **Audience**: Claude Code (AI coding agent) and developer.
> **Goal**: Implement the hardware abstraction layer (HAL) with adapter pattern, mock adapters for all 5 peripheral categories, HardwareManager registry, serial/USB helpers, and wire hardware events through IPC to the web app.
>
> **Rule**: Complete each step fully before moving to the next. Every step ends with a verification command that must pass.

---

## Prerequisites

- Phase 1 complete and passing all checks
- `pnpm run typecheck` passes
- `pnpm run test` passes (14 tests)
- `pnpm run dev` launches the Electron app

---

## Step 1: Extend Shared Types for Adapter Contracts

**Goal**: Define the abstract adapter interfaces and hardware-specific types in `shared-types` so all downstream code has a stable contract before any implementation begins.

### Additions to `packages/shared-types/src/hardware.ts`

```typescript
// Printer-specific status
export interface PrinterStatus {
  paperLow: boolean;
  coverOpen: boolean;
  errorState: string | null;
}

// Validator states
export type BillValidatorState =
  | 'idle'
  | 'accepting'
  | 'escrowed'
  | 'stacking'
  | 'returning'
  | 'disabled'
  | 'error';

export type CoinValidatorState = 'idle' | 'accepting' | 'disabled' | 'error';

// Adapter config types for different communication protocols
export interface SerialAdapterConfig {
  port: string;
  baudRate: number;
}

export interface USBAdapterConfig {
  vendorId: number;
  productId: number;
}

export interface NetworkAdapterConfig {
  host: string;
  port: number;
}

// Hardware error codes
export enum HardwareErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_LOST = 'CONNECTION_LOST',
  COMMAND_TIMEOUT = 'COMMAND_TIMEOUT',
  DEVICE_BUSY = 'DEVICE_BUSY',
  PAPER_JAM = 'PAPER_JAM',
  PAPER_OUT = 'PAPER_OUT',
  BILL_JAM = 'BILL_JAM',
  CASH_BOX_FULL = 'CASH_BOX_FULL',
  CASH_BOX_REMOVED = 'CASH_BOX_REMOVED',
  UNKNOWN_DEVICE = 'UNKNOWN_DEVICE',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
}

// Mock adapter configuration
export interface MockAdapterOptions {
  simulationIntervalMs?: number;
  failureRate?: number;
  autoStart?: boolean;
}
```

### Verification

```bash
pnpm run typecheck  # Should pass with zero errors
```

---

## Step 2: Create the Abstract Base Adapter Class

**Goal**: Implement the root `HardwareAdapter` abstract class that every category adapter extends. This defines the lifecycle contract (connect, disconnect, getStatus, error handling, reconnection).

### File: `apps/electron/src/main/hardware/HardwareAdapter.ts`

- Abstract class `HardwareAdapter<TConfig = unknown>` extending `EventEmitter`
- Abstract properties: `readonly category: HardwareCategory`, `readonly manufacturer: string`, `readonly model: string`, `readonly deviceId: string`
- Abstract methods: `connect(config: TConfig): Promise<void>`, `disconnect(): Promise<void>`, `getStatus(): HardwareStatus`
- Concrete protected state: `connectionState: HardwareConnectionState` (default `'disconnected'`)
- Optional lifecycle hooks: `onError(error: Error): void`, `onReconnect(): Promise<void>`
- Protected helper `emitError(error: HardwareError): void` that sets state and emits typed event
- Constructor takes `logger: winston.Logger` via DI

### Test: `apps/electron/src/main/hardware/HardwareAdapter.test.ts`

- Create a concrete stub subclass and test state transitions
- Test `emitError` sets connection state and emits event
- Test `getStatus` returns correct structure

### Verification

```bash
pnpm run typecheck
pnpm --filter @kioskos/electron test
```

---

## Step 3: Create Category-Specific Abstract Adapters

**Goal**: One abstract class per hardware category that extends `HardwareAdapter` and adds domain-specific abstract methods. These are the interfaces that concrete adapters (real and mock) must implement.

### Files to create (5 files)

1. `apps/electron/src/main/hardware/adapters/printers/PrinterAdapter.ts`
   - Extends `HardwareAdapter<SerialAdapterConfig | USBAdapterConfig | NetworkAdapterConfig>`
   - Sets `category = 'printer'`
   - Abstract methods: `printReceipt(data: ReceiptData): Promise<PrintResult>`, `openCashDrawer(): Promise<void>`, `cutPaper(): Promise<void>`, `getPrinterStatus(): PrinterStatus`

2. `apps/electron/src/main/hardware/adapters/bill-validators/BillValidatorAdapter.ts`
   - Extends `HardwareAdapter<SerialAdapterConfig>`
   - Sets `category = 'bill-validator'`
   - Abstract methods: `enable(): Promise<void>`, `disable(): Promise<void>`, `returnBill(): Promise<void>`, `getValidatorState(): BillValidatorState`
   - Typed events the subclass must emit: `'bill:inserted'`, `'bill:stacked'`, `'bill:rejected'`, `'bill:returned'`

3. `apps/electron/src/main/hardware/adapters/coin-validators/CoinValidatorAdapter.ts`
   - Extends `HardwareAdapter<SerialAdapterConfig>`
   - Sets `category = 'coin-validator'`
   - Abstract methods: `enable(): Promise<void>`, `disable(): Promise<void>`, `getValidatorState(): CoinValidatorState`
   - Typed events: `'coin:inserted'`, `'coin:rejected'`

4. `apps/electron/src/main/hardware/adapters/nfc/NFCAdapter.ts`
   - Extends `HardwareAdapter<USBAdapterConfig>`
   - Sets `category = 'nfc'`
   - Abstract methods: `startPolling(): Promise<void>`, `stopPolling(): Promise<void>`
   - Typed events: `'nfc:read'`, `'nfc:removed'`

5. `apps/electron/src/main/hardware/adapters/barcode/BarcodeAdapter.ts`
   - Extends `HardwareAdapter<USBAdapterConfig>`
   - Sets `category = 'barcode'`
   - Abstract methods: `startListening(): Promise<void>`, `stopListening(): Promise<void>`
   - Typed events: `'barcode:scanned'`

### Verification

```bash
pnpm run typecheck  # No tests yet for abstract classes
```

---

## Step 4: Implement Mock Adapters for All 5 Categories

**Goal**: Create mock implementations that simulate hardware behavior using timers and randomization. These are used in development (`KIOSKOS_MOCK_HARDWARE=true`) and in all unit/integration tests. Each mock should be configurable (delay, failure rate).

### Files to create (5 adapters + 5 tests)

1. `apps/electron/src/main/hardware/adapters/printers/MockPrinterAdapter.ts`
   - Extends `PrinterAdapter`, manufacturer `'Mock'`, model `'MockPrinter'`
   - `connect()`: sets state to `'connected'` after configurable delay (default 100ms)
   - `printReceipt()`: logs receipt lines, returns `{ success: true }` after delay; configurable failure rate
   - `openCashDrawer()`: logs and resolves
   - `cutPaper()`: logs and resolves
   - `getPrinterStatus()`: returns healthy status

2. `apps/electron/src/main/hardware/adapters/bill-validators/MockBillValidatorAdapter.ts`
   - Extends `BillValidatorAdapter`
   - `enable()`: starts interval emitting simulated `bill:inserted` events (configurable denominations: [100, 500, 1000, 2000] cents)
   - After insert, auto-emits `bill:stacked` after short delay (simulating accept cycle)
   - Configurable reject rate (e.g., 10% of inserts get `bill:rejected`)
   - `disable()`: stops the interval
   - `returnBill()`: emits `bill:returned` if in escrowed state

3. `apps/electron/src/main/hardware/adapters/coin-validators/MockCoinValidatorAdapter.ts`
   - Extends `CoinValidatorAdapter`
   - Similar pattern: `enable()` starts interval emitting `coin:inserted` with random denominations [5, 10, 25, 50, 100] cents
   - Configurable reject rate

4. `apps/electron/src/main/hardware/adapters/nfc/MockNFCAdapter.ts`
   - Extends `NFCAdapter`
   - `startPolling()`: emits `nfc:read` every N seconds with random UID
   - `stopPolling()`: stops interval
   - Emits `nfc:removed` after delay following each read

5. `apps/electron/src/main/hardware/adapters/barcode/MockBarcodeAdapter.ts`
   - Extends `BarcodeAdapter`
   - `startListening()`: emits `barcode:scanned` with sample barcodes at interval
   - `stopListening()`: stops

### Test files (5 files)

- `MockPrinterAdapter.test.ts`
- `MockBillValidatorAdapter.test.ts`
- `MockCoinValidatorAdapter.test.ts`
- `MockNFCAdapter.test.ts`
- `MockBarcodeAdapter.test.ts`

Each test should verify:

- Connect/disconnect lifecycle
- Events are emitted correctly with proper payloads
- Enable/disable stops and starts event emission
- Configurable failure rates produce expected behavior

### Verification

```bash
pnpm run typecheck
pnpm --filter @kioskos/electron test
```

---

## Step 5: Implement the HardwareManager (Registry + Lifecycle)

**Goal**: Build the central `HardwareManager` that holds all active adapters, manages their lifecycle, and provides a unified API for the IPC layer.

### File: `apps/electron/src/main/hardware/HardwareManager.ts`

- Extends `EventEmitter`
- Constructor takes: `logger: winston.Logger`, `hardwareEventRepo: HardwareEventRepo`
- Private `adapters: Map<string, HardwareAdapter>`
- Methods:
  - `register(id: string, adapter: HardwareAdapter): void` — stores adapter, subscribes to its events, logs registration
  - `unregister(id: string): Promise<void>` — calls `adapter.disconnect()`, removes from map
  - `getAdapter<T extends HardwareAdapter>(id: string): T` — typed retrieval, throws `HardwareError` if not found
  - `getByCategory(category: HardwareCategory): HardwareAdapter[]` — returns all adapters of a category
  - `connectAll(): Promise<void>` — iterates all adapters, calls connect, logs results; does not throw on individual failure (logs error, continues)
  - `disconnectAll(): Promise<void>` — graceful shutdown
  - `healthCheck(): HardwareHealthReport` — aggregates status from all adapters
- Event forwarding: When any adapter emits a domain event (e.g., `bill:inserted`), HardwareManager re-emits it so the IPC layer has a single listener point
- Persists hardware events to `HardwareEventRepo` for every state change

### Test: `apps/electron/src/main/hardware/HardwareManager.test.ts`

- Test registration and retrieval
- Test `connectAll()` with mix of successful and failing mock adapters
- Test `healthCheck()` aggregation
- Test event forwarding from adapter to manager
- Test `disconnectAll()` cleanup

### Verification

```bash
pnpm --filter @kioskos/electron test
```

---

## Step 6: Implement the Adapter Factory and Config Resolution

**Goal**: Build a factory that creates the correct adapter instance based on config and a top-level initialization function.

### File: `apps/electron/src/main/hardware/AdapterFactory.ts`

- `AdapterRegistry` — a `Map<string, AdapterConstructor>` mapping adapter names to constructors
- `registerAdapter(name: string, ctor: AdapterConstructor): void`
- `createAdapter(name: string, deviceId: string, logger: Logger): HardwareAdapter`
- Factory function `buildAdapterRegistry(): AdapterRegistry` that registers all known adapters

### File: `apps/electron/src/main/hardware/createHardwareStack.ts`

Top-level initialization function called from `index.ts`:

- Reads `config.hardware`
- For each configured device, uses `AdapterFactory` to create the adapter
- Registers each adapter with `HardwareManager`
- If `KIOSKOS_MOCK_HARDWARE=true` and no config, creates mock adapters for all categories
- Calls `manager.connectAll()`
- Returns the initialized `HardwareManager`

### Test: `apps/electron/src/main/hardware/AdapterFactory.test.ts`

- Known adapter names resolve correctly
- Unknown adapter names throw `HardwareError` with `UNKNOWN_DEVICE` code
- Mock fallback in dev mode

### Verification

```bash
pnpm run typecheck
pnpm --filter @kioskos/electron test
```

---

## Step 7: Wire Hardware Events Through IPC to the Web App

**Goal**: Connect HardwareManager event emissions to the IPC layer so the preload bridge (already built in Phase 1) receives hardware events and forwards them to the renderer.

### File to create: `apps/electron/src/main/ipc/hardwareEvents.ts`

- Function `registerHardwareEventForwarding(hardwareManager: HardwareManager, mainWindow: BrowserWindow): void`
- Listens to HardwareManager events and calls `mainWindow.webContents.send()` with the correct IPC channel
- Event mapping:
  - `bill:inserted` -> `IPC_CHANNELS.BILL_INSERTED`
  - `bill:stacked` -> `IPC_CHANNELS.BILL_STACKED`
  - `coin:inserted` -> `IPC_CHANNELS.COIN_INSERTED`
  - `nfc:read` -> `IPC_CHANNELS.NFC_READ`
  - `barcode:scanned` -> `IPC_CHANNELS.BARCODE_SCANNED`
- Also forwards periodic health reports on `IPC_CHANNELS.HARDWARE_STATUS`

### Files to modify

- `apps/electron/src/main/ipc/register.ts`
  - Change signature: `registerIPCHandlers(db, config, hardwareManager: HardwareManager)`
  - Replace hardware command stubs with real calls to adapters via HardwareManager
  - Replace `GET_HARDWARE_STATUS` stub with `hardwareManager.healthCheck()`
  - Each handler wraps in try/catch, returning appropriate error structure

- `apps/electron/src/main/index.ts`
  - Import and call `createHardwareStack(config, db, logger)`
  - Pass `HardwareManager` to `registerIPCHandlers`
  - Call `registerHardwareEventForwarding(hardwareManager, mainWindow)` after window creation
  - Add `hardwareManager.disconnectAll()` to `window-all-closed` handler

### Test: `apps/electron/src/main/ipc/hardwareEvents.test.ts`

- Mock `BrowserWindow.webContents.send`
- Create mock adapters, emit events, verify IPC sends are called with correct channels and payloads

### Verification

```bash
pnpm run typecheck
pnpm --filter @kioskos/electron test
```

---

## Step 8: Implement Serial Port Helpers

**Goal**: Add the `serialport` npm dependency and create helper utilities for serial communication that concrete adapters will use.

### New dependency

```bash
pnpm --filter @kioskos/electron add serialport
```

### File: `apps/electron/src/main/hardware/serial.ts`

- `SerialConnection` class wrapping `serialport`:
  - Constructor: `port: string`, `baudRate: number`, `logger: Logger`
  - `open(): Promise<void>` — opens the port, resolves on 'open' event
  - `close(): Promise<void>` — closes gracefully
  - `write(data: Buffer): Promise<void>` — writes and drains
  - `onData(cb: (data: Buffer) => void): void` — subscribes to data events
  - `isOpen: boolean` getter
  - Built-in reconnection: configurable retry count and backoff; emits `'reconnected'` or `'reconnect-failed'`
- `listSerialPorts(): Promise<PortInfo[]>` — wraps `SerialPort.list()` for port discovery
- Error mapping: serialport errors -> `HardwareError` with appropriate codes

### Test: `apps/electron/src/main/hardware/serial.test.ts`

- Mock the `serialport` module with `vitest.mock()`
- Test open/close lifecycle
- Test write + drain
- Test reconnection logic with simulated failures
- Test error mapping

### Verification

```bash
pnpm --filter @kioskos/electron test
```

---

## Step 9: First Concrete Adapter — NV9 Bill Validator (SSP/eSSP)

**Goal**: Port existing NV9 code into the adapter pattern. The NV9 uses Innovative Technology's SSP (Sealedbus Serial Protocol) / eSSP over serial.

> **Note**: Existing NV9 code will be carried over and adapted to extend `BillValidatorAdapter`.

### File: `apps/electron/src/main/hardware/adapters/bill-validators/ssp.ts`

SSP/eSSP protocol helpers (pure functions + framing):

- `buildSSPPacket(command: number, data?: Buffer): Buffer` — STX, length, sequence, command, data, CRC, STX
- `parseSSPResponse(buffer: Buffer): SSPResponse` — parse response frames
- `calculateCRC(data: Buffer): number` — CRC-CCITT
- SSP command constants: `RESET`, `POLL`, `ENABLE`, `DISABLE`, `REJECT`, `GET_SERIAL`, etc.
- SSP poll response event codes: bill inserted, bill stacked, bill rejected, etc.

### File: `apps/electron/src/main/hardware/adapters/bill-validators/NV9Adapter.ts`

- Extends `BillValidatorAdapter`
- Uses `SerialConnection` (9600 baud, SSP protocol)
- `connect()`: opens serial, sends SYNC, RESET, SETUP_REQUEST to initialise
- `enable()`: sends ENABLE command, starts poll interval
- `disable()`: sends DISABLE command, stops polling
- `returnBill()`: sends REJECT command if bill escrowed
- Poll loop: sends POLL command at interval, parses response for bill events
- Maps SSP event codes to `bill:inserted`, `bill:stacked`, `bill:rejected`, `bill:returned` events

### Tests

- `ssp.test.ts` — pure function tests for packet building, CRC, response parsing
- `NV9Adapter.test.ts` — mock `SerialConnection`, feed simulated SSP response bytes, verify correct events emitted

### Verification

```bash
pnpm --filter @kioskos/electron test
```

---

## Step 10: Concrete Adapters — G13 Coin Validator and Custom VKP80 Printer

**Goal**: Implement the remaining two priority hardware adapters.

### New dependencies

```bash
pnpm --filter @kioskos/electron add node-hid nfc-pcsc
```

### G13 Coin Validator (ccTalk over serial)

**File**: `apps/electron/src/main/hardware/adapters/coin-validators/cctalk.ts`

- ccTalk protocol helpers:
  - `buildCCTalkMessage(dest: number, source: number, header: number, data?: Buffer): Buffer`
  - `parseCCTalkResponse(buffer: Buffer): CCTalkResponse`
  - `calculateChecksum(data: Buffer): number`
  - ccTalk header constants: `SIMPLE_POLL`, `READ_BUFFERED_CREDIT`, `MASTER_INHIBIT`, `MODIFY_INHIBIT`

**File**: `apps/electron/src/main/hardware/adapters/coin-validators/G13Adapter.ts`

- Extends `CoinValidatorAdapter`
- Uses `SerialConnection` (ccTalk protocol, 9600 baud, 8N1)
- `connect()`: opens serial, sends Simple Poll to verify device
- `enable()`: sends Master Inhibit OFF, starts credit poll interval
- `disable()`: sends Master Inhibit ON, stops polling
- Poll loop: reads buffered credits, maps coin codes to denominations
- Emits `coin:inserted` with amount for each credit

### Custom VKP80 Printer (ESC/POS over serial/USB)

**File**: `apps/electron/src/main/hardware/adapters/printers/escpos.ts`

- Pure functions that build ESC/POS byte sequences:
  - `initPrinter(): Buffer`
  - `printText(text: string, options?: { bold?: boolean; align?: 'left'|'center'|'right' }): Buffer`
  - `printBarcode(value: string, format?: string): Buffer`
  - `printQR(value: string): Buffer`
  - `feedAndCut(lines?: number): Buffer`
  - `openDrawer(): Buffer`
  - `buildReceipt(data: ReceiptData): Buffer` — assembles full receipt from `ReceiptLine[]`

**File**: `apps/electron/src/main/hardware/adapters/printers/CustomVKP80Adapter.ts`

- Extends `PrinterAdapter`
- Uses `SerialConnection` to send ESC/POS commands
- `connect()`: opens the port, sends init command
- `printReceipt()`: builds ESC/POS buffer via `buildReceipt()`, writes to connection
- `openCashDrawer()`: sends drawer kick command
- `cutPaper()`: sends partial cut command
- `getPrinterStatus()`: queries DLE EOT status

### Concrete Adapter Stubs — NFC and Barcode

These remain as stubs until hardware is available for testing:

1. `apps/electron/src/main/hardware/adapters/nfc/ACR122UAdapter.ts`
   - Extends `NFCAdapter`
   - Uses `nfc-pcsc` for PC/SC smart card detection
   - `startPolling()`: begins card detection loop
   - Emits `nfc:read` with UID and optional NDEF data
   - Emits `nfc:removed` when card leaves field

2. `apps/electron/src/main/hardware/adapters/barcode/HoneywellHIDAdapter.ts`
   - Extends `BarcodeAdapter`
   - Uses `node-hid` for USB HID keyboard-wedge input
   - `startListening()`: opens HID device, accumulates keystrokes
   - Emits `barcode:scanned` on Enter key

### Tests (all adapters, mocking all I/O)

Each test should:

- Mock the underlying I/O library (`serialport`, `node-hid`, `nfc-pcsc`)
- Test connect/disconnect lifecycle
- Feed simulated data bytes and verify correct events are emitted
- Test error handling (disconnection, timeout, malformed data)

### Verification

```bash
pnpm run typecheck
pnpm --filter @kioskos/electron test
```

---

## Step 11: Hardware Event Persistence and Transaction Recording

**Goal**: When money events flow through the system (bill stacked, coin inserted), automatically record them as transactions in the database. Hardware state changes are persisted as hardware events.

### Modifications to `HardwareManager.ts`

- Update constructor to also accept `TransactionRepo` via DI
- On `bill:stacked`: call `transactionRepo.create()` with type `'bill_stack'`, amount, device ID
- On `bill:inserted`: call `transactionRepo.create()` with type `'bill_insert'`
- On `bill:rejected`: call `transactionRepo.create()` with type `'bill_reject'`
- On `coin:inserted`: call `transactionRepo.create()` with type `'coin_insert'`
- On all adapter state changes (connected, disconnected, error): call `hardwareEventRepo.create()`

### Test additions to `HardwareManager.test.ts`

- Verify mock adapter events trigger correct repo calls
- Verify transaction amounts and types are correct

### Verification

```bash
pnpm --filter @kioskos/electron test
```

---

## Step 12: Periodic Health Check Broadcasting

**Goal**: HardwareManager periodically broadcasts hardware health status to the renderer and logs it.

### Modifications to `HardwareManager.ts`

- `startHealthCheckInterval(intervalMs: number): void` — every N ms (default 5000), calls `healthCheck()`, emits `'health'` event
- `stopHealthCheckInterval(): void` — cleanup

### Modifications to `hardwareEvents.ts`

- Listen for `'health'` event from HardwareManager
- Send `IPC_CHANNELS.HARDWARE_STATUS` to renderer with `HardwareHealthReport`

### Test additions

- Verify interval fires and emits health events
- Verify cleanup stops the interval

### Verification

```bash
pnpm --filter @kioskos/electron test
```

---

## Step 13: dev:mock End-to-End Verification

**Goal**: Ensure `KIOSKOS_MOCK_HARDWARE` environment guard works correctly end-to-end.

### Implementation in `createHardwareStack.ts`

- Check `process.env.KIOSKOS_MOCK_HARDWARE === 'true'`
- If true and no hardware config, create all 5 mock adapters with sensible defaults:
  - Mock bill validator: emits a bill every 10s
  - Mock coin validator: emits a coin every 8s
  - Mock NFC: emits a read every 15s
  - Mock barcode: emits a scan every 12s
  - Mock printer: available for print commands, no auto-emit
- Log clearly: `log.warn('Running with MOCK hardware adapters')`
- In production mode (no `KIOSKOS_MOCK_HARDWARE`), if hardware config is missing, adapters are simply not created (no crash, empty HardwareManager)

### Verification

```bash
# Mock hardware mode — events should flow
pnpm --filter @kioskos/electron dev:mock

# Normal dev mode — starts with no adapters, no errors
pnpm --filter @kioskos/electron dev
```

In mock mode, open DevTools and verify:

```javascript
window.kioskAPI.onBillInserted(console.log); // Should receive events
window.kioskAPI.onHardwareStatus(console.log); // Should receive periodic health reports
```

---

## Step 14: Final Verification Checklist

Run each of these from the repo root. Every one must pass before Phase 2 is considered complete.

```bash
# 1. TypeScript compiles cleanly
pnpm run typecheck

# 2. All tests pass
pnpm run test

# 3. Coverage meets thresholds (80%)
pnpm --filter @kioskos/electron test:coverage

# 4. Linting passes
pnpm run lint

# 5. Mock hardware mode works (manual check — Ctrl+C to stop)
pnpm --filter @kioskos/electron dev:mock

# 6. Normal dev mode works without errors (manual check)
pnpm --filter @kioskos/electron dev
```

### Expected state after Phase 2

- All 5 abstract category adapters with domain-specific methods
- All 5 mock adapters with configurable simulation
- 3 concrete real adapters: NV9 bill validator (SSP), G13 coin validator (ccTalk), Custom VKP80 printer (ESC/POS)
- 2 concrete adapter stubs for NFC and barcode (until hardware available)
- HardwareManager registry with lifecycle management
- AdapterFactory for config-driven adapter creation
- Serial port helpers with reconnection logic
- Hardware events flow from adapters -> HardwareManager -> IPC -> renderer
- Money events auto-recorded as transactions in SQLite
- Periodic health check broadcasting
- All adapters have unit tests with mocked I/O
- `dev:mock` provides full simulated hardware environment

---

## File Structure (new files in Phase 2)

```
apps/electron/src/main/hardware/
  HardwareAdapter.ts                          # Step 2
  HardwareAdapter.test.ts                     # Step 2
  HardwareManager.ts                          # Step 5, 11, 12
  HardwareManager.test.ts                     # Step 5, 11, 12
  AdapterFactory.ts                           # Step 6
  AdapterFactory.test.ts                      # Step 6
  createHardwareStack.ts                      # Step 6, 13
  serial.ts                                   # Step 8
  serial.test.ts                              # Step 8
  adapters/
    printers/
      PrinterAdapter.ts                       # Step 3
      MockPrinterAdapter.ts                   # Step 4
      MockPrinterAdapter.test.ts              # Step 4
      escpos.ts                               # Step 10 - ESC/POS protocol helpers
      escpos.test.ts                          # Step 10
      CustomVKP80Adapter.ts                   # Step 10 - Concrete
      CustomVKP80Adapter.test.ts              # Step 10
    bill-validators/
      BillValidatorAdapter.ts                 # Step 3 - Abstract
      MockBillValidatorAdapter.ts             # Step 4
      MockBillValidatorAdapter.test.ts        # Step 4
      ssp.ts                                  # Step 9 - SSP/eSSP protocol helpers
      ssp.test.ts                             # Step 9
      NV9Adapter.ts                           # Step 9 - Concrete (ported)
      NV9Adapter.test.ts                      # Step 9
    coin-validators/
      CoinValidatorAdapter.ts                 # Step 3 - Abstract
      MockCoinValidatorAdapter.ts             # Step 4
      MockCoinValidatorAdapter.test.ts        # Step 4
      cctalk.ts                               # Step 10 - ccTalk protocol helpers
      cctalk.test.ts                          # Step 10
      G13Adapter.ts                           # Step 10 - Concrete
      G13Adapter.test.ts                      # Step 10
    nfc/
      NFCAdapter.ts                           # Step 3
      MockNFCAdapter.ts                       # Step 4
      MockNFCAdapter.test.ts                  # Step 4
      ACR122UAdapter.ts                       # Step 10
      ACR122UAdapter.test.ts                  # Step 10
    barcode/
      BarcodeAdapter.ts                       # Step 3
      MockBarcodeAdapter.ts                   # Step 4
      MockBarcodeAdapter.test.ts              # Step 4
      HoneywellHIDAdapter.ts                  # Step 10
      HoneywellHIDAdapter.test.ts             # Step 10

apps/electron/src/main/ipc/
  hardwareEvents.ts                           # Step 7
  hardwareEvents.test.ts                      # Step 7
```

## New Dependencies

Add to `apps/electron/package.json`:

- `serialport` — serial communication for bill validators, coin validators, some printers
- `node-hid` — USB HID for barcode scanners and NFC readers
- `nfc-pcsc` — PC/SC smart card access for NFC readers

---

## Key Architectural Decisions

| Decision                                              | Rationale                                                                                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EventEmitter over callback injection**              | Adapters extend EventEmitter and emit typed events. Multiple subscribers (HardwareManager, IPC, database) without coupling.                                 |
| **Mock adapters use timers, not immediate emissions** | Simulates real hardware timing. More useful for development testing.                                                                                        |
| **Serial helpers as shared utility**                  | `serial.ts` wraps serialport once. All serial adapters compose it. Centralises reconnection logic.                                                          |
| **Factory pattern for adapter resolution**            | Maps config strings to constructors. New adapter = one line in factory registration. Open/closed principle.                                                 |
| **HardwareManager owns event-to-database pipeline**   | Keeps adapters focused on protocol. Manager handles cross-cutting concerns (persistence, forwarding).                                                       |
| **Separate IPC event forwarding module**              | `hardwareEvents.ts` is separate from `register.ts` because push events (main -> renderer) are architecturally different from request/response IPC handlers. |

---

## What Comes Next

With the hardware abstraction layer in place, the project is ready for **Phase 3: Cloud Infrastructure**. Create `docs/PHASE_3_CLOUD.md` covering:

- AWS CDK stacks (IoT, Telemetry, Update, Alerting, Monitoring)
- Device provisioning script
- MQTT client in Electron (aws-iot-device-sdk-v2)
- Telemetry sender (heartbeat, events)
- Sync engine: offline queue -> MQTT batch publish
- IoT Rules: route to Timestream, CloudWatch, Lambda
- CloudWatch log streaming from kiosk
- Sentry integration with source maps
