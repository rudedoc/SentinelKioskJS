import { BrowserWindow, BrowserView, session } from 'electron';
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
    kiosk: !isDev,
    fullscreen: !isDev,
    frame: isDev,
    show: false,
    backgroundColor: '#ffffff',
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
            " script-src 'self' 'unsafe-inline';" +
            " style-src 'self' 'unsafe-inline';" +
            " connect-src 'self' ws://localhost:*;" +
            " img-src 'self' data:;",
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
    const isAllowed = allowed.some((origin: string) => url.startsWith(origin));
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

  // Load the webview shell
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

  // Use a separate session for the web app so the kiosk shell's
  // restrictive CSP doesn't block the web app's external resources
  const webAppSession = session.fromPartition('persist:webapp');

  webAppView = new BrowserView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: is.dev || !config.security.disableDevTools,
      session: webAppSession,
    },
  });

  webAppView.webContents.setBackgroundThrottling(false);
  mainWindow.setBrowserView(webAppView);

  // Size the BrowserView to fill the window
  const bounds = mainWindow.getContentBounds();
  webAppView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  webAppView.setAutoResize({ width: true, height: true });

  // Load the web app URL
  log.info('Loading web app', { url: config.webApp.url });
  webAppView.webContents.loadURL(config.webApp.url).catch((err) => {
    log.error('Failed to load web app, loading fallback', { error: String(err) });
    webAppView?.webContents.loadFile(join(__dirname, '../renderer/webview/offline.html'));
  });

  // Once the web app loads, clear the loading screen behind it
  webAppView.webContents.on('did-finish-load', () => {
    log.info('Web app loaded, clearing loading screen');
    mainWindow?.webContents.executeJavaScript('document.body.innerHTML = "";');
    mainWindow?.setBackgroundColor('#ffffff');
  });

  return webAppView;
}
