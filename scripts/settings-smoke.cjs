const { _electron, expect } = require("playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Library } = require("../electron/library.cjs");

async function main() {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "htmlviewer-settings-"),
  );
  const data = path.join(temporary, "app-data");
  const destination = path.join(temporary, "moved-library");
  const occupied = path.join(temporary, "occupied");
  const original = path.join(temporary, "나의 학습자료.html");
  await fs.mkdir(destination);
  await fs.mkdir(occupied);
  await fs.writeFile(path.join(occupied, "keep.txt"), "보존");
  const html =
    '<!doctype html><meta charset="utf-8"><h1>검색어 원문</h1><p>검색어 하나</p><p>검색어 둘</p>';
  await fs.writeFile(original, html);
  const library = new Library(data);
  await library.init();
  await library.saveCategory(null, "알고리즘");
  const {
    items: [item],
  } = await library.importFile(original, library.snapshot().categories[0].id);
  const originalMetadata = await fs.readFile(library.file, "utf8");
  const env = {
    ...process.env,
    HTMLVIEWER_TEST_MODE: "1",
    HTMLVIEWER_TEST_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HTMLVIEWER_DEV_URL;
  let app;
  let manager;

  async function launch() {
    app = await _electron.launch({
      executablePath: process.env.HTMLVIEWER_SMOKE_EXE || require("electron"),
      args: process.env.HTMLVIEWER_SMOKE_EXE
        ? []
        : [path.resolve(__dirname, "..")],
      env,
      timeout: 30000,
    });
    manager = await app.firstWindow();
  }

  async function openViewer(name) {
    const [viewer] = await Promise.all([
      app.waitForEvent("window"),
      manager.getByRole("button", { name, exact: true }).click(),
    ]);
    await viewer.getByRole("heading", { name: "검색어 원문" }).waitFor();
    return viewer;
  }

  async function openFind() {
    await app.evaluate(({ BrowserWindow }, id) => {
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

  async function findLocale() {
    return app.evaluate(async ({ webContents }) => {
      const bar = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().endsWith("/find.html"));
      if (!bar) return null;
      return bar.executeJavaScript(
        "({ language: document.documentElement.lang, placeholder: document.getElementById('query').placeholder })",
      );
    });
  }

  async function chooseFolder(folder) {
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selected],
      });
    }, folder);
    await manager
      .getByRole("button", { name: "Change folder", exact: true })
      .click();
    await manager
      .getByRole("dialog", { name: "Move library", exact: true })
      .waitFor();
    await manager.getByRole("button", { name: "Move", exact: true }).click();
  }

  try {
    await launch();
    let viewer = await openViewer("나의 학습자료 열기");
    await viewer.evaluate(() => localStorage.setItem("progress", "기존 답안"));
    await openFind();
    await expect
      .poll(findLocale)
      .toEqual({ language: "ko", placeholder: "문서에서 찾기" });
    await manager.getByRole("button", { name: "설정", exact: true }).click();
    await manager
      .getByRole("combobox", { name: "언어 / Language", exact: true })
      .selectOption("en");
    await manager
      .getByRole("dialog", { name: "Settings", exact: true })
      .waitFor();
    await expect(
      manager.getByRole("heading", { name: "My HTML Library", exact: true }),
    ).toBeVisible();
    await expect
      .poll(findLocale)
      .toEqual({ language: "en", placeholder: "Find in document" });
    assert.equal(await manager.locator("html").getAttribute("lang"), "en");
    assert.equal(await viewer.locator("h1").textContent(), "검색어 원문");
    await manager.getByRole("button", { name: "Close", exact: true }).click();

    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async (_window, options) => {
        globalThis.testImportDialog = options;
        return { canceled: true, filePaths: [] };
      };
    });
    await manager
      .getByRole("button", { name: "Add HTML", exact: true })
      .click();
    await expect
      .poll(() => app.evaluate(() => globalThis.testImportDialog?.title))
      .toBe("Add an HTML file");
    assert.equal(
      await app.evaluate(() => globalThis.testImportDialog.buttonLabel),
      "Add",
    );
    const invalidLanguage = await manager.evaluate(() =>
      window.htmlViewer.setLanguage("unsupported"),
    );
    assert.equal(invalidLanguage.ok, false);
    assert.equal(invalidLanguage.error, "This language is not supported.");

    await manager
      .getByRole("button", { name: "Manage categories", exact: true })
      .click();
    await manager
      .getByRole("textbox", { name: "Category name", exact: true })
      .fill("알고리즘");
    await manager.getByRole("button", { name: "Add", exact: true }).click();
    await expect(manager.getByRole("alert")).toContainText(
      "A category with this name already exists.",
    );
    await manager.getByRole("button", { name: "Close", exact: true }).click();

    await manager
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await chooseFolder(occupied);
    await expect(manager.getByRole("alert")).toContainText(
      "This folder is not empty",
    );
    assert.equal(await fs.readFile(library.file, "utf8"), originalMetadata);
    assert.equal(
      await fs.readFile(path.join(occupied, "keep.txt"), "utf8"),
      "보존",
    );
    await manager.getByRole("button", { name: "Cancel", exact: true }).click();
    await chooseFolder(destination);
    await manager
      .getByRole("dialog", { name: "Settings", exact: true })
      .waitFor();
    await expect(manager.getByRole("status")).toContainText(
      "Your library has been moved",
    );
    assert.equal(
      await fs.readFile(path.join(destination, "library.json"), "utf8"),
      originalMetadata,
    );
    assert.equal(
      await fs.readFile(
        path.join(destination, "files", item.id, "index.html"),
        "utf8",
      ),
      html,
    );
    await assert.rejects(fs.access(library.file), { code: "ENOENT" });
    await assert.rejects(fs.access(library.getFile(item.id)), {
      code: "ENOENT",
    });
    await fs.access(original);
    assert.equal(
      await viewer.evaluate(() => localStorage.getItem("progress")),
      "기존 답안",
    );
    await viewer.reload();
    await viewer.getByRole("heading", { name: "검색어 원문" }).waitFor();
    assert.deepEqual(
      await viewer.evaluate(() => [typeof require, typeof window.htmlViewer]),
      ["undefined", "undefined"],
    );
    await app.close();
    app = null;

    await launch();
    await manager
      .getByRole("heading", { name: "My HTML Library", exact: true })
      .waitFor();
    viewer = await openViewer("Open 나의 학습자료");
    assert.equal(
      await viewer.evaluate(() => localStorage.getItem("progress")),
      "기존 답안",
    );
    await openFind();
    await expect
      .poll(findLocale)
      .toEqual({ language: "en", placeholder: "Find in document" });
    await manager
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await chooseFolder(data);
    await manager
      .getByRole("dialog", { name: "Settings", exact: true })
      .waitFor();
    await manager
      .getByRole("combobox", { name: "언어 / Language", exact: true })
      .selectOption("ko");
    await manager.getByRole("dialog", { name: "설정", exact: true }).waitFor();
    await expect
      .poll(findLocale)
      .toEqual({ language: "ko", placeholder: "문서에서 찾기" });
    assert.equal(
      await fs.readFile(path.join(data, "library.json"), "utf8"),
      originalMetadata,
    );
    await assert.rejects(fs.access(path.join(destination, "library.json")), {
      code: "ENOENT",
    });
    const saved = JSON.parse(
      await fs.readFile(path.join(data, "preferences.json"), "utf8"),
    );
    assert.equal(saved.language, "ko");
    assert.equal(saved.libraryPath, null);
    assert.equal(await fs.readFile(original, "utf8"), html);
    console.log(
      "PASS: 설정·한영 전환, 검색바 즉시 전환, 영어 오류·파일 선택 안내, 비어 있지 않은 폴더 보호, 보관함 이동·기본 위치 복귀, 재시작 복원, 원본·학습 기록·격리 유지",
    );
  } finally {
    if (app) await app.close();
    assert.equal(path.dirname(temporary), os.tmpdir());
    assert.ok(path.basename(temporary).startsWith("htmlviewer-settings-"));
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
