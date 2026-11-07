const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("htmlViewer", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setLanguage: (language) => ipcRenderer.invoke("settings:language", language),
  chooseLibraryFolder: () => ipcRenderer.invoke("settings:choose-folder"),
  moveLibrary: () => ipcRenderer.invoke("settings:move-library"),
  openAppDataFolder: () => ipcRenderer.invoke("settings:open-app-data"),
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
