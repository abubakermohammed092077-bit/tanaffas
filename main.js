// main.js — Electron main process for Tanaffas.
//
// Based on the official SmartSpectra electron-quickstart sample:
// https://github.com/Presage-Security/SmartSpectra/tree/main/nodejs/samples/electron-quickstart
//
// Differences from the sample:
//   - The API key is read from .env here (never hard-coded), and handed to the
//     page on request through a tiny extra preload (config-preload.js).

'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session, ipcMain } = require('electron');

// --- API key from .env --------------------------------------------------------
// process.loadEnvFile() is built into Node, so no "dotenv" package is needed.
const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
    process.loadEnvFile(ENV_PATH);
}
const API_KEY = (process.env.SMARTSPECTRA_API_KEY || '').trim();
if (!API_KEY) {
    console.warn('[tanaffas] SMARTSPECTRA_API_KEY is empty. Copy .env.example to .env and paste your key.');
}

// --- Packaged-build native runtime path (copied from the official sample) ----
// Only matters once the app is packaged; skipped during `npm start`.
if (app.isPackaged && !process.env.SMARTSPECTRA_CAPI_PATH) {
    const LIB = {
        darwin: 'libsmartspectra_capi.dylib',
        win32:  'smartspectra_capi.dll',
        linux:  'libsmartspectra_capi.so',
    }[process.platform];
    if (LIB) {
        process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', LIB);
    }
}

const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');

const isOwnPage = (url) => typeof url === 'string' && url.startsWith('file://');

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 720,
        backgroundColor: '#0f1417',
        webPreferences: {
            // The SDK's own preload bridge, exactly as the docs show.
            preload: require.resolve('@smartspectra/node-sdk/preload'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    bindSmartSpectraIpc(win);

    // Only ever show our own bundled page (same as the official sample).
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    win.loadFile(path.join(__dirname, 'index.html'));
    if (process.env.SMARTSPECTRA_DIAGNOSTICS === '1') {
        win.webContents.openDevTools({ mode: 'detach' });
    }
}

app.whenReady().then(() => {
    // Camera-only permission, only for our local page (copied from the sample).
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
        const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
        const mediaTypes = (details && details.mediaTypes) || [];
        const cameraOnly = mediaTypes.length === 1 && mediaTypes[0] === 'video';
        callback(permission === 'media' && cameraOnly && isOwnPage(url));
    });

    // A second, tiny preload that lets the page ask for the API key.
    // (Electron runs session-registered preloads alongside the SDK's preload.)
    session.defaultSession.registerPreloadScript({
        type: 'frame',
        id: 'tanaffas-config',
        filePath: path.join(__dirname, 'config-preload.js'),
    });

    // Hand the key only to our own local page.
    ipcMain.handle('tanaffas:get-api-key', (event) => {
        const url = event.senderFrame ? event.senderFrame.url : '';
        return isOwnPage(url) ? API_KEY : '';
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
