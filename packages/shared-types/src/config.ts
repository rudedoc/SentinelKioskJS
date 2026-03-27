export interface KioskConfig {
  kioskId: string;
  environment: 'dev' | 'staging' | 'prod';

  webApp: {
    url: string;
    fallbackPath: string;
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
  adapter: string;
  config: Record<string, unknown>;
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
