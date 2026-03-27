# KioskOS — Phase 1: Project Setup Guide

> **Audience**: Claude Code (AI coding agent) and developer.
> **Goal**: Go from an empty directory to a fully scaffolded, buildable, testable Electron + TypeScript monorepo with dev tooling, IPC bridge, local database, and a BrowserView that loads a web app — all before any hardware or cloud work begins.
>
> **Rule**: Complete each step fully before moving to the next. Every step ends with a verification command that must pass.

---

## Prerequisites

- Node.js 20 LTS
- pnpm 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- Git
- VS Code (recommended)

---

## Step 1: Initialize the Monorepo

### 1.1 Create root directory and git repo

```bash
mkdir kioskos && cd kioskos
git init
```

### 1.2 Create pnpm workspace

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 1.3 Create root package.json

```json
{
  "name": "kioskos",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:watch": "turbo run test:watch",
    "test:coverage": "turbo run test:coverage",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "prettier --write \"**/*.{ts,vue,json,md,yml,yaml}\"",
    "format:check": "prettier --check \"**/*.{ts,vue,json,md,yml,yaml}\"",
    "clean": "turbo run clean && rm -rf node_modules"
  }
}
```

### 1.4 Create turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "out/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:watch": {
      "cache": false,
      "persistent": true
    },
    "test:coverage": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "lint:fix": {},
    "clean": {
      "cache": false
    }
  }
}
```

### 1.5 Create root tsconfig.base.json

This is the base TypeScript config all packages extend.

```json
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
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "exclude": ["node_modules", "dist", "out", "coverage"]
}
```

### 1.6 Install root dev dependencies

```bash
pnpm add -Dw turbo prettier eslint @eslint/js typescript-eslint eslint-config-prettier eslint-plugin-prettier
```

### 1.7 Create root ESLint config

Create `eslint.config.mjs`:

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', '**/coverage/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
```

### 1.8 Create .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

### 1.9 Create .gitignore

```
node_modules/
dist/
out/
coverage/
*.db
*.db-wal
*.db-shm
.turbo/
.env
.env.*
!.env.example
*.pem
*.key
*.crt
```

### 1.10 Create .npmrc

```
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=true
```

> **Note on `shamefully-hoist=true`**: Electron and many native modules (better-sqlite3, serialport, node-hid) expect dependencies to be hoisted to the root node_modules. Without this, native module rebuilds and electron-builder will fail with "module not found" errors. This is standard practice for Electron monorepos.

### Verification

```bash
pnpm install
pnpm turbo --version   # Should print turbo version
pnpm exec tsc --version  # Should print TypeScript version
```

---

## Step 2: Create the shared-types Package

This package defines all TypeScript interfaces shared between Electron and the future cloud backend. It is the single source of truth for shapes of data.

### 2.1 Scaffold the package

```bash
mkdir -p packages/shared-types/src
```

### 2.2 packages/shared-types/package.json

```json
{
  "name": "@kioskos/shared-types",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "clean": "rm -rf dist"
  }
}
```

### 2.3 packages/shared-types/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### 2.4 Define core types

Create the following files. These are the foundational interfaces the entire project depends on. They will grow over time but must exist from day one.

#### packages/shared-types/src/hardware.ts

```typescript
export type HardwareCategory =
  | 'printer'
  | 'bill-validator'
  | 'coin-validator'
  | 'nfc'
  | 'barcode';

export type HardwareConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface HardwareStatus {
  category: HardwareCategory;
  deviceId: string;
  manufacturer: string;
  model: string;
  connectionState: HardwareConnectionState;
  lastSeen: string | null; // ISO 8601
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface HardwareHealthReport {
  timestamp: string;
  devices: HardwareStatus[];
  overallHealthy: boolean;
}

export interface BillEvent {
  type: 'inserted' | 'stacked' | 'rejected' | 'returned';
  amountCents: number;
  currency: string;
  deviceId: string;
  timestamp: string;
  reason?: string; // For rejected bills
}

export interface CoinEvent {
  type: 'inserted' | 'rejected';
  amountCents: number;
  currency: string;
  deviceId: string;
  timestamp: string;
  reason?: string;
}

export interface NFCEvent {
  type: 'read' | 'removed';
  uid: string;
  data: string | null;
  deviceId: string;
  timestamp: string;
}

export interface BarcodeEvent {
  type: 'scanned';
  value: string;
  format: string; // QR, CODE128, etc.
  deviceId: string;
  timestamp: string;
}

export interface ReceiptData {
  lines: ReceiptLine[];
  cutAfter?: boolean;
  openDrawer?: boolean;
}

export type ReceiptLine =
  | { type: 'text'; content: string; align?: 'left' | 'center' | 'right'; bold?: boolean }
  | { type: 'barcode'; value: string; format?: string }
  | { type: 'qr'; value: string }
  | { type: 'divider' }
  | { type: 'feed'; lines?: number };

export interface PrintResult {
  success: boolean;
  errorMessage?: string;
}
```

#### packages/shared-types/src/events.ts

```typescript
export interface TransactionRecord {
  id: string;
  sessionId: string;
  type:
    | 'bill_insert'
    | 'bill_stack'
    | 'bill_reject'
    | 'coin_insert'
    | 'coin_reject'
    | 'cash_dispensed'
    | 'reconciliation';
  amountCents: number;
  currency: string;
  deviceId: string;
  metadata: Record<string, unknown> | null;
  synced: boolean;
  createdAt: string;
  syncedAt: string | null;
}

export interface HardwareEventRecord {
  id: number;
  deviceCategory: string;
  deviceId: string;
  eventType: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  payload: Record<string, unknown> | null;
  synced: boolean;
  createdAt: string;
}

export interface UserEventRecord {
  id: number;
  sessionId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  synced: boolean;
  createdAt: string;
}

export interface UserEvent {
  eventType: string;
  payload?: Record<string, unknown>;
}

export interface MoneyAmount {
  cents: number;
  currency: string;
}
```

#### packages/shared-types/src/ipc.ts

```typescript
import type { BillEvent, CoinEvent, NFCEvent, BarcodeEvent, ReceiptData, PrintResult, HardwareHealthReport } from './hardware';
import type { MoneyAmount, UserEvent } from './events';

/**
 * The KioskAPI interface defines every method and event the wrapped web app
 * can access via window.kioskAPI. This is the contract between the renderer
 * (web app) and the main process.
 *
 * Every addition to this interface requires:
 * 1. A handler in main/ipc/
 * 2. A bridge entry in preload/index.ts
 * 3. A channel constant in this file's IPC_CHANNELS
 */
export interface KioskAPI {
  // ── Hardware → Web App (events, renderer listens) ──
  onBillInserted: (cb: (event: BillEvent) => void) => () => void;      // Returns unsubscribe fn
  onBillStacked: (cb: (event: BillEvent) => void) => () => void;
  onCoinInserted: (cb: (event: CoinEvent) => void) => () => void;
  onNFCRead: (cb: (event: NFCEvent) => void) => () => void;
  onBarcodeScanned: (cb: (event: BarcodeEvent) => void) => () => void;
  onHardwareStatus: (cb: (status: HardwareHealthReport) => void) => () => void;
  onKioskDisabled: (cb: () => void) => () => void;

  // ── Web App → Hardware (commands, renderer calls) ──
  enableBillAcceptor: () => Promise<void>;
  disableBillAcceptor: () => Promise<void>;
  enableCoinAcceptor: () => Promise<void>;
  disableCoinAcceptor: () => Promise<void>;
  returnBill: () => Promise<void>;
  printReceipt: (data: ReceiptData) => Promise<PrintResult>;
  openCashDrawer: () => Promise<void>;

  // ── Web App → State (queries) ──
  getSessionBalance: () => Promise<MoneyAmount>;
  getHardwareStatus: () => Promise<HardwareHealthReport>;
  getKioskConfig: () => Promise<PublicKioskConfig>;

  // ── Web App → Kiosk (user events) ──
  reportUserEvent: (event: UserEvent) => Promise<void>;
}

/**
 * Subset of kiosk config safe to expose to the web app renderer.
 */
export interface PublicKioskConfig {
  kioskId: string;
  environment: string;
  appVersion: string;
  disabled: boolean;
}

/**
 * IPC channel names — single source of truth.
 * Main and preload must use these constants, never raw strings.
 */
export const IPC_CHANNELS = {
  // Commands (invoke/handle)
  ENABLE_BILL_ACCEPTOR: 'hardware:bill-acceptor:enable',
  DISABLE_BILL_ACCEPTOR: 'hardware:bill-acceptor:disable',
  ENABLE_COIN_ACCEPTOR: 'hardware:coin-acceptor:enable',
  DISABLE_COIN_ACCEPTOR: 'hardware:coin-acceptor:disable',
  RETURN_BILL: 'hardware:bill-acceptor:return',
  PRINT_RECEIPT: 'hardware:printer:print-receipt',
  OPEN_CASH_DRAWER: 'hardware:printer:open-drawer',
  GET_SESSION_BALANCE: 'state:session-balance',
  GET_HARDWARE_STATUS: 'state:hardware-status',
  GET_KIOSK_CONFIG: 'state:kiosk-config',
  REPORT_USER_EVENT: 'event:user',

  // Events (send/on)
  BILL_INSERTED: 'event:bill-inserted',
  BILL_STACKED: 'event:bill-stacked',
  COIN_INSERTED: 'event:coin-inserted',
  NFC_READ: 'event:nfc-read',
  BARCODE_SCANNED: 'event:barcode-scanned',
  HARDWARE_STATUS: 'event:hardware-status',
  KIOSK_DISABLED: 'event:kiosk-disabled',
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
```

#### packages/shared-types/src/config.ts

```typescript
export interface KioskConfig {
  kioskId: string;
  environment: 'dev' | 'staging' | 'prod';

  webApp: {
    url: string;
    fallbackPath: string; // Local HTML shown when offline
    allowedOrigins: string[];
  };

  hardware: {
    printer?: HardwareDeviceConfig;
    billValidator?: HardwareDeviceConfig;
    coinValidator?: HardwareDeviceConfig;
    nfc?: HardwareDeviceConfig;
    barcode?: HardwareDeviceConfig;
  };

  network: {
    vpn: { enabled: boolean; configPath: string };
    mqtt: {
      endpoint: string;
      certPath: string;
      keyPath: string;
      caPath: string;
    };
  };

  telemetry: {
    heartbeatIntervalMs: number;
    syncIntervalMs: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };

  update: {
    checkIntervalMs: number;
    autoInstall: boolean;
    channel: 'stable' | 'beta';
  };

  admin: {
    pinHash: string;
    nfcAdminUIDs: string[];
    sessionTimeoutMs: number;
  };

  security: {
    disableDevTools: boolean;
  };
}

export interface HardwareDeviceConfig {
  adapter: string; // Adapter class name, e.g. 'EpsonTMT88Adapter'
  config: Record<string, unknown>; // Adapter-specific config (port, baudRate, etc.)
}

/**
 * Default config for development.
 * In production, this is loaded from /etc/kioskos/config.json or equivalent.
 */
export const DEFAULT_DEV_CONFIG: KioskConfig = {
  kioskId: 'kiosk-dev-001',
  environment: 'dev',
  webApp: {
    url: 'https://example.com',
    fallbackPath: './resources/offline.html',
    allowedOrigins: ['https://example.com', 'http://localhost:3000'],
  },
  hardware: {},
  network: {
    vpn: { enabled: false, configPath: '' },
    mqtt: { endpoint: '', certPath: '', keyPath: '', caPath: '' },
  },
  telemetry: {
    heartbeatIntervalMs: 30_000,
    syncIntervalMs: 10_000,
    logLevel: 'debug',
  },
  update: {
    checkIntervalMs: 900_000,
    autoInstall: false,
    channel: 'stable',
  },
  admin: {
    pinHash: '',
    nfcAdminUIDs: [],
    sessionTimeoutMs: 300_000,
  },
  security: {
    disableDevTools: false,
  },
};
```

#### packages/shared-types/src/errors.ts

```typescript
/**
 * Base error for all KioskOS errors.
 * Every error in the system should extend this.
 */
export class KioskError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;

  constructor(message: string, code: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'KioskError';
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class HardwareError extends KioskError {
  public readonly deviceId: string;
  public readonly category: string;

  constructor(
    message: string,
    code: string,
    deviceId: string,
    category: string,
    context: Record<string, unknown> = {},
  ) {
    super(message, code, { ...context, deviceId, category });
    this.name = 'HardwareError';
    this.deviceId = deviceId;
    this.category = category;
  }
}

export class DatabaseError extends KioskError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 'DB_ERROR', context);
    this.name = 'DatabaseError';
  }
}

export class IPCError extends KioskError {
  constructor(message: string, channel: string, context: Record<string, unknown> = {}) {
    super(message, 'IPC_ERROR', { ...context, channel });
    this.name = 'IPCError';
  }
}
```

#### packages/shared-types/src/index.ts

```typescript
export * from './hardware';
export * from './events';
export * from './ipc';
export * from './config';
export * from './errors';
```

### Verification

```bash
pnpm install
cd packages/shared-types
pnpm typecheck  # Should pass with zero errors
cd ../..
```

---

## Step 3: Scaffold the Electron App with electron-vite

### 3.1 Create directory structure

```bash
mkdir -p apps/electron/src/{main,preload,renderer/{admin,webview},shared}
mkdir -p apps/electron/src/main/{ipc,db/{migrations,repositories},hardware/adapters}
mkdir -p apps/electron/resources
```

### 3.2 apps/electron/package.json

```json
{
  "name": "@kioskos/electron",
  "version": "0.1.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "dev:mock": "KIOSKOS_MOCK_HARDWARE=true electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "clean": "rm -rf out dist coverage",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "electron-updater": "^6.3.0",
    "winston": "^3.17.0",
    "winston-daily-rotate-file": "^5.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@electron-toolkit/tsconfig": "^1.0.1",
    "@electron-toolkit/utils": "^3.0.0",
    "@types/better-sqlite3": "^7.6.12",
    "@types/uuid": "^10.0.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.1.0",
    "electron-vite": "^2.3.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-vue": "^5.2.0",
    "vue": "^3.5.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "typescript": "^5.7.0"
  }
}
```

### 3.3 apps/electron/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "paths": {
      "@kioskos/shared-types": ["../../packages/shared-types/src"],
      "@main/*": ["./src/main/*"],
      "@preload/*": ["./src/preload/*"],
      "@shared/*": ["./src/shared/*"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/shared-types" }
  ]
}
```

### 3.4 apps/electron/tsconfig.node.json

electron-vite config file needs its own tsconfig:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["electron.vite.config.ts"]
}
```

### 3.5 apps/electron/electron.vite.config.ts

```typescript
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
        '@kioskos/shared-types': resolve('../../packages/shared-types/src'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@kioskos/shared-types': resolve('../../packages/shared-types/src'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@kioskos/shared-types': resolve('../../packages/shared-types/src'),
        '@renderer': resolve('src/renderer'),
      },
    },
    plugins: [vue()],
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: {
          admin: resolve('src/renderer/admin/index.html'),
          webview: resolve('src/renderer/webview/index.html'),
        },
      },
    },
  },
});
```

### 3.6 apps/electron/vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/main/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@kioskos/shared-types': resolve(__dirname, '../../packages/shared-types/src'),
    },
  },
});
```

### 3.7 apps/electron/electron-builder.yml

```yaml
appId: com.kioskos.app
productName: KioskOS
directories:
  buildResources: resources
  output: dist
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  - '!{vitest.config.ts}'
linux:
  target: AppImage
  category: Utility
win:
  target: nsis
nsis:
  oneClick: true
  perMachine: true
mac:
  target: dmg
  hardenedRuntime: true
publish:
  provider: generic
  url: https://update.example.com
```

### Verification

```bash
pnpm install
cd apps/electron
pnpm typecheck   # May have errors — that's OK, we'll add source files next
cd ../..
```

---

## Step 4: Implement the Main Process Entry Point

### 4.1 apps/electron/src/main/logger.ts

Set up structured logging first — everything else depends on it.

```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { app } from 'electron';
import { join } from 'path';

const LOG_DIR = join(app.getPath('userData'), 'logs');

const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
    const mod = module ? `[${module}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${mod} ${message}${metaStr}`;
  }),
);

export const logger = winston.createLogger({
  level: process.env.KIOSKOS_LOG_LEVEL ?? 'info',
  defaultMeta: {
    kioskId: process.env.KIOSKOS_KIOSK_ID ?? 'kiosk-dev-001',
  },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug',
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'kioskos-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '7d',
      format: jsonFormat,
    }),
  ],
});

export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}
```

### 4.2 apps/electron/src/main/config-loader.ts

```typescript
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { KioskConfig, DEFAULT_DEV_CONFIG } from '@kioskos/shared-types';
import { createModuleLogger } from './logger';

const log = createModuleLogger('config');

/**
 * Load kiosk config from:
 * 1. /etc/kioskos/config.json (production)
 * 2. KIOSKOS_CONFIG_PATH env var
 * 3. <userData>/config.json
 * 4. DEFAULT_DEV_CONFIG (development fallback)
 */
export function loadConfig(): KioskConfig {
  const candidates = [
    process.env.KIOSKOS_CONFIG_PATH,
    '/etc/kioskos/config.json',
    join(app.getPath('userData'), 'config.json'),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, 'utf-8');
        const config = JSON.parse(raw) as KioskConfig;
        log.info('Config loaded', { path });
        return config;
      } catch (err) {
        log.warn('Failed to load config file', { path, error: String(err) });
      }
    }
  }

  log.info('No config file found, using default dev config');
  return DEFAULT_DEV_CONFIG;
}
```

### 4.3 apps/electron/src/main/window.ts

```typescript
import { BrowserWindow, BrowserView, shell, session } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { KioskConfig } from '@kioskos/shared-types';
import { createModuleLogger } from './logger';

const log = createModuleLogger('window');

let mainWindow: BrowserWindow | null = null;
let webAppView: BrowserView | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getWebAppView(): BrowserView | null {
  return webAppView;
}

export function createMainWindow(config: KioskConfig): BrowserWindow {
  const isDev = is.dev;

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    kiosk: !isDev, // Kiosk mode only in production
    fullscreen: !isDev,
    frame: isDev, // Show frame in dev for easy closing
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev || !config.security.disableDevTools,
    },
  });

  // Apply Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          " script-src 'self' 'unsafe-inline';" +  // unsafe-inline needed for Vue in dev
          " style-src 'self' 'unsafe-inline';" +
          " connect-src 'self' ws://localhost:*;" +  // HMR in dev
          " img-src 'self' data:;"
        ],
      },
    });
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    log.info('Main window shown');
  });

  // Block navigation to unknown origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = config.webApp.allowedOrigins;
    const isAllowed = allowed.some((origin) => url.startsWith(origin));
    if (!isAllowed && !url.startsWith('file://')) {
      log.warn('Blocked navigation to disallowed origin', { url });
      event.preventDefault();
    }
  });

  // Block new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    log.warn('Blocked window open', { url });
    return { action: 'deny' };
  });

  // Load the webview shell (which will contain the BrowserView for the web app)
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/webview/index.html`);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/webview/index.html'));
  }

  return mainWindow;
}

/**
 * Creates a BrowserView that loads the actual web application.
 * This is overlaid on the main window.
 */
export function createWebAppView(config: KioskConfig): BrowserView {
  if (!mainWindow) throw new Error('Main window must exist before creating web app view');

  webAppView = new BrowserView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: is.dev || !config.security.disableDevTools,
    },
  });

  mainWindow.setBrowserView(webAppView);

  // Size the BrowserView to fill the window
  const bounds = mainWindow.getContentBounds();
  webAppView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  webAppView.setAutoResize({ width: true, height: true });

  // Load the web app URL
  log.info('Loading web app', { url: config.webApp.url });
  webAppView.webContents.loadURL(config.webApp.url).catch((err) => {
    log.error('Failed to load web app, loading fallback', { error: String(err) });
    webAppView?.webContents.loadFile(
      join(__dirname, '../renderer/webview/offline.html'),
    );
  });

  return webAppView;
}
```

### 4.4 apps/electron/src/main/index.ts

```typescript
import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { createMainWindow, createWebAppView, getMainWindow } from './window';
import { loadConfig } from './config-loader';
import { createModuleLogger } from './logger';
import { initializeDatabase } from './db/database';
import { registerIPCHandlers } from './ipc/register';

const log = createModuleLogger('main');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.warn('Another instance is already running, quitting');
  app.quit();
}

app.whenReady().then(() => {
  log.info('App ready, starting initialization');

  // Load configuration
  const config = loadConfig();
  log.info('Configuration loaded', { kioskId: config.kioskId, env: config.environment });

  // Initialize database
  const db = initializeDatabase();
  log.info('Database initialized');

  // Register IPC handlers
  registerIPCHandlers(db, config);
  log.info('IPC handlers registered');

  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.kioskos.app');

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Create the main window
  const mainWindow = createMainWindow(config);

  // Once main window is ready, create the web app BrowserView
  mainWindow.once('ready-to-show', () => {
    createWebAppView(config);
  });

  // Handle second instance (focus existing window)
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(config);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Global error handlers
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', { reason: String(reason) });
});
```

### Verification

```bash
cd apps/electron
pnpm typecheck
```

> **Note**: This won't fully pass yet — we still need to create the IPC handlers, database, and preload. That's the next steps. The goal is that each file compiles in isolation.

---

## Step 5: Implement the Database Layer

### 5.1 apps/electron/src/main/db/database.ts

```typescript
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { createModuleLogger } from '../logger';

const log = createModuleLogger('database');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}

export function initializeDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? join(app.getPath('userData'), 'kioskos.db');
  log.info('Opening database', { path });

  // Ensure directory exists
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(path);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Run all SQL migration files in order.
 * Migrations are numbered: 001_init.sql, 002_add_index.sql, etc.
 * Tracks which migrations have been applied in a `_migrations` table.
 */
function runMigrations(database: Database.Database): void {
  // Create migrations tracking table
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = join(__dirname, '../../src/main/db/migrations');
  // In production, migrations are bundled — try both locations
  const dirs = [
    migrationsDir,
    join(__dirname, 'migrations'),
    join(process.cwd(), 'src/main/db/migrations'),
  ];

  let migrationFiles: string[] = [];
  let resolvedDir = '';

  for (const dir of dirs) {
    if (existsSync(dir)) {
      migrationFiles = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      resolvedDir = dir;
      break;
    }
  }

  if (migrationFiles.length === 0) {
    log.warn('No migration files found');
    return;
  }

  const applied = new Set(
    database
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row: { name: string }) => row.name),
  );

  const runMigration = database.transaction((name: string, sql: string) => {
    database.exec(sql);
    database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
  });

  for (const file of migrationFiles) {
    if (applied.has(file)) continue;
    log.info('Running migration', { file });
    const sql = readFileSync(join(resolvedDir, file), 'utf-8');
    runMigration(file, sql);
    log.info('Migration applied', { file });
  }
}

/**
 * Close the database connection. Call on app quit.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info('Database closed');
  }
}
```

### 5.2 apps/electron/src/main/db/migrations/001_init.sql

```sql
-- Core tables for KioskOS

-- Money transactions
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'bill_insert', 'bill_stack', 'bill_reject',
    'coin_insert', 'coin_reject',
    'cash_dispensed', 'reconciliation'
  )),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  device_id TEXT NOT NULL,
  metadata TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_synced ON transactions(synced);
CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- Hardware events
CREATE TABLE IF NOT EXISTS hardware_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_category TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error', 'critical')),
  payload TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hw_events_synced ON hardware_events(synced);
CREATE INDEX IF NOT EXISTS idx_hw_events_device ON hardware_events(device_id);

-- User / session events
CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_events_synced ON user_events(synced);
CREATE INDEX IF NOT EXISTS idx_user_events_session ON user_events(session_id);

-- Sync queue metadata
CREATE TABLE IF NOT EXISTS sync_state (
  table_name TEXT PRIMARY KEY,
  last_synced_id TEXT,
  last_synced_at TEXT
);

-- Local config overrides
CREATE TABLE IF NOT EXISTS local_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5.3 apps/electron/src/main/db/repositories/TransactionRepo.ts

```typescript
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { TransactionRecord } from '@kioskos/shared-types';

export interface CreateTransactionInput {
  sessionId: string;
  type: TransactionRecord['type'];
  amountCents: number;
  currency: string;
  deviceId: string;
  metadata?: Record<string, unknown>;
}

export class TransactionRepo {
  private insertStmt: Database.Statement;
  private getByIdStmt: Database.Statement;
  private getBySessionStmt: Database.Statement;
  private getUnsyncedStmt: Database.Statement;
  private markSyncedStmt: Database.Statement;
  private getSessionTotalStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO transactions (id, session_id, type, amount_cents, currency, device_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    this.getBySessionStmt = db.prepare('SELECT * FROM transactions WHERE session_id = ? ORDER BY created_at');
    this.getUnsyncedStmt = db.prepare('SELECT * FROM transactions WHERE synced = 0 ORDER BY created_at LIMIT ?');

    this.markSyncedStmt = db.prepare(`
      UPDATE transactions SET synced = 1, synced_at = datetime('now') WHERE id = ?
    `);

    this.getSessionTotalStmt = db.prepare(`
      SELECT COALESCE(SUM(
        CASE
          WHEN type IN ('bill_stack', 'coin_insert') THEN amount_cents
          WHEN type IN ('cash_dispensed') THEN -amount_cents
          ELSE 0
        END
      ), 0) as total_cents
      FROM transactions
      WHERE session_id = ?
    `);
  }

  create(input: CreateTransactionInput): TransactionRecord {
    const id = uuid();
    this.insertStmt.run(
      id,
      input.sessionId,
      input.type,
      input.amountCents,
      input.currency,
      input.deviceId,
      input.metadata ? JSON.stringify(input.metadata) : null,
    );
    return this.getById(id)!;
  }

  getById(id: string): TransactionRecord | null {
    const row = this.getByIdStmt.get(id) as RawTransactionRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  getBySession(sessionId: string): TransactionRecord[] {
    const rows = this.getBySessionStmt.all(sessionId) as RawTransactionRow[];
    return rows.map((r) => this.mapRow(r));
  }

  getUnsynced(limit = 100): TransactionRecord[] {
    const rows = this.getUnsyncedStmt.all(limit) as RawTransactionRow[];
    return rows.map((r) => this.mapRow(r));
  }

  markSynced(id: string): void {
    this.markSyncedStmt.run(id);
  }

  markManySynced(ids: string[]): void {
    const txn = this.db.transaction((idList: string[]) => {
      for (const id of idList) {
        this.markSyncedStmt.run(id);
      }
    });
    txn(ids);
  }

  getSessionTotalCents(sessionId: string): number {
    const row = this.getSessionTotalStmt.get(sessionId) as { total_cents: number };
    return row.total_cents;
  }

  private mapRow(row: RawTransactionRow): TransactionRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type as TransactionRecord['type'],
      amountCents: row.amount_cents,
      currency: row.currency,
      deviceId: row.device_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      synced: row.synced === 1,
      createdAt: row.created_at,
      syncedAt: row.synced_at,
    };
  }
}

interface RawTransactionRow {
  id: string;
  session_id: string;
  type: string;
  amount_cents: number;
  currency: string;
  device_id: string;
  metadata: string | null;
  synced: number;
  created_at: string;
  synced_at: string | null;
}
```

### 5.4 apps/electron/src/main/db/repositories/HardwareEventRepo.ts

```typescript
import type Database from 'better-sqlite3';
import type { HardwareEventRecord } from '@kioskos/shared-types';

export interface CreateHardwareEventInput {
  deviceCategory: string;
  deviceId: string;
  eventType: string;
  severity: HardwareEventRecord['severity'];
  payload?: Record<string, unknown>;
}

export class HardwareEventRepo {
  private insertStmt: Database.Statement;
  private getUnsyncedStmt: Database.Statement;
  private markSyncedStmt: Database.Statement;
  private getRecentStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO hardware_events (device_category, device_id, event_type, severity, payload)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.getUnsyncedStmt = db.prepare(
      'SELECT * FROM hardware_events WHERE synced = 0 ORDER BY created_at LIMIT ?',
    );

    this.markSyncedStmt = db.prepare(
      "UPDATE hardware_events SET synced = 1 WHERE id = ?",
    );

    this.getRecentStmt = db.prepare(
      'SELECT * FROM hardware_events ORDER BY created_at DESC LIMIT ?',
    );
  }

  create(input: CreateHardwareEventInput): number {
    const result = this.insertStmt.run(
      input.deviceCategory,
      input.deviceId,
      input.eventType,
      input.severity,
      input.payload ? JSON.stringify(input.payload) : null,
    );
    return Number(result.lastInsertRowid);
  }

  getUnsynced(limit = 100): HardwareEventRecord[] {
    const rows = this.getUnsyncedStmt.all(limit) as RawHardwareEventRow[];
    return rows.map((r) => this.mapRow(r));
  }

  markSynced(id: number): void {
    this.markSyncedStmt.run(id);
  }

  getRecent(limit = 50): HardwareEventRecord[] {
    const rows = this.getRecentStmt.all(limit) as RawHardwareEventRow[];
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: RawHardwareEventRow): HardwareEventRecord {
    return {
      id: row.id,
      deviceCategory: row.device_category,
      deviceId: row.device_id,
      eventType: row.event_type,
      severity: row.severity as HardwareEventRecord['severity'],
      payload: row.payload ? JSON.parse(row.payload) : null,
      synced: row.synced === 1,
      createdAt: row.created_at,
    };
  }
}

interface RawHardwareEventRow {
  id: number;
  device_category: string;
  device_id: string;
  event_type: string;
  severity: string;
  payload: string | null;
  synced: number;
  created_at: string;
}
```

### 5.5 apps/electron/src/main/db/repositories/UserEventRepo.ts

```typescript
import type Database from 'better-sqlite3';
import type { UserEventRecord } from '@kioskos/shared-types';

export interface CreateUserEventInput {
  sessionId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

export class UserEventRepo {
  private insertStmt: Database.Statement;
  private getUnsyncedStmt: Database.Statement;
  private markSyncedStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO user_events (session_id, event_type, payload) VALUES (?, ?, ?)
    `);

    this.getUnsyncedStmt = db.prepare(
      'SELECT * FROM user_events WHERE synced = 0 ORDER BY created_at LIMIT ?',
    );

    this.markSyncedStmt = db.prepare(
      "UPDATE user_events SET synced = 1 WHERE id = ?",
    );
  }

  create(input: CreateUserEventInput): number {
    const result = this.insertStmt.run(
      input.sessionId,
      input.eventType,
      input.payload ? JSON.stringify(input.payload) : null,
    );
    return Number(result.lastInsertRowid);
  }

  getUnsynced(limit = 100): UserEventRecord[] {
    const rows = this.getUnsyncedStmt.all(limit) as RawUserEventRow[];
    return rows.map((r) => this.mapRow(r));
  }

  markSynced(id: number): void {
    this.markSyncedStmt.run(id);
  }

  private mapRow(row: RawUserEventRow): UserEventRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      eventType: row.event_type,
      payload: row.payload ? JSON.parse(row.payload) : null,
      synced: row.synced === 1,
      createdAt: row.created_at,
    };
  }
}

interface RawUserEventRow {
  id: number;
  session_id: string;
  event_type: string;
  payload: string | null;
  synced: number;
  created_at: string;
}
```

---

## Step 6: Implement IPC Bridge

### 6.1 apps/electron/src/main/ipc/register.ts

```typescript
import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { IPC_CHANNELS, KioskConfig } from '@kioskos/shared-types';
import { TransactionRepo } from '../db/repositories/TransactionRepo';
import { UserEventRepo } from '../db/repositories/UserEventRepo';
import { createModuleLogger } from '../logger';

const log = createModuleLogger('ipc');

/**
 * Registers all IPC handlers.
 * This is the single place where ipcMain.handle calls are made.
 */
export function registerIPCHandlers(db: Database.Database, config: KioskConfig): void {
  const transactionRepo = new TransactionRepo(db);
  const userEventRepo = new UserEventRepo(db);

  // ── State queries ──

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_BALANCE, async (_event, sessionId: string) => {
    log.debug('Getting session balance', { sessionId });
    const totalCents = transactionRepo.getSessionTotalCents(sessionId);
    return { cents: totalCents, currency: 'USD' };
  });

  ipcMain.handle(IPC_CHANNELS.GET_HARDWARE_STATUS, async () => {
    log.debug('Getting hardware status');
    // TODO: Wire to HardwareManager when implemented (Phase 2)
    return {
      timestamp: new Date().toISOString(),
      devices: [],
      overallHealthy: true,
    };
  });

  ipcMain.handle(IPC_CHANNELS.GET_KIOSK_CONFIG, async () => {
    return {
      kioskId: config.kioskId,
      environment: config.environment,
      appVersion: '0.1.0', // TODO: Read from package.json
      disabled: false,     // TODO: Wire to remote command state
    };
  });

  // ── User events ──

  ipcMain.handle(IPC_CHANNELS.REPORT_USER_EVENT, async (_event, userEvent: { eventType: string; payload?: Record<string, unknown> }) => {
    log.debug('User event reported', { eventType: userEvent.eventType });
    // TODO: Get real session ID from session manager
    userEventRepo.create({
      sessionId: 'placeholder-session',
      eventType: userEvent.eventType,
      payload: userEvent.payload,
    });
  });

  // ── Hardware commands (stubs until Phase 2) ──

  ipcMain.handle(IPC_CHANNELS.ENABLE_BILL_ACCEPTOR, async () => {
    log.info('Bill acceptor enable requested');
    // TODO: Wire to HardwareManager
  });

  ipcMain.handle(IPC_CHANNELS.DISABLE_BILL_ACCEPTOR, async () => {
    log.info('Bill acceptor disable requested');
  });

  ipcMain.handle(IPC_CHANNELS.ENABLE_COIN_ACCEPTOR, async () => {
    log.info('Coin acceptor enable requested');
  });

  ipcMain.handle(IPC_CHANNELS.DISABLE_COIN_ACCEPTOR, async () => {
    log.info('Coin acceptor disable requested');
  });

  ipcMain.handle(IPC_CHANNELS.RETURN_BILL, async () => {
    log.info('Bill return requested');
  });

  ipcMain.handle(IPC_CHANNELS.PRINT_RECEIPT, async (_event, _data) => {
    log.info('Print receipt requested');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_CASH_DRAWER, async () => {
    log.info('Cash drawer open requested');
  });

  log.info('All IPC handlers registered');
}
```

### 6.2 apps/electron/src/preload/index.ts

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, KioskAPI } from '@kioskos/shared-types';

/**
 * The preload script exposes a typed `kioskAPI` to the renderer.
 * This is the ONLY bridge between the web app and the main process.
 */
const kioskAPI: KioskAPI = {
  // ── Hardware events (renderer subscribes) ──
  onBillInserted: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data as any);
    ipcRenderer.on(IPC_CHANNELS.BILL_INSERTED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BILL_INSERTED, handler);
  },

  onBillStacked: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data as any);
    ipcRenderer.on(IPC_CHANNELS.BILL_STACKED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BILL_STACKED, handler);
  },

  onCoinInserted: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data as any);
    ipcRenderer.on(IPC_CHANNELS.COIN_INSERTED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.COIN_INSERTED, handler);
  },

  onNFCRead: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data as any);
    ipcRenderer.on(IPC_CHANNELS.NFC_READ, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NFC_READ, handler);
  },

  onBarcodeScanned: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data as any);
    ipcRenderer.on(IPC_CHANNELS.BARCODE_SCANNED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BARCODE_SCANNED, handler);
  },

  onHardwareStatus: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data as any);
    ipcRenderer.on(IPC_CHANNELS.HARDWARE_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HARDWARE_STATUS, handler);
  },

  onKioskDisabled: (cb) => {
    const handler = () => cb();
    ipcRenderer.on(IPC_CHANNELS.KIOSK_DISABLED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.KIOSK_DISABLED, handler);
  },

  // ── Hardware commands (renderer invokes) ──
  enableBillAcceptor: () => ipcRenderer.invoke(IPC_CHANNELS.ENABLE_BILL_ACCEPTOR),
  disableBillAcceptor: () => ipcRenderer.invoke(IPC_CHANNELS.DISABLE_BILL_ACCEPTOR),
  enableCoinAcceptor: () => ipcRenderer.invoke(IPC_CHANNELS.ENABLE_COIN_ACCEPTOR),
  disableCoinAcceptor: () => ipcRenderer.invoke(IPC_CHANNELS.DISABLE_COIN_ACCEPTOR),
  returnBill: () => ipcRenderer.invoke(IPC_CHANNELS.RETURN_BILL),
  printReceipt: (data) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_RECEIPT, data),
  openCashDrawer: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_CASH_DRAWER),

  // ── State queries ──
  getSessionBalance: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_BALANCE),
  getHardwareStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HARDWARE_STATUS),
  getKioskConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_KIOSK_CONFIG),

  // ── User events ──
  reportUserEvent: (event) => ipcRenderer.invoke(IPC_CHANNELS.REPORT_USER_EVENT, event),
};

contextBridge.exposeInMainWorld('kioskAPI', kioskAPI);
```

### 6.3 Type augmentation for window.kioskAPI

Create `apps/electron/src/renderer/env.d.ts`:

```typescript
import type { KioskAPI } from '@kioskos/shared-types';

declare global {
  interface Window {
    kioskAPI: KioskAPI;
  }
}
```

---

## Step 7: Create Renderer Pages

### 7.1 Webview shell (hosts the BrowserView overlay)

Create `apps/electron/src/renderer/webview/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KioskOS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .loading {
      text-align: center;
    }
    .loading h1 { font-size: 2rem; margin-bottom: 1rem; }
    .loading p { font-size: 1rem; opacity: 0.6; }
    .spinner {
      width: 48px; height: 48px;
      border: 4px solid rgba(255,255,255,0.2);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <h1>KioskOS</h1>
    <p>Loading application...</p>
  </div>
</body>
</html>
```

### 7.2 Offline fallback page

Create `apps/electron/resources/offline.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KioskOS — Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: #1a1a2e; color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .container { text-align: center; max-width: 500px; padding: 2rem; }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    p { font-size: 1.2rem; opacity: 0.7; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Temporarily Unavailable</h1>
    <p>This kiosk is unable to connect to its application. It will automatically reconnect when the network is restored.</p>
  </div>
</body>
</html>
```

### 7.3 Admin panel placeholder

Create `apps/electron/src/renderer/admin/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KioskOS Admin</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

Create `apps/electron/src/renderer/admin/main.ts`:

```typescript
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

Create `apps/electron/src/renderer/admin/App.vue`:

```vue
<script setup lang="ts">
// Admin functionality will be implemented in Phase 5.
</script>

<template>
  <div style="padding: 2rem; font-family: sans-serif">
    <h1>KioskOS Admin Panel</h1>
    <p>Admin functionality will be implemented in Phase 5.</p>
    <p>Kiosk ID: loading...</p>
  </div>
</template>
```

---

## Step 8: Write Unit Tests for Repositories

### 8.1 apps/electron/src/main/db/repositories/TransactionRepo.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TransactionRepo } from './TransactionRepo';

describe('TransactionRepo', () => {
  let db: Database.Database;
  let repo: TransactionRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run the init migration
    const migration = readFileSync(
      join(__dirname, '../migrations/001_init.sql'),
      'utf-8',
    );
    db.exec(migration);

    repo = new TransactionRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a transaction and retrieve it by id', () => {
    const txn = repo.create({
      sessionId: 'sess-001',
      type: 'bill_stack',
      amountCents: 500,
      currency: 'USD',
      deviceId: 'bill-validator-1',
    });

    expect(txn.id).toBeDefined();
    expect(txn.sessionId).toBe('sess-001');
    expect(txn.type).toBe('bill_stack');
    expect(txn.amountCents).toBe(500);
    expect(txn.synced).toBe(false);

    const fetched = repo.getById(txn.id);
    expect(fetched).toEqual(txn);
  });

  it('should return null for non-existent id', () => {
    expect(repo.getById('nonexistent')).toBeNull();
  });

  it('should get transactions by session', () => {
    repo.create({ sessionId: 'sess-A', type: 'bill_stack', amountCents: 100, currency: 'USD', deviceId: 'd1' });
    repo.create({ sessionId: 'sess-A', type: 'coin_insert', amountCents: 25, currency: 'USD', deviceId: 'd2' });
    repo.create({ sessionId: 'sess-B', type: 'bill_stack', amountCents: 500, currency: 'USD', deviceId: 'd1' });

    const sessA = repo.getBySession('sess-A');
    expect(sessA).toHaveLength(2);

    const sessB = repo.getBySession('sess-B');
    expect(sessB).toHaveLength(1);
  });

  it('should calculate session total correctly', () => {
    repo.create({ sessionId: 's1', type: 'bill_stack', amountCents: 500, currency: 'USD', deviceId: 'd1' });
    repo.create({ sessionId: 's1', type: 'coin_insert', amountCents: 100, currency: 'USD', deviceId: 'd2' });
    repo.create({ sessionId: 's1', type: 'bill_reject', amountCents: 1000, currency: 'USD', deviceId: 'd1' }); // rejected = not counted
    repo.create({ sessionId: 's1', type: 'cash_dispensed', amountCents: 200, currency: 'USD', deviceId: 'd3' }); // subtracted

    const total = repo.getSessionTotalCents('s1');
    expect(total).toBe(400); // 500 + 100 - 200
  });

  it('should return 0 for empty session', () => {
    expect(repo.getSessionTotalCents('nonexistent')).toBe(0);
  });

  it('should track and mark synced status', () => {
    const txn1 = repo.create({ sessionId: 's1', type: 'bill_stack', amountCents: 100, currency: 'USD', deviceId: 'd1' });
    const txn2 = repo.create({ sessionId: 's1', type: 'coin_insert', amountCents: 50, currency: 'USD', deviceId: 'd2' });

    const unsynced = repo.getUnsynced(10);
    expect(unsynced).toHaveLength(2);

    repo.markSynced(txn1.id);

    const unsyncedAfter = repo.getUnsynced(10);
    expect(unsyncedAfter).toHaveLength(1);
    expect(unsyncedAfter[0]!.id).toBe(txn2.id);
  });

  it('should mark many synced in a transaction', () => {
    const t1 = repo.create({ sessionId: 's1', type: 'bill_stack', amountCents: 100, currency: 'USD', deviceId: 'd1' });
    const t2 = repo.create({ sessionId: 's1', type: 'bill_stack', amountCents: 200, currency: 'USD', deviceId: 'd1' });
    const t3 = repo.create({ sessionId: 's1', type: 'bill_stack', amountCents: 300, currency: 'USD', deviceId: 'd1' });

    repo.markManySynced([t1.id, t2.id]);

    const unsynced = repo.getUnsynced(10);
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0]!.id).toBe(t3.id);
  });

  it('should store and retrieve metadata as JSON', () => {
    const meta = { rejectionReason: 'crumpled', sensorReading: 42 };
    const txn = repo.create({
      sessionId: 's1',
      type: 'bill_reject',
      amountCents: 0,
      currency: 'USD',
      deviceId: 'd1',
      metadata: meta,
    });

    const fetched = repo.getById(txn.id);
    expect(fetched?.metadata).toEqual(meta);
  });
});
```

### 8.2 apps/electron/src/main/db/repositories/HardwareEventRepo.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HardwareEventRepo } from './HardwareEventRepo';

describe('HardwareEventRepo', () => {
  let db: Database.Database;
  let repo: HardwareEventRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    const migration = readFileSync(join(__dirname, '../migrations/001_init.sql'), 'utf-8');
    db.exec(migration);
    repo = new HardwareEventRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create and retrieve hardware events', () => {
    const id = repo.create({
      deviceCategory: 'bill-validator',
      deviceId: 'mei-001',
      eventType: 'jam_detected',
      severity: 'error',
      payload: { errorCode: 'E04' },
    });

    expect(id).toBeGreaterThan(0);

    const recent = repo.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.eventType).toBe('jam_detected');
    expect(recent[0]!.payload).toEqual({ errorCode: 'E04' });
  });

  it('should track sync status', () => {
    const id1 = repo.create({ deviceCategory: 'printer', deviceId: 'p1', eventType: 'paper_low', severity: 'warn' });
    repo.create({ deviceCategory: 'printer', deviceId: 'p1', eventType: 'paper_out', severity: 'error' });

    expect(repo.getUnsynced(10)).toHaveLength(2);

    repo.markSynced(id1);
    expect(repo.getUnsynced(10)).toHaveLength(1);
  });

  it('should return events in reverse chronological order for getRecent', () => {
    repo.create({ deviceCategory: 'nfc', deviceId: 'n1', eventType: 'read', severity: 'info' });
    repo.create({ deviceCategory: 'nfc', deviceId: 'n1', eventType: 'removed', severity: 'info' });

    const recent = repo.getRecent(10);
    expect(recent).toHaveLength(2);
    // Most recent first
    expect(recent[0]!.eventType).toBe('removed');
    expect(recent[1]!.eventType).toBe('read');
  });
});
```

### 8.3 apps/electron/src/main/db/repositories/UserEventRepo.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UserEventRepo } from './UserEventRepo';

describe('UserEventRepo', () => {
  let db: Database.Database;
  let repo: UserEventRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    const migration = readFileSync(join(__dirname, '../migrations/001_init.sql'), 'utf-8');
    db.exec(migration);
    repo = new UserEventRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create user events', () => {
    const id = repo.create({
      sessionId: 'sess-001',
      eventType: 'page_view',
      payload: { page: '/checkout' },
    });

    expect(id).toBeGreaterThan(0);
  });

  it('should track sync status', () => {
    const id1 = repo.create({ sessionId: 's1', eventType: 'tap', payload: { x: 100, y: 200 } });
    repo.create({ sessionId: 's1', eventType: 'tap', payload: { x: 300, y: 400 } });

    expect(repo.getUnsynced(10)).toHaveLength(2);

    repo.markSynced(id1);
    expect(repo.getUnsynced(10)).toHaveLength(1);
  });

  it('should handle null payload', () => {
    repo.create({ sessionId: 's1', eventType: 'idle' });

    const events = repo.getUnsynced(10);
    expect(events[0]!.payload).toBeNull();
  });
});
```

---

## Step 9: Set Up Git Hooks

### 9.1 Install Husky and lint-staged

```bash
# From repo root
pnpm add -Dw husky lint-staged
pnpm exec husky init
```

### 9.2 Configure .husky/pre-commit

```bash
#!/usr/bin/env sh
pnpm lint-staged
pnpm typecheck
```

### 9.3 Add lint-staged config to root package.json

Add to root `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,vue}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

---

## Step 10: VS Code Configuration

### 10.1 .vscode/launch.json

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/apps/electron",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "args": [".", "--remote-debugging-port=9222"],
      "env": {
        "NODE_ENV": "development",
        "KIOSKOS_LOG_LEVEL": "debug"
      },
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/apps/electron/out/**/*.js"]
    },
    {
      "name": "Debug Renderer (Chrome)",
      "type": "chrome",
      "request": "attach",
      "port": 9222,
      "webRoot": "${workspaceFolder}/apps/electron/src/renderer"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/apps/electron",
      "runtimeExecutable": "pnpm",
      "args": ["vitest", "run", "--reporter=verbose"],
      "console": "integratedTerminal"
    }
  ],
  "compounds": [
    {
      "name": "Debug Full App",
      "configurations": ["Debug Main Process", "Debug Renderer (Chrome)"]
    }
  ]
}
```

### 10.2 .vscode/settings.json

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/out": true,
    "**/dist": true,
    "**/coverage": true
  }
}
```

### 10.3 .vscode/extensions.json

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "vitest.explorer",
    "Vue.volar"
  ]
}
```

---

## Step 11: Final Verification Checklist

Run each of these from the repo root. Every one must pass before Phase 1 is considered complete.

```bash
# 1. Install all dependencies
pnpm install

# 2. TypeScript compiles cleanly across all packages
pnpm typecheck

# 3. Linting passes
pnpm lint

# 4. All unit tests pass
pnpm test

# 5. Coverage meets thresholds (80%)
pnpm --filter @kioskos/electron test:coverage

# 6. Electron app builds (produces out/ directory)
pnpm --filter @kioskos/electron build

# 7. Electron app launches in dev mode (manual check — Ctrl+C to stop)
pnpm --filter @kioskos/electron dev
```

### Expected state after Step 11

- Monorepo with `packages/shared-types` and `apps/electron`
- Electron launches in dev mode, shows loading screen, attempts to load web app URL
- BrowserView loads the configured URL (or offline fallback)
- SQLite database is created in userData with all tables
- IPC bridge is wired — web app can call `window.kioskAPI.*` methods
- All repository unit tests pass with >80% coverage
- Structured JSON logging to console + rotated files
- ESLint + Prettier enforced via pre-commit hooks
- VS Code debugging works for main process and tests

---

## What Comes Next

With this foundation in place, the project is ready for **Phase 2: Hardware Abstraction**. Create a new doc `docs/PHASE_2_HARDWARE.md` that covers:

- Abstract adapter base classes for each hardware category
- HardwareManager registry implementation
- Mock adapters for development
- First concrete adapter per category
- Wiring hardware events through IPC to the web app
- Serial/USB port helpers and configuration