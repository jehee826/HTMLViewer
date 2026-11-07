const { WebContentsView, ipcMain } = require("electron");
const path = require("node:path");

function attachDocumentFind(window) {
  const contents = window.webContents;
  let bar;
  let ready = false;
  let visible = false;
  let requestId = 0;

  function send(channel, value) {
    if (ready && !bar.webContents.isDestroyed()) {
      bar.webContents.send(channel, value);
    }
  }

  function position() {
    if (!bar) return;
    const [contentWidth] = window.getContentSize();
    const width = Math.min(420, contentWidth - 24);
    bar.setBounds({ x: contentWidth - width - 12, y: 12, width, height: 60 });
  }

  function hide() {
    visible = false;
    requestId = 0;
    bar?.setVisible(false);
    if (!contents.isDestroyed()) {
      contents.stopFindInPage("clearSelection");
      contents.focus();
    }
  }

  function focus() {
    if (!visible || !ready) return;
    bar.setVisible(true);
    bar.webContents.focus();
    send("document-find:focus");
  }

  function show() {
    visible = true;
    if (!bar) {
      // 검색 API는 신뢰하는 검색바에만 노출하고 사용자 HTML과 분리한다.
      bar = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, "find-preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webviewTag: false,
        },
      });
      bar.setVisible(false);
      bar.setBackgroundColor("#00000000");
      window.contentView.addChildView(bar);
      position();
      bar.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      bar.webContents.on("will-navigate", (event) => event.preventDefault());
      bar.webContents.on("will-redirect", (event) => event.preventDefault());
      bar.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      bar.webContents.on("before-input-event", onShortcut);
      bar.webContents.once("did-finish-load", () => {
        ready = true;
        focus();
      });
      bar.webContents
        .loadFile(path.join(__dirname, "find.html"))
        .catch((error) => {
          console.error("[document-find]", error.message);
          hide();
        });
    }
    focus();
  }

  function onShortcut(event, input) {
    if (input.type !== "keyDown") return;
    if (
      (input.control || input.meta) &&
      !input.alt &&
      input.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      show();
    } else if (visible && input.key === "Escape") {
      event.preventDefault();
      hide();
    }
  }

  function onCommand(event, command) {
    if (
      !bar ||
      !visible ||
      event.sender !== bar.webContents ||
      event.senderFrame !== bar.webContents.mainFrame ||
      !command
    )
      return;
    if (command.type === "close") {
      hide();
    } else if (
      command.type === "search" &&
      typeof command.text === "string" &&
      command.text.length <= 1000 &&
      typeof command.forward === "boolean" &&
      typeof command.next === "boolean"
    ) {
      if (!command.text) {
        requestId = 0;
        contents.stopFindInPage("clearSelection");
        send("document-find:result", { matches: 0, activeMatchOrdinal: 0 });
        return;
      }
      requestId = contents.findInPage(command.text, {
        forward: command.forward,
        findNext: !command.next || requestId === 0,
      });
    }
  }

  function onResult(_event, result) {
    if (visible && result.requestId === requestId && result.finalUpdate) {
      send("document-find:result", {
        matches: result.matches,
        activeMatchOrdinal: result.activeMatchOrdinal,
      });
    }
  }

  contents.on("before-input-event", onShortcut);
  contents.on("found-in-page", onResult);
  contents.on("did-navigate", hide);
  window.on("resize", position);
  ipcMain.on("document-find:command", onCommand);
  window.once("closed", () => {
    ipcMain.removeListener("document-find:command", onCommand);
    contents.removeListener("before-input-event", onShortcut);
    contents.removeListener("found-in-page", onResult);
    contents.removeListener("did-navigate", hide);
    if (bar && !bar.webContents.isDestroyed()) bar.webContents.close();
  });
}

module.exports = { attachDocumentFind };
