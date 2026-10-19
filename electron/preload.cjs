const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("htmlViewer", {
  getLibrary: () => ipcRenderer.invoke("library:list"),
  importFile: (categoryId) => ipcRenderer.invoke("library:import", categoryId),
  updateItem: (id, title, categoryId) =>
    ipcRenderer.invoke("library:update", id, title, categoryId),
  removeItem: (id) => ipcRenderer.invoke("library:remove", id),
  openItem: (id) => ipcRenderer.invoke("library:open", id),
  saveCategory: (id, name) => ipcRenderer.invoke("category:save", id, name),
  removeCategory: (id) => ipcRenderer.invoke("category:remove", id),
  openDataFolder: () => ipcRenderer.invoke("library:folder"),
});
