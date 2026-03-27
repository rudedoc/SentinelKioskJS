import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { createMainWindow, createWebAppView, getMainWindow } from './window';
import { loadConfig } from './config-loader';
import { createModuleLogger } from './logger';
import { initializeDatabase, closeDatabase } from './db/database';
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
  closeDatabase();
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
