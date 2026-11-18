// config-preload.js — exposes one function to the page: getApiKey().
// The key itself lives only in .env and in main-process memory; the page asks
// for it right before starting the SDK.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tanaffasConfig', {
    getApiKey: () => ipcRenderer.invoke('tanaffas:get-api-key'),
});
