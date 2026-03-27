# KioskOS — Enterprise Electron Kiosk Platform

## Project Plan & Implementation Guide

> **Purpose**: This document is the single source of truth for building an enterprise-grade Electron kiosk solution. It is written to guide an AI coding agent (Claude Code) through incremental, test-driven implementation.

---

## 1. Project Overview

**KioskOS** is an Electron-based kiosk shell that wraps any web application and bridges it to physical hardware (cash acceptors, coin validators, printers, NFC readers, barcode scanners). It reports state in real time to a central AWS backend, supports remote management, and ships updates automatically.

### Core Principles

- **Hardware-agnostic**: Every peripheral category uses a driver adapter pattern so new models are a plugin, not a rewrite.
- **Offline-first**: The kiosk must work without network. Transactions queue locally and sync when connectivity returns.
- **Observable**: Every kiosk streams logs, metrics, errors, and business events to a central platform.
- **Secure**: The wrapped web app cannot escape its sandbox. Admin functions require authentication. The kiosk OS-level surface is locked down.
- **Updatable**: New releases roll out via auto-update with rollback capability.

---

## 2. Technology Stack

### 2.1 Electron Application

| Layer        | Technology                                       | Notes                                    |
| ------------ | ------------------------------------------------ | ---------------------------------------- |
| Runtime      | Electron 33+                                     | Chromium + Node.js                       |
| Language     | TypeScript 5.x (strict mode)                     | Entire codebase                          |
| Bundler      | electron-vite                                    | Fast HMR, native ESM                     |
| UI Framework | Vue 3 Composition API (admin screens only)       | Preload-isolated                         |
| State        | Pinia                                            | Lightweight, Vue-native state management |
| Local DB     | better-sqlite3                                   | Synchronous, single-file, WAL mode       |
| IPC          | Electron contextBridge + ipcMain/ipcRenderer     | Typed channels                           |
| Testing      | Vitest + @testing-library/vue + Playwright (E2E) | Coverage gates                           |
| Linting      | ESLint flat config + Prettier                    | Pre-commit hooks                         |
| Logging      | winston (main) + structured JSON                 | Rotated files + stream to backend        |

### 2.2 AWS Backend

| Service                        | Purpose                                                   |
| ------------------------------ | --------------------------------------------------------- |
| AWS IoT Core                   | Real-time bidirectional MQTT between kiosk ↔ cloud        |
| AWS IoT Device Management      | Fleet provisioning, thing groups, jobs (remote commands)  |
| Amazon Timestream              | Time-series store for telemetry & transaction events      |
| Amazon S3 + CloudFront         | Electron update hosting (auto-update artifacts)           |
| AWS Lambda                     | Event processors, report generators, Slack/email dispatch |
| Amazon API Gateway (WebSocket) | Optional fallback if MQTT is blocked by network policy    |
| Amazon SES                     | Scheduled email reports                                   |
| Amazon SNS                     | Fan-out for alerts (Slack webhook, email, PagerDuty)      |
| AWS Systems Manager (SSM)      | Secure parameter storage (VPN keys, secrets)              |
| Amazon CloudWatch              | Central log aggregation (kiosk log streams)               |
| AWS CodePipeline + CodeBuild   | CI/CD for Electron builds                                 |
| Sentry (SaaS)                  | Exception/error tracking with source maps                 |

### 2.3 Networking & IP Protection

| Concern              | Solution                                                                               |
| -------------------- | -------------------------------------------------------------------------------------- |
| Hide kiosk public IP | AWS Client VPN or WireGuard mesh — all traffic egresses via a fixed AWS NAT Gateway IP |
| Mutual TLS           | IoT Core X.509 certs per device                                                        |
| DNS                  | Private hosted zone over VPN for internal service resolution                           |

---

## 3. Repository Structure

```
kioskos/
├── .github/
│   └── workflows/          # CI/CD GitHub Actions
├── apps/
│   ├── electron/            # The Electron application
│   │   ├── src/
│   │   │   ├── main/        # Main process
│   │   │   │   ├── index.ts
│   │   │   │   ├── ipc/              # IPC channel handlers
│   │   │   │   ├── hardware/         # Hardware abstraction layer
│   │   │   │   │   ├── adapters/     # Per-device-model adapters
│   │   │   │   │   │   ├── printers/
│   │   │   │   │   │   │   ├── PrinterAdapter.ts        # Abstract base
│   │   │   │   │   │   │   └── CustomVKP80Adapter.ts
│   │   │   │   │   │   ├── bill-validators/
│   │   │   │   │   │   │   ├── BillValidatorAdapter.ts  # Abstract base
│   │   │   │   │   │   │   └── NV9Adapter.ts
│   │   │   │   │   │   ├── coin-validators/
│   │   │   │   │   │   │   ├── CoinValidatorAdapter.ts
│   │   │   │   │   │   │   └── G13Adapter.ts
│   │   │   │   │   │   ├── nfc/
│   │   │   │   │   │   │   ├── NFCAdapter.ts
│   │   │   │   │   │   │   └── ACR122UAdapter.ts
│   │   │   │   │   │   └── barcode/
│   │   │   │   │   │       ├── BarcodeAdapter.ts
│   │   │   │   │   │       └── HoneywellHIDAdapter.ts
│   │   │   │   │   ├── HardwareManager.ts   # Registry + lifecycle
│   │   │   │   │   └── serial.ts            # node-serialport helpers
│   │   │   │   ├── db/
│   │   │   │   │   ├── database.ts          # better-sqlite3 setup
│   │   │   │   │   ├── migrations/          # Numbered SQL migrations
│   │   │   │   │   ├── repositories/
│   │   │   │   │   │   ├── TransactionRepo.ts
│   │   │   │   │   │   ├── HardwareEventRepo.ts
│   │   │   │   │   │   └── UserEventRepo.ts
│   │   │   │   │   └── sync.ts              # Offline queue → cloud sync
│   │   │   │   ├── telemetry/
│   │   │   │   │   ├── MQTTClient.ts        # AWS IoT Core connection
│   │   │   │   │   ├── TelemetrySender.ts   # Batched metric publishing
│   │   │   │   │   └── LogStreamer.ts        # Ships logs to CloudWatch
│   │   │   │   ├── updater/
│   │   │   │   │   └── AutoUpdater.ts       # electron-updater config
│   │   │   │   ├── security/
│   │   │   │   │   ├── lockdown.ts          # Disable dev tools, kiosk mode
│   │   │   │   │   └── vpn.ts              # WireGuard tunnel management
│   │   │   │   └── admin/
│   │   │   │       ├── AdminAuth.ts         # PIN / NFC admin auth
│   │   │   │       └── RemoteCommand.ts     # Handles IoT Jobs (disable, reboot, etc.)
│   │   │   ├── preload/
│   │   │   │   ├── index.ts                 # contextBridge exposing kioskAPI
│   │   │   │   └── channels.ts              # Typed IPC channel definitions
│   │   │   ├── renderer/
│   │   │   │   ├── admin/                   # Vue 3 admin panel
│   │   │   │   │   ├── App.vue
│   │   │   │   │   ├── pages/
│   │   │   │   │   │   ├── Dashboard.vue
│   │   │   │   │   │   ├── CashReconciliation.vue
│   │   │   │   │   │   ├── Logs.vue
│   │   │   │   │   │   ├── Settings.vue
│   │   │   │   │   │   └── HardwareDiagnostics.vue
│   │   │   │   │   └── components/
│   │   │   │   └── webview/                 # Hosts the wrapped web app
│   │   │   │       └── index.html           # <webview> or BrowserView shell
│   │   │   └── shared/
│   │   │       ├── types/                   # Shared TS interfaces
│   │   │       │   ├── hardware.ts
│   │   │       │   ├── events.ts
│   │   │       │   ├── ipc.ts
│   │   │       │   └── config.ts
│   │   │       └── constants.ts
│   │   ├── resources/                       # Icons, certs, native deps
│   │   ├── electron.vite.config.ts
│   │   ├── electron-builder.yml
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── package.json
│   └── cloud/                               # AWS CDK infrastructure
│       ├── lib/
│       │   ├── iot-stack.ts
│       │   ├── telemetry-stack.ts
│       │   ├── update-stack.ts
│       │   ├── alerting-stack.ts
│       │   └── monitoring-stack.ts
│       ├── lambdas/
│       │   ├── event-processor/
│       │   ├── report-generator/
│       │   ├── slack-notifier/
│       │   └── device-provisioner/
│       ├── cdk.json
│       └── package.json
├── packages/
│   └── shared-types/                        # Shared between electron + cloud
│       ├── src/
│       │   ├── events.ts
│       │   ├── telemetry.ts
│       │   └── commands.ts
│       ├── tsconfig.json
│       └── package.json
├── scripts/
│   ├── provision-device.sh                  # Generates certs, registers thing
│   ├── build-and-publish.sh
│   └── seed-dev-db.ts
├── docs/
│   ├── HARDWARE_INTEGRATION_GUIDE.md
│   ├── DEPLOYMENT_RUNBOOK.md
│   ├── ADDING_NEW_PERIPHERAL.md
│   └── ARCHITECTURE.md
├── pnpm-workspace.yaml
├── turbo.json                               # Turborepo for monorepo tasks
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
└── README.md
```

---

## 4. Detailed Module Specifications

### 4.1 Hardware Abstraction Layer (HAL)

#### Design Pattern: Adapter + Registry

```typescript
// Abstract adapter all hardware categories extend
abstract class HardwareAdapter<TConfig = unknown> {
  abstract readonly category: HardwareCategory;
  abstract readonly manufacturer: string;
  abstract readonly model: string;

  abstract connect(config: TConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract getStatus(): HardwareStatus;

  // Lifecycle hooks
  onError?(error: Error): void;
  onReconnect?(): Promise<void>;
}

// Category-specific abstract classes add domain methods
abstract class PrinterAdapter extends HardwareAdapter {
  readonly category = 'printer';
  abstract printReceipt(data: ReceiptData): Promise<PrintResult>;
  abstract openCashDrawer(): Promise<void>;
  abstract cutPaper(): Promise<void>;
  abstract getStatus(): PrinterStatus; // paper, cover, etc.
}

abstract class BillValidatorAdapter extends HardwareAdapter {
  readonly category = 'bill-validator';
  abstract enable(): Promise<void>;
  abstract disable(): Promise<void>;
  abstract onBillInserted(cb: (bill: BillEvent) => void): void;
  abstract onBillStacked(cb: (bill: BillEvent) => void): void;
  abstract onBillRejected(cb: (reason: string) => void): void;
  abstract returnBill(): Promise<void>;
}

// HardwareManager — registry that holds active adapters
class HardwareManager extends EventEmitter {
  private adapters: Map<string, HardwareAdapter> = new Map();

  register(id: string, adapter: HardwareAdapter): void;
  unregister(id: string): Promise<void>;
  getAdapter<T extends HardwareAdapter>(id: string): T;
  getByCategory(cat: HardwareCategory): HardwareAdapter[];
  healthCheck(): Promise<HardwareHealthReport>;
}
```

#### Communication Protocols

| Protocol                     | Node.js Library    | Used By                                              |
| ---------------------------- | ------------------ | ---------------------------------------------------- |
| Serial (RS-232 / USB-Serial) | `serialport`       | Most bill validators, coin validators, some printers |
| USB HID                      | `node-hid`         | Barcode scanners, NFC readers                        |
| USB (libusb)                 | `usb`              | Some printers (direct USB)                           |
| TCP/IP (Network)             | `net` (built-in)   | Network printers                                     |
| ESC/POS                      | `escpos` / custom  | Thermal receipt printers                             |
| ccTalk                       | Custom over serial | Coin validators (Azkoyen, etc.)                      |
| MDB (via serial bridge)      | Custom             | Vending-style bill/coin acceptors                    |

#### Adapter Implementation Checklist (per adapter)

- [ ] Implements all abstract methods from category base class
- [ ] Handles connection, reconnection, and graceful disconnect
- [ ] Emits typed events for all hardware state changes
- [ ] Has unit tests with mocked serial/USB ports
- [ ] Has integration test notes in `HARDWARE_INTEGRATION_GUIDE.md`
- [ ] Configuration schema defined in `hardware.ts` types
- [ ] Error codes mapped to human-readable messages

### 4.2 IPC Bridge — Web App ↔ Electron

The wrapped web application communicates with Electron (and thus hardware) through a typed, sandboxed IPC bridge.

#### Architecture

```
┌──────────────────────────────────────────────────────┐
│  Web App (BrowserView / webview)                     │
│                                                      │
│  window.kioskAPI.requestPayment(amount)              │
│  window.kioskAPI.onHardwareEvent(callback)           │
│  window.kioskAPI.printReceipt(data)                  │
│  window.kioskAPI.scanBarcode()                       │
│  window.kioskAPI.readNFC()                           │
└──────────────────┬───────────────────────────────────┘
                   │ contextBridge (preload)
                   │ postMessage channel (if webview)
┌──────────────────▼───────────────────────────────────┐
│  Preload Script                                      │
│  Validates payloads, enforces allow-list of channels │
│  Maps to ipcRenderer.invoke / ipcRenderer.on         │
└──────────────────┬───────────────────────────────────┘
                   │ IPC
┌──────────────────▼───────────────────────────────────┐
│  Main Process — IPC Router                           │
│  Dispatches to HardwareManager, DB, Telemetry, etc.  │
└──────────────────────────────────────────────────────┘
```

#### Typed Channel Definitions

```typescript
// shared/types/ipc.ts

export interface KioskAPI {
  // Hardware → Web App (events)
  onBillInserted: (cb: (event: BillEvent) => void) => void;
  onBillStacked: (cb: (event: BillEvent) => void) => void;
  onCoinInserted: (cb: (event: CoinEvent) => void) => void;
  onNFCRead: (cb: (event: NFCEvent) => void) => void;
  onBarcodeScanned: (cb: (event: BarcodeEvent) => void) => void;
  onHardwareStatus: (cb: (status: HardwareHealthReport) => void) => void;
  onKioskDisabled: (cb: () => void) => void;

  // Web App → Hardware (commands)
  enableBillAcceptor: () => Promise<void>;
  disableBillAcceptor: () => Promise<void>;
  enableCoinAcceptor: () => Promise<void>;
  disableCoinAcceptor: () => Promise<void>;
  returnBill: () => Promise<void>;
  printReceipt: (data: ReceiptData) => Promise<PrintResult>;
  openCashDrawer: () => Promise<void>;

  // Web App → State
  getSessionBalance: () => Promise<MoneyAmount>;
  getHardwareStatus: () => Promise<HardwareHealthReport>;
  getKioskConfig: () => Promise<PublicKioskConfig>;

  // Web App → User events
  reportUserEvent: (event: UserEvent) => Promise<void>;
}
```

### 4.3 Local Database (better-sqlite3)

#### Schema (initial migration `001_init.sql`)

```sql
-- Money transactions
CREATE TABLE transactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bill_insert', 'bill_stack', 'bill_reject',
                                      'coin_insert', 'coin_reject',
                                      'cash_dispensed', 'reconciliation')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  device_id TEXT NOT NULL,
  metadata TEXT,  -- JSON blob
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT
);
CREATE INDEX idx_transactions_synced ON transactions(synced);
CREATE INDEX idx_transactions_session ON transactions(session_id);

-- Hardware events
CREATE TABLE hardware_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_category TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error', 'critical')),
  payload TEXT,   -- JSON blob
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_hw_events_synced ON hardware_events(synced);

-- User / session events
CREATE TABLE user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sync queue metadata
CREATE TABLE sync_state (
  table_name TEXT PRIMARY KEY,
  last_synced_id TEXT,
  last_synced_at TEXT
);

-- Local config overrides
CREATE TABLE local_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Sync Engine

```
┌─────────────┐     Batch unsent rows      ┌──────────────┐
│ SQLite       │ ──────────────────────────► │ SyncEngine   │
│ (WAL mode)   │                             │              │
│              │ ◄────── Mark synced ─────── │  Publishes   │
└─────────────┘                             │  via MQTT or  │
                                            │  HTTPS batch  │
                                            └──────┬───────┘
                                                   │
                                            ┌──────▼───────┐
                                            │ AWS IoT Core  │
                                            │ → Timestream  │
                                            └──────────────┘
```

- Sync runs on a configurable interval (default 10s when online).
- On network failure, backs off exponentially up to 5 minutes.
- On reconnect, drains the full queue in batches of 100 rows.

### 4.4 Telemetry & Real-Time State

#### MQTT Topic Structure (AWS IoT Core)

```
kioskos/{env}/{kioskId}/telemetry       # Kiosk → Cloud: metrics heartbeat
kioskos/{env}/{kioskId}/events          # Kiosk → Cloud: business events
kioskos/{env}/{kioskId}/logs            # Kiosk → Cloud: structured log stream
kioskos/{env}/{kioskId}/status          # Kiosk → Cloud: hardware health, app state
kioskos/{env}/{kioskId}/commands        # Cloud → Kiosk: remote commands
kioskos/{env}/{kioskId}/config          # Cloud → Kiosk: config updates (retained)
```

#### Heartbeat Payload (every 30s)

```typescript
interface KioskHeartbeat {
  kioskId: string;
  timestamp: string; // ISO 8601
  appVersion: string;
  uptime: number; // seconds
  cpu: number; // percent
  memoryMB: number;
  diskFreeGB: number;
  networkType: 'ethernet' | 'wifi' | 'cellular';
  vpnConnected: boolean;
  hardwareStatus: Record<string, HardwareStatus>;
  pendingSyncRows: number;
  currentSessionId: string | null;
  disabled: boolean;
}
```

### 4.5 Remote Management & Commands

#### IoT Jobs (via AWS IoT Device Management)

| Command          | Payload                            | Effect                                      |
| ---------------- | ---------------------------------- | ------------------------------------------- |
| `disable`        | `{ reason: string }`               | Disables kiosk, shows out-of-service screen |
| `enable`         | `{}`                               | Re-enables kiosk                            |
| `reboot`         | `{ delay_seconds?: number }`       | Reboots the machine                         |
| `update`         | `{ version: string, url: string }` | Triggers auto-update to specified version   |
| `sync_config`    | `{ config: Partial<KioskConfig> }` | Pushes config changes                       |
| `request_logs`   | `{ since: string, until: string }` | Uploads log slice to S3                     |
| `run_diagnostic` | `{ tests: string[] }`              | Runs hardware self-test, reports results    |

#### Admin Panel Access

- Activated by a secret key combo (e.g., 5-tap on corner + PIN) or NFC admin badge.
- Opens a separate BrowserWindow (not the webview) with the Vue admin app.
- Admin screens: Dashboard, Cash Reconciliation, Logs Viewer, Settings, Hardware Diagnostics.
- Admin actions also available remotely via IoT Jobs.

### 4.6 Auto-Update Pipeline

```
Developer pushes tag → GitHub Actions → electron-builder
    │
    ▼
Artifacts (.exe, .AppImage, .dmg) + latest.yml
    │
    ▼
Upload to S3 bucket (versioned, behind CloudFront)
    │
    ▼
Kiosk checks for updates on schedule (electron-updater)
    │
    ▼
Downloads differential update, verifies signature
    │
    ▼
Installs on next idle window (no active transaction)
    │
    ▼
Reports new version in heartbeat
```

#### Rollback

- Previous 3 versions are retained on S3.
- A `rollback` IoT Job can target a specific version.
- On crash loop (3 crashes in 5 minutes), auto-rollback to previous version.

### 4.7 Logging & Observability

#### Log Pipeline

```
Winston (main process)
  ├─► Local rotated files (7 day retention, 50MB cap)
  ├─► CloudWatch Logs via MQTT or direct PutLogEvents
  └─► Sentry (errors + exceptions with source maps)
```

#### Log Format (structured JSON)

```json
{
  "timestamp": "2025-01-15T14:30:00.000Z",
  "level": "error",
  "kioskId": "kiosk-dublin-001",
  "module": "hardware.bill-validator",
  "message": "Bill jam detected",
  "metadata": { "adapter": "NV9Adapter", "errorCode": "E04" },
  "sessionId": "sess_abc123",
  "traceId": "tr_xyz789"
}
```

#### CloudWatch Setup

- Log group per environment: `/kioskos/{env}/kiosks`
- Log stream per kiosk: `{kioskId}`
- Metric filters for error rate, cash jam frequency, offline duration.
- CloudWatch Alarms → SNS → Lambda → Slack / PagerDuty.

#### Sentry

- DSN configured per environment.
- Source maps uploaded during CI build.
- Release tracking tied to git tag.
- Breadcrumbs for hardware events.

### 4.8 Alerting & Reporting

#### Slack Notifications (via AWS Lambda + SNS)

| Event                     | Channel          | Severity |
| ------------------------- | ---------------- | -------- |
| Kiosk offline > 5 min     | `#kiosk-alerts`  | Warning  |
| Cash jam / hardware error | `#kiosk-alerts`  | Error    |
| Transaction anomaly       | `#kiosk-alerts`  | Warning  |
| Update applied            | `#kiosk-updates` | Info     |
| Kiosk disabled remotely   | `#kiosk-ops`     | Info     |

#### Email Reports (via AWS Lambda + SES)

- **Daily**: Per-kiosk transaction summary, cash totals, error counts.
- **Weekly**: Fleet overview, uptime percentages, top errors.
- **On-demand**: Triggered via admin panel or IoT Job.

Schedule managed by EventBridge Scheduler → Lambda.

---

## 5. Security Architecture

### 5.1 IP Protection (VPN)

```
┌──────────┐      WireGuard Tunnel       ┌──────────────┐
│  Kiosk    │ ◄──────────────────────────►│ AWS VPN      │
│  (any IP) │                             │ Endpoint     │
└──────────┘                             └──────┬───────┘
                                                │
                                         ┌──────▼───────┐
                                         │ NAT Gateway   │
                                         │ (fixed EIP)   │
                                         └──────┬───────┘
                                                │
                                         Internet (all
                                         kiosk traffic
                                         exits from 1 IP)
```

- Each kiosk gets a unique WireGuard keypair during provisioning.
- All outbound traffic (including the wrapped web app) routes through the VPN.
- IoT Core uses mutual TLS (X.509) as a second auth layer.

### 5.2 Electron Security Hardening

```typescript
// In main process BrowserWindow creation
const mainWindow = new BrowserWindow({
  kiosk: true, // Full-screen, no chrome
  fullscreen: true,
  frame: false,
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true, // CRITICAL
    nodeIntegration: false, // CRITICAL
    sandbox: true,
    webviewTag: false, // Use BrowserView instead
    devTools: IS_DEV, // Disabled in production
  },
});

// Content Security Policy
session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
  cb({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';",
      ],
    },
  });
});

// Disable navigation away from allowed origins
mainWindow.webContents.on('will-navigate', (event, url) => {
  if (!isAllowedOrigin(url)) event.preventDefault();
});
```

### 5.3 Admin Authentication

- PIN code (configurable, stored hashed in local_config).
- Optional NFC admin badge (card UID whitelist).
- Remote admin via IoT Jobs requires IAM authentication.
- Admin session timeout (default 5 minutes).

---

## 6. Development Environment & Tooling

### 6.1 Setup

```bash
# Prerequisites: Node.js 20 LTS, pnpm 9+
pnpm install
pnpm run dev           # Starts electron-vite in dev mode with HMR
pnpm run dev:mock      # Same but with mock hardware adapters
```

### 6.2 TypeScript Configuration

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@kioskos/shared-types": ["./packages/shared-types/src"],
    },
  },
}
```

### 6.3 Testing Strategy

| Layer       | Tool                  | What to Test                                                   |
| ----------- | --------------------- | -------------------------------------------------------------- |
| Unit        | Vitest                | Adapters (mocked I/O), repositories, sync engine, IPC handlers |
| Integration | Vitest + real SQLite  | DB migrations, query correctness, sync queue logic             |
| Component   | @testing-library/vue  | Admin panel components                                         |
| E2E         | Playwright + Electron | Full kiosk flow with mock hardware                             |
| Hardware    | Manual + scripts      | Real device integration (documented in runbook)                |

```bash
pnpm run test              # Unit + integration
pnpm run test:watch        # Watch mode
pnpm run test:coverage     # With coverage report (gate: 80%)
pnpm run test:e2e          # Playwright E2E
```

### 6.4 Debugging

- **Main process**: VS Code `launch.json` attach to Electron main with `--inspect=9229`.
- **Renderer**: Chrome DevTools (enabled in dev mode).
- **Hardware**: Mock adapters with simulated event sequences; serial port monitor via `serialport` debug logging.
- **IPC**: Typed IPC with runtime validation logs; `electron-devtools-installer` for Vue DevTools.

#### VS Code Launch Configuration

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "args": [".", "--remote-debugging-port=9222"],
      "env": { "NODE_ENV": "development" },
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
    },
    {
      "name": "Debug Renderer",
      "type": "chrome",
      "request": "attach",
      "port": 9222,
      "webRoot": "${workspaceFolder}/src/renderer",
    },
  ],
}
```

### 6.5 Pre-commit & CI Hooks

```bash
# .husky/pre-commit
pnpm lint-staged   # ESLint + Prettier on staged files
pnpm typecheck     # tsc --noEmit across all packages
```

---

## 7. Build, Release & Deploy Pipeline

### 7.1 CI/CD (GitHub Actions)

```yaml
# .github/workflows/release.yml — triggered on version tag push
name: Build & Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run test
      - run: pnpm run build
      # electron-builder publishes to S3
      - run: pnpm run publish:electron
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          CSC_LINK: ${{ secrets.CODE_SIGN_CERT }}
          CSC_KEY_PASSWORD: ${{ secrets.CODE_SIGN_PASSWORD }}

  deploy-infra:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - run: pnpm --filter cloud run cdk deploy --all --require-approval never
```

### 7.2 electron-builder Configuration

```yaml
# electron-builder.yml
appId: com.company.kioskos
productName: KioskOS
publish:
  provider: s3
  bucket: kioskos-updates-${env.STAGE}
  region: eu-west-1
  acl: private
nsis:
  oneClick: true
  perMachine: true
  allowToChangeInstallationDirectory: false
linux:
  target: AppImage
  category: Utility
mac:
  target: dmg
  hardenedRuntime: true
  gatekeeperAssess: false
afterSign: scripts/notarize.js
```

### 7.3 Update Delivery

1. electron-updater checks S3 via CloudFront every 15 minutes.
2. If new version available, downloads in background.
3. Waits for idle state (no active transaction/session).
4. Installs and restarts.
5. On first boot of new version, runs migrations, reports version via heartbeat.
6. If crash loop detected, auto-rollback.

---

## 8. AWS Infrastructure (CDK)

### 8.1 Stack Overview

```
KioskOS-IoTStack
  ├── IoT Thing Type + Thing Group
  ├── IoT Policy (MQTT permissions)
  ├── IoT Rules (route messages to Timestream, Lambda, CloudWatch)
  └── Certificate provisioning Lambda

KioskOS-TelemetryStack
  ├── Timestream Database + Tables (transactions, hardware_events, heartbeats)
  ├── Timestream scheduled queries for aggregations
  └── API Gateway (for dashboard queries)

KioskOS-UpdateStack
  ├── S3 Bucket (update artifacts, versioned)
  ├── CloudFront Distribution
  └── Lambda (cleanup old versions)

KioskOS-AlertingStack
  ├── SNS Topics (alerts, reports)
  ├── Lambda: slack-notifier
  ├── Lambda: report-generator
  ├── SES verified identity + templates
  └── EventBridge Scheduler rules

KioskOS-MonitoringStack
  ├── CloudWatch Log Groups
  ├── Metric Filters + Alarms
  └── Dashboard
```

### 8.2 Device Provisioning Flow

```
1. Run: ./scripts/provision-device.sh --kiosk-id kiosk-dublin-042 --env prod
2. Script calls AWS IoT CreateThing + CreateKeysAndCertificate
3. Downloads: device cert, private key, root CA
4. Generates WireGuard keypair, registers with VPN server
5. Bundles certs + config into /etc/kioskos/ on the target device
6. Kiosk boots → reads certs → connects to IoT Core + VPN
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Weeks 1–3)

- [ ] Scaffold monorepo with Turborepo, pnpm workspaces, TypeScript
- [ ] Set up electron-vite with main/preload/renderer structure
- [ ] Implement typed IPC bridge with contextBridge
- [ ] Create BrowserView wrapper that loads a configurable URL
- [ ] Set up better-sqlite3 with migration runner
- [ ] Implement Transaction, HardwareEvent, UserEvent repositories
- [ ] Write unit tests for all repositories
- [ ] Set up Vitest, ESLint, Prettier, Husky
- [ ] Create VS Code debug configurations
- [ ] Basic kiosk mode (fullscreen, locked)

### Phase 2: Hardware Abstraction (Weeks 4–6)

- [ ] Implement HardwareManager registry
- [ ] Implement abstract adapters for all 5 categories
- [ ] Build first concrete adapter per category:
  - Printer: Custom VKP80 (ESC/POS over serial/USB)
  - Bill Validator: NV9 (serial, SSP/eSSP protocol)
  - Coin Validator: G13 (serial, ccTalk protocol)
  - NFC: ACR122U (PC/SC via `nfc-pcsc`)
  - Barcode: Honeywell HID keyboard-wedge
- [ ] Mock adapter implementations for all categories
- [ ] Wire hardware events through IPC to web app
- [ ] Unit tests with mocked serial/USB
- [ ] Hardware integration test scripts

### Phase 3: Cloud Infrastructure (Weeks 5–7)

- [ ] CDK stacks: IoT, Telemetry, Update, Alerting, Monitoring
- [ ] Device provisioning script
- [ ] MQTT client in Electron (aws-iot-device-sdk-v2)
- [ ] Telemetry sender (heartbeat, events)
- [ ] Sync engine: offline queue → MQTT batch publish
- [ ] IoT Rules: route to Timestream, CloudWatch, Lambda
- [ ] CloudWatch log streaming from kiosk
- [ ] Sentry integration with source maps

### Phase 4: Remote Management (Weeks 7–8)

- [ ] Remote command handler (IoT Jobs)
- [ ] Disable/enable kiosk remotely
- [ ] Config push via MQTT retained messages
- [ ] Auto-updater with S3 + CloudFront
- [ ] Crash loop detection + auto-rollback
- [ ] CI/CD pipeline (GitHub Actions → S3)

### Phase 5: Admin Panel (Weeks 8–9)

- [ ] Admin auth (PIN + NFC badge)
- [ ] Vue 3 admin app with pages:
  - Dashboard (live hardware status, session info)
  - Cash Reconciliation (totals, discrepancies)
  - Logs viewer (searchable, filterable)
  - Settings (URL, hardware config, network)
  - Hardware Diagnostics (test each peripheral)
- [ ] Admin actions: disable kiosk, trigger sync, reboot

### Phase 6: Alerting & Reporting (Weeks 9–10)

- [ ] Slack notifier Lambda
- [ ] SES email report Lambda + templates
- [ ] EventBridge scheduled reports (daily, weekly)
- [ ] CloudWatch Alarms → SNS → Slack/email
- [ ] Anomaly detection rules (unusual cash patterns)

### Phase 7: Security & Hardening (Weeks 10–11)

- [ ] WireGuard VPN integration
- [ ] Content Security Policy
- [ ] Navigation lockdown
- [ ] Code signing (Windows + macOS)
- [ ] Certificate rotation strategy
- [ ] Penetration testing checklist

### Phase 8: Documentation & Polish (Weeks 11–12)

- [ ] ARCHITECTURE.md with diagrams
- [ ] HARDWARE_INTEGRATION_GUIDE.md
- [ ] DEPLOYMENT_RUNBOOK.md
- [ ] ADDING_NEW_PERIPHERAL.md
- [ ] E2E Playwright test suite
- [ ] Performance profiling (memory, CPU on kiosk hardware)
- [ ] Load testing telemetry pipeline

---

## 10. Configuration Schema

```typescript
// shared/types/config.ts

export interface KioskConfig {
  kioskId: string;
  environment: 'dev' | 'staging' | 'prod';

  // Web app
  webAppUrl: string;
  webAppFallbackPath: string; // Local HTML shown when offline

  // Hardware
  hardware: {
    printer?: { adapter: string; config: Record<string, unknown> };
    billValidator?: { adapter: string; config: Record<string, unknown> };
    coinValidator?: { adapter: string; config: Record<string, unknown> };
    nfc?: { adapter: string; config: Record<string, unknown> };
    barcode?: { adapter: string; config: Record<string, unknown> };
  };

  // Networking
  network: {
    vpn: { enabled: boolean; configPath: string };
    mqtt: { endpoint: string; certPath: string; keyPath: string; caPath: string };
  };

  // Telemetry
  telemetry: {
    heartbeatIntervalMs: number; // default: 30000
    syncIntervalMs: number; // default: 10000
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };

  // Update
  update: {
    checkIntervalMs: number; // default: 900000 (15 min)
    autoInstall: boolean;
    channel: 'stable' | 'beta';
  };

  // Admin
  admin: {
    pinHash: string;
    nfcAdminUIDs: string[];
    sessionTimeoutMs: number; // default: 300000 (5 min)
  };

  // Security
  security: {
    allowedOrigins: string[];
    disableDevTools: boolean;
  };
}
```

---

## 11. Key Design Decisions & Rationale

| Decision                                  | Rationale                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **better-sqlite3 over SQLite via Prisma** | Synchronous API avoids async complexity in main process; WAL mode handles concurrent reads; no ORM overhead for simple schemas. |
| **MQTT (IoT Core) over WebSockets**       | Purpose-built for IoT; handles millions of devices; built-in offline queuing, device shadows, jobs; mutual TLS.                 |
| **WireGuard over OpenVPN**                | Faster, lower overhead, simpler config; fits headless kiosk deployment.                                                         |
| **electron-vite over Webpack**            | 10x faster HMR; native ESM; purpose-built for Electron.                                                                         |
| **Adapter pattern for hardware**          | New hardware = new file implementing an interface; zero changes to core.                                                        |
| **BrowserView over \<webview\>**          | `<webview>` is semi-deprecated; BrowserView is more stable and performant.                                                      |
| **Sentry over self-hosted**               | Source map handling, release tracking, breadcrumbs out of the box; not worth self-hosting for error tracking.                   |
| **Timestream for telemetry**              | Purpose-built time-series DB; auto-scales; built-in retention policies; cheaper than DynamoDB for this access pattern.          |

---

## 12. Claude Code Instructions

When implementing this project, follow these rules:

1. **Always start a module with its types** — define the interface in `shared/types/` before writing implementation.
2. **Write tests alongside implementation** — no module is complete without unit tests. Use the AAA pattern (Arrange, Act, Assert).
3. **One adapter = one file** — each hardware adapter lives in its own file, named after the model.
4. **Use dependency injection** — pass dependencies (db, logger, config) via constructor, never import singletons.
5. **Errors are typed** — create a `KioskError` base class with error codes. Hardware errors extend `HardwareError`.
6. **Every IPC channel is typed** — add to `KioskAPI` interface first, then implement handler and preload bridge.
7. **Config is loaded once at startup** — from a JSON file at a known path, merged with local_config DB overrides.
8. **Log everything** — every hardware event, IPC call, sync operation, and state change gets a structured log entry.
9. **Phases are independent** — each phase should result in a working (if incomplete) application.
10. **Use `IS_DEV` guards** — dev-only features (mock hardware, dev tools, verbose logging) behind environment check.
