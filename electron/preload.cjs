const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  readLocalImageAsDataUrl: (filePath) =>
    ipcRenderer.invoke('read-local-image-as-data-url', filePath),
  saveImageFile: (image) => ipcRenderer.invoke('save-image-file', image),
  openMarkdownFile: () => ipcRenderer.invoke('open-markdown-file'),
  writeMarkdownFile: (document) =>
    ipcRenderer.invoke('write-markdown-file', document),
  saveMarkdownFile: (document) =>
    ipcRenderer.invoke('save-markdown-file', document),
  deleteMarkdownFile: (document) =>
    ipcRenderer.invoke('delete-markdown-file', document),
  saveLatestDocument: (document) =>
    ipcRenderer.invoke('save-latest-document', document),
  loadLatestDocument: () => ipcRenderer.invoke('load-latest-document'),
  loadRecentDocuments: () => ipcRenderer.invoke('load-recent-documents'),
  loadRecentDocument: (filename) =>
    ipcRenderer.invoke('load-recent-document', filename),
})
