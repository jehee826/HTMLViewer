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
const viewers = new Map();
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
  manager.on("closed", () => {
    manager = null;
    for (const viewer of viewers.values()) viewer.close();
  });
  manager.loadURL(managerUrl).catch((error) => {
    dialog.showErrorBox("관리 화면을 열지 못했습니다", error.message);
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
  attachDocumentFind(viewer);
  restrictWindow(viewer, (url) => isStudyDocument(url, id));
  viewer.webContents.on("page-title-updated", (event) =>
    event.preventDefault(),
  );
  viewer.once("ready-to-show", () => viewer.show());
  viewer.on("closed", () => {
    if (viewers.get(id) === viewer) viewers.delete(id);
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
      throw new Error("관리 화면에서만 사용할 수 있습니다.");
    }
    try {
      return { ok: true, value: await action(...args) };
    } catch (error) {
      console.error(`[${channel}]`, error.message);
      return { ok: false, error: error.message };
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
      library = new Library(app.getPath("userData"));
      await library.init();
      denyPermissions(session.defaultSession);
      handle("library:list", () => library.snapshot());
      handle("library:import", async (categoryId) => {
        library.requireCategory(categoryId);
        const result = await dialog.showOpenDialog(manager, {
          title: "HTML 파일 등록",
          buttonLabel: "등록",
          properties: ["openFile"],
          filters: [{ name: "HTML 문서", extensions: ["html", "htm"] }],
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
            "HTML의 저장 데이터를 완전히 지우지 못했습니다.",
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
      dialog.showErrorBox("HTMLViewer 시작 오류", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}
