const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electronAPI',
    {
        selectFolder: () => ipcRenderer.invoke('select-folder'),
        getFile: (path) => ipcRenderer.invoke('get-file', path),
        saveFile: (data) => ipcRenderer.invoke('save-file', data)
    }
);