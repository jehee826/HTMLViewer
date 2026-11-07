const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("documentFind", {
  search: (text, forward = true, next = false) =>
    ipcRenderer.send("document-find:command", {
      type: "search",
      text,
      forward,
      next,
    }),
  close: () => ipcRenderer.send("document-find:command", { type: "close" }),
  onFocus: (callback) =>
    ipcRenderer.on("document-find:focus", () => callback()),
  onResult: (callback) =>
    ipcRenderer.on("document-find:result", (_event, result) =>
      callback(result),
    ),
});
