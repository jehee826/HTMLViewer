const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
  Menu,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Library } = require("./library.cjs");
const { attachDocumentFind } = require("./document-find.cjs");
const { Preferences } = require("./preferences.cjs");
const { translate, translatedError, errorMessage } = require("./i18n.cjs");
const { prepareLibraryMove } = require("./move-library.cjs");
const {
  isStudyDocument,
  isStudyResource,
  STUDY_CSP,
} = require("./security.cjs");

app.setName("HTMLViewer");
app.setAppUserModelId("io.github.jehee826.htmlviewer");
if (
  process.env.HTMLVIEWER_TEST_MODE === "1" &&
  process.env.HTMLVIEWER_TEST_DATA
) {
  app.setPath("userData", process.env.HTMLVIEWER_TEST_DATA);
}
const preferences = new Preferences(app.getPath("userData"));
const t = (key, values) => translate(preferences.data.language, key, values);
const devUrl =
  !app.isPackaged && process.env.HTMLVIEWER_DEV_URL === "http://127.0.0.1:5173"
    ? process.env.HTMLVIEWER_DEV_URL
    : null;
const managerUrl =
  devUrl || pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
protocol.registerSchemesAsPrivileged([
  {
    scheme: "study",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let manager;
let library;
let selectedLibraryFolder = null;
let movingLibrary = false;
const viewers = new Map();
const documentFind = new Map();
const configuredSessions = new Set();

function restrictWindow(window, allowedNavigation) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!allowedNavigation(url)) event.preventDefault();
  });
  window.webContents.on("will-redirect", (event, url) => {
    if (!allowedNavigation(url)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
}

function denyPermissions(targetSession) {
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  targetSession.on("will-download", (event) => event.preventDefault());
}

function createManager() {
  manager = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    title: "HTMLViewer",
    backgroundColor: "#f7f8fa",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  });
  restrictWindow(
    manager,
    (url) => url === managerUrl || url === `${managerUrl}/`,
  );
  manager.once("ready-to-show", () => manager.show());
  manager.on("close", (event) => {
    if (movingLibrary) event.preventDefault();
  });
  manager.on("closed", () => {
    manager = null;
    for (const viewer of viewers.values()) viewer.close();
  });
  manager.loadURL(managerUrl).catch((error) => {
    dialog.showErrorBox(
      t("managerLoadError"),
      errorMessage(error, preferences.data.language),
    );
    app.quit();
  });
}

async function openItem(id) {
  const item = library.getItem(id);
  await fs.access(library.getFile(id));
  const existing = viewers.get(id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }
  const viewerSession = session.fromPartition(`persist:study-${id}`);
  if (!configuredSessions.has(id)) {
    denyPermissions(viewerSession);
    viewerSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !isStudyResource(details.url, id) });
    });
    viewerSession.protocol.handle("study", async (request) => {
      if (
        !isStudyDocument(request.url, id) ||
        !["GET", "HEAD"].includes(request.method)
      ) {
        return new Response("Not found", { status: 404 });
      }
      try {
        const bytes = await fs.readFile(library.getFile(id));
        return new Response(request.method === "HEAD" ? null : bytes, {
          headers: {
            "Content-Type": "text/html",
            "Content-Security-Policy": STUDY_CSP,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
    configuredSessions.add(id);
  }
  const viewer = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 500,
    minHeight: 400,
    title: item.title,
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      session: viewerSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      safeDialogs: true,
      navigateOnDragDrop: false,
    },
  });
  viewers.set(id, viewer);
  documentFind.set(
    id,
    attachDocumentFind(viewer, () => preferences.data.language),
  );
  restrictWindow(viewer, (url) => isStudyDocument(url, id));
  viewer.webContents.on("page-title-updated", (event) =>
    event.preventDefault(),
  );
  viewer.once("ready-to-show", () => viewer.show());
  viewer.on("closed", () => {
    if (viewers.get(id) === viewer) {
      viewers.delete(id);
      documentFind.delete(id);
    }
  });
  try {
    await viewer.loadURL(`study://${id}/index.html`);
  } catch (error) {
    viewer.close();
    throw error;
  }
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (
      !manager ||
      event.sender !== manager.webContents ||
      event.senderFrame !== manager.webContents.mainFrame
    ) {
      throw new Error(t("managerOnly"));
    }
    try {
      if (movingLibrary && channel !== "settings:get")
        throw translatedError("storageBusy");
      return { ok: true, value: await action(...args) };
    } catch (error) {
      console.error(`[${channel}]`, error.message);
      return {
        ok: false,
        error: errorMessage(error, preferences.data.language),
      };
    }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (manager) {
      if (manager.isMinimized()) manager.restore();
      manager.show();
      manager.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      await preferences.init();
      if (preferences.data.libraryPath) {
        try {
          await fs.access(
            path.join(preferences.data.libraryPath, "library.json"),
          );
        } catch {
          throw translatedError("storageUnavailable", {
            path: preferences.data.libraryPath,
          });
        }
      }
      library = new Library(
        preferences.data.libraryPath ?? preferences.root,
        () => preferences.data.language,
      );
      await library.init();
      denyPermissions(session.defaultSession);
      const getSettings = () => ({
        ...preferences.snapshot(),
        libraryPath: library.root,
        defaultLibraryPath: preferences.root,
      });
      handle("settings:get", getSettings);
      handle("settings:language", async (language) => {
        await preferences.update({ language });
        for (const refresh of documentFind.values()) refresh();
        return getSettings();
      });
      handle("settings:choose-folder", async () => {
        selectedLibraryFolder = null;
        const result = await dialog.showOpenDialog(manager, {
          title: t("storageChoose"),
          buttonLabel: t("select"),
          defaultPath: library.root,
          properties: ["openDirectory"],
        });
        if (result.canceled || !result.filePaths.length) return null;
        selectedLibraryFolder = result.filePaths[0];
        return selectedLibraryFolder;
      });
      handle("settings:move-library", async () => {
        if (!selectedLibraryFolder) throw translatedError("storagePickFirst");
        const destination = selectedLibraryFolder;
        selectedLibraryFolder = null;
        movingLibrary = true;
        try {
          const move = await prepareLibraryMove(
            library,
            destination,
            preferences.root,
          );
          try {
            const defaultRoot = await fs.realpath(preferences.root);
            await preferences.update({
              libraryPath:
                move.library.root === defaultRoot ? null : move.library.root,
            });
          } catch (error) {
            if (!(await move.cancel()))
              throw translatedError(
                "storageRollbackFailed",
                { path: move.library.root },
                error,
              );
            throw error;
          }
          library = move.library;
          const complete = await move.cleanupSource();
          return {
            settings: getSettings(),
            library: library.snapshot(),
            cleanupWarning: complete ? null : t("storageOldCleanupWarning"),
          };
        } finally {
          movingLibrary = false;
        }
      });
      handle("settings:open-app-data", async () => {
        const error = await shell.openPath(preferences.root);
        if (error) throw new Error(error);
      });
      handle("library:list", () => library.snapshot());
      handle("library:import", async (categoryId) => {
        library.requireCategory(categoryId);
        const result = await dialog.showOpenDialog(manager, {
          title: t("importDialog"),
          buttonLabel: t("importButton"),
          properties: ["openFile"],
          filters: [{ name: t("htmlDocument"), extensions: ["html", "htm"] }],
        });
        if (result.canceled || !result.filePaths.length) return null;
        return library.importFile(result.filePaths[0], categoryId);
      });
      handle("library:update", async (id, title, categoryId) => {
        const result = await library.updateItem(id, title, categoryId);
        viewers.get(id)?.setTitle(library.getItem(id).title);
        return result;
      });
      handle("library:remove", async (id) => {
        library.getItem(id);
        viewers.get(id)?.close();
        const result = await library.removeItem(id);
        try {
          await session.fromPartition(`persist:study-${id}`).clearStorageData();
        } catch {
          result.cleanupWarning = [
            result.cleanupWarning,
            t("storageCleanupWarning"),
          ]
            .filter(Boolean)
            .join(" ");
        }
        return result;
      });
      handle("library:open", openItem);
      handle("category:save", (id, name) => library.saveCategory(id, name));
      handle("category:remove", (id) => library.removeCategory(id));
      handle("library:folder", async () => {
        const error = await shell.openPath(library.root);
        if (error) throw new Error(error);
      });
      createManager();
    })
    .catch((error) => {
      dialog.showErrorBox(
        t("startError"),
        errorMessage(error, preferences.data.language),
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}
