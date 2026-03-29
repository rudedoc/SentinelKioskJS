import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { KioskConfig, DEFAULT_DEV_CONFIG } from '@kioskos/shared-types';
import { createModuleLogger } from './logger';

const log = createModuleLogger('config');

/**
 * Load kiosk config from (first match wins):
 * 1. KIOSKOS_CONFIG_PATH env var
 * 2. /etc/kioskos/config.json (production)
 * 3. <userData>/config.json (per-user)
 * 4. <projectRoot>/config.json (local dev — gitignored)
 * 5. DEFAULT_DEV_CONFIG (development fallback)
 */
export function loadConfig(): KioskConfig {
  const candidates = [
    process.env.KIOSKOS_CONFIG_PATH,
    '/etc/kioskos/config.json',
    join(app.getPath('userData'), 'config.json'),
    join(app.getAppPath(), '..', '..', 'config.json'),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<KioskConfig>;
        const config = mergeConfig(DEFAULT_DEV_CONFIG, parsed);
        log.info('Config loaded', { path, kioskId: config.kioskId });
        return config;
      } catch (err) {
        log.warn('Failed to load config file', { path, error: String(err) });
      }
    }
  }

  log.info('No config file found, using default dev config');
  return DEFAULT_DEV_CONFIG;
}

/**
 * Deep-merge a partial config over the defaults.
 * Only overrides fields that are present in the override.
 */
function mergeConfig(base: KioskConfig, override: Partial<KioskConfig>): KioskConfig {
  return {
    ...base,
    ...override,
    webApp: { ...base.webApp, ...override.webApp },
    hardware: { ...base.hardware, ...override.hardware },
    network: {
      ...base.network,
      ...override.network,
      vpn: { ...base.network.vpn, ...override.network?.vpn },
      mqtt: { ...base.network.mqtt, ...override.network?.mqtt },
    },
    telemetry: { ...base.telemetry, ...override.telemetry },
    update: { ...base.update, ...override.update },
    admin: { ...base.admin, ...override.admin },
    security: { ...base.security, ...override.security },
  };
}
