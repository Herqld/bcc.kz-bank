'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('coddyDesktop', {
    isDesktop: true, platform: process.platform,
    getConfig: () => ipcRenderer.invoke('cfg:get'),
    setServer: (url) => ipcRenderer.invoke('cfg:set', url),
    retry: () => ipcRenderer.invoke('retry'),
    checkServer: () => ipcRenderer.invoke('server:check')
});
