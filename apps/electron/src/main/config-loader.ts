import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { KioskConfig, DEFAULT_DEV_CONFIG } from '@kioskos/shared-types';
import { createModuleLogger } from './logger';

const log = createModuleLogger('config');

/**
 * Load kiosk config from:
 * 1. KIOSKOS_CONFIG_PATH env var
 * 2. /etc/kioskos/config.json (production)
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
