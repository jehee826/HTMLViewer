const { _electron, expect } = require("playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Library } = require("../electron/library.cjs");

async function main() {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "htmlviewer-find-"),
  );
  const data = path.join(temporary, "data");
  const source = path.join(temporary, "검색 연습.html");
  await fs.writeFile(
    source,
    `<!doctype html><meta charset="utf-8">
    <h1>검색어 연습</h1><p>검색어 하나</p><p>검색어 둘</p>`,
  );
  const library = new Library(data);
  await library.init();
  const {
    items: [item],
  } = await library.importFile(source);
  const originalMetadata = await fs.readFile(library.file, "utf8");
  const originalHtml = await fs.readFile(library.getFile(item.id), "utf8");
  const env = {
    ...process.env,
    HTMLVIEWER_TEST_MODE: "1",
    HTMLVIEWER_TEST_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HTMLVIEWER_DEV_URL;
  let electronApp;

  async function barAction(action, argument) {
    return electronApp.evaluate(
      ({ webContents }, { source, argument }) => {
        const bar = webContents
          .getAllWebContents()
          .find((entry) => entry.getURL().endsWith("/find.html"));
        if (!bar) throw new Error("검색바를 찾을 수 없습니다.");
        return bar.executeJavaScript(
          `(${source})(${JSON.stringify(argument)})`,
        );
      },
      { source: action.toString(), argument },
    );
  }

  async function fill(text) {
    await barAction((value) => {
      const input = document.getElementById("query");
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, text);
  }

  const readCount = () =>
    barAction(() => document.getElementById("count").textContent);
  const expectCount = (text) => expect.poll(readCount).toBe(text);

  async function press(key, modifiers = []) {
    await electronApp.evaluate(
      ({ webContents }, { key, modifiers }) => {
        const bar = webContents
          .getAllWebContents()
          .find((entry) => entry.getURL().endsWith("/find.html"));
        bar.focus();
        bar.sendInputEvent({ type: "keyDown", keyCode: key, modifiers });
        bar.sendInputEvent({ type: "keyUp", keyCode: key, modifiers });
      },
      { key, modifiers },
    );
  }

  async function openFind() {
    await electronApp.evaluate(({ BrowserWindow }, id) => {
      const window = BrowserWindow.getAllWindows().find((entry) =>
        entry.webContents.getURL().includes(id),
      );
      window.focus();
      window.webContents.focus();
      window.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: "F",
        modifiers: ["control"],
      });
      window.webContents.sendInputEvent({
        type: "keyUp",
        keyCode: "F",
        modifiers: ["control"],
      });
    }, item.id);
  }

  try {
    electronApp = await _electron.launch({
      executablePath: process.env.HTMLVIEWER_SMOKE_EXE || require("electron"),
      args: process.env.HTMLVIEWER_SMOKE_EXE
        ? []
        : [path.resolve(__dirname, "..")],
      env,
      timeout: 30000,
    });
    const manager = await electronApp.firstWindow();
    const [viewer] = await Promise.all([
      electronApp.waitForEvent("window"),
      manager
        .getByRole("button", { name: "검색 연습 열기", exact: true })
        .click(),
    ]);
    await viewer.getByRole("heading", { name: "검색어 연습" }).waitFor();
    await viewer.evaluate(() =>
      localStorage.setItem("preserved", "기존 학습 데이터"),
    );
    await openFind();
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((entry) => entry.getURL().endsWith("/find.html")),
        ),
      )
      .toBe(true);
    await expect
      .poll(() => barAction(() => typeof window.documentFind))
      .toBe("object");
    await fill("검색어");
    await expectCount("1 / 3");
    await press("Enter");
    await expectCount("2 / 3");
    await press("Enter", ["shift"]);
    await expectCount("1 / 3");
    await barAction(() => document.getElementById("previous").click());
    await expectCount("3 / 3");
    await barAction(() => document.getElementById("next").click());
    await expectCount("1 / 3");
    await fill("일치하지 않는 단어");
    await expectCount("0 / 0");
    await fill("");
    await expectCount("");
    await fill("검색어");
    await expectCount("1 / 3");
    await press("Escape");
    assert.equal(
      await electronApp.evaluate(({ BrowserWindow }, id) => {
        const window = BrowserWindow.getAllWindows().find((entry) =>
          entry.webContents.getURL().includes(id),
        );
        return window.contentView.children
          .find((view) => view.webContents?.getURL().endsWith("/find.html"))
          .getVisible();
      }, item.id),
      false,
    );
    await openFind();
    await expect
      .poll(() => barAction(() => document.activeElement.id))
      .toBe("query");
    await expectCount("1 / 3");
    assert.deepEqual(
      await barAction(() => {
        const input = document.getElementById("query");
        return [input.selectionStart, input.selectionEnd];
      }),
      [0, 3],
    );
    assert.deepEqual(
      await viewer.evaluate(() => [
        typeof require,
        typeof window.htmlViewer,
        typeof window.documentFind,
      ]),
      ["undefined", "undefined", "undefined"],
    );
    assert.equal(
      await viewer.evaluate(() => localStorage.getItem("preserved")),
      "기존 학습 데이터",
    );
    assert.equal(await fs.readFile(library.file, "utf8"), originalMetadata);
    assert.equal(
      await fs.readFile(library.getFile(item.id), "utf8"),
      originalHtml,
    );
    await barAction(() => document.getElementById("close").click());
    await viewer.close();
    await expect
      .poll(() =>
        electronApp.evaluate(
          ({ webContents }) =>
            webContents
              .getAllWebContents()
              .filter((entry) => entry.getURL().endsWith("/find.html")).length,
        ),
      )
      .toBe(0);
    assert.equal(electronApp.windows().length, 1);
    console.log(
      "PASS: Ctrl+F, 한글 검색·개수, 다음/이전·순환, 검색 실패·초기화, Esc·다시 열기, API 격리, 기존 파일·데이터 보존, 검색바 정리",
    );
  } finally {
    if (electronApp) await electronApp.close();
    assert.equal(path.dirname(temporary), os.tmpdir());
    assert.ok(path.basename(temporary).startsWith("htmlviewer-find-"));
    await fs.rm(temporary, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 250,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
