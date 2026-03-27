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
