const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const project = path.resolve(__dirname, "..");

async function main() {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "htmlviewer-smoke-"),
  );
  const data = path.join(temporary, "data");
  const source = path.join(temporary, "첫공부.html");
  const second = path.join(temporary, "두번째.html");
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>공부 페이지</title>
    <style>h1{color:rgb(37,99,235)}</style><h1>공부 시작</h1><button id="answer">정답 보기</button>
    <p id="result">준비</p><script>document.querySelector('#result').textContent='JS 정상';
    document.querySelector('#answer').onclick=()=>document.querySelector('#result').textContent='정답: 42';</script></html>`;
  await fs.writeFile(source, html);
  await fs.writeFile(second, html);
  const env = {
    ...process.env,
    HTMLVIEWER_TEST_MODE: "1",
    HTMLVIEWER_TEST_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HTMLVIEWER_DEV_URL;
  let electronApp;
  let manager;
  const pageErrors = [];

  async function launch() {
    electronApp = await _electron.launch({
      executablePath: process.env.HTMLVIEWER_SMOKE_EXE || require("electron"),
      args: process.env.HTMLVIEWER_SMOKE_EXE ? [] : [project],
      env,
      timeout: 30000,
    });
    manager = await electronApp.firstWindow();
    manager.setDefaultTimeout(15000);
    manager.on("pageerror", (error) => pageErrors.push(error.message));
    await manager
      .getByRole("heading", { name: "내 HTML 보관함", exact: true })
      .waitFor();
  }

  async function importFile(file) {
    await electronApp.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selected],
      });
    }, file);
    await manager
      .getByRole("button", { name: "HTML 등록", exact: true })
      .first()
      .click();
  }

  async function openCard(title) {
    const [viewer] = await Promise.all([
      electronApp.waitForEvent("window"),
      manager
        .getByRole("button", { name: `${title} 열기`, exact: true })
        .click(),
    ]);
    viewer.setDefaultTimeout(15000);
    await viewer.getByRole("heading", { name: "공부 시작" }).waitFor();
    return viewer;
  }

  try {
    await launch();
    await manager
      .getByRole("heading", { name: "첫 HTML을 등록해 보세요" })
      .waitFor();
    await manager
      .getByRole("button", { name: "카테고리 관리", exact: true })
      .click();
    await manager
      .getByRole("textbox", { name: "카테고리 이름", exact: true })
      .fill("JavaScript");
    await manager.getByRole("button", { name: "추가", exact: true }).click();
    await manager
      .getByRole("button", { name: "JavaScript 카테고리 수정", exact: true })
      .waitFor();
    await manager.getByRole("button", { name: "닫기", exact: true }).click();
    await manager.getByRole("button", { name: /^JavaScript 0$/ }).click();
    await importFile(source);
    await manager
      .getByRole("button", { name: "첫공부 열기", exact: true })
      .waitFor();
    let saved = JSON.parse(
      await fs.readFile(path.join(data, "library.json"), "utf8"),
    );
    const firstId = saved.items[0].id;
    assert.equal(saved.items[0].categoryId, saved.categories[0].id);
    await fs.unlink(source);
    assert.equal(
      await fs.readFile(
        path.join(data, "files", firstId, "index.html"),
        "utf8",
      ),
      html,
    );

    let viewer = await openCard("첫공부");
    assert.equal(await viewer.locator("#result").textContent(), "JS 정상");
    assert.equal(
      await viewer
        .locator("h1")
        .evaluate((element) => getComputedStyle(element).color),
      "rgb(37, 99, 235)",
    );
    await viewer.getByRole("button", { name: "정답 보기" }).click();
    assert.equal(await viewer.locator("#result").textContent(), "정답: 42");
    assert.deepEqual(
      await viewer.evaluate(() => [
        typeof require,
        typeof process,
        typeof window.htmlViewer,
      ]),
      ["undefined", "undefined", "undefined"],
    );
    await viewer.evaluate(() => localStorage.setItem("answer", "A"));
    const blocked = await viewer.evaluate(async () => {
      const results = [];
      for (const url of [
        "https://example.invalid/test",
        "file:///C:/Windows/win.ini",
        "study://other/index.html",
        "/library.json",
      ]) {
        try {
          const response = await fetch(url);
          results.push(response.ok);
        } catch {
          results.push(false);
        }
      }
      return results;
    });
    assert.deepEqual(blocked, [false, false, false, false]);
    assert.equal(
      await viewer.evaluate(() => window.open("https://example.invalid")),
      null,
    );
    await viewer.evaluate(() => {
      location.href = "file:///C:/Windows/win.ini";
    });
    await viewer.getByRole("heading", { name: "공부 시작" }).waitFor();
    assert.match(viewer.url(), /^study:/);
    await manager
      .getByRole("button", { name: "첫공부 열기", exact: true })
      .click();
    assert.equal(electronApp.windows().length, 2);

    await manager
      .getByRole("button", { name: "첫공부 수정", exact: true })
      .click();
    await manager
      .getByRole("textbox", { name: "제목", exact: true })
      .fill("알고리즘 연습");
    await manager.getByRole("button", { name: "저장", exact: true }).click();
    await manager
      .getByRole("button", { name: "알고리즘 연습 열기", exact: true })
      .waitFor();
    assert.equal(await viewer.title(), "공부 페이지");
    assert.equal(
      await electronApp.evaluate(
        ({ BrowserWindow }, id) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().includes(id))
            .getTitle(),
        firstId,
      ),
      "알고리즘 연습",
    );
    await manager.getByRole("textbox", { name: "제목 검색" }).fill("없는 제목");
    await manager
      .getByRole("heading", { name: "검색 결과가 없습니다" })
      .waitFor();
    await manager.getByRole("textbox", { name: "제목 검색" }).fill("알고리즘");
    await manager
      .getByRole("button", { name: "알고리즘 연습 열기", exact: true })
      .waitFor();
    await viewer.close();
    assert.equal(electronApp.windows().length, 1);
    await manager.getByRole("textbox", { name: "제목 검색" }).fill("");
    await manager.getByRole("button", { name: /^전체 HTML 1$/ }).click();
    await importFile(second);
    await manager
      .getByRole("button", { name: "두번째 열기", exact: true })
      .waitFor();
    viewer = await openCard("두번째");
    assert.equal(
      await viewer.evaluate(() => localStorage.getItem("answer")),
      null,
    );
    await viewer.evaluate(() => localStorage.setItem("answer", "B"));
    await viewer.close();
    viewer = await openCard("알고리즘 연습");
    assert.equal(
      await viewer.evaluate(() => localStorage.getItem("answer")),
      "A",
    );
    await viewer.close();
    await electronApp.close();
    electronApp = null;

    await launch();
    await manager
      .getByRole("button", { name: "알고리즘 연습 열기", exact: true })
      .waitFor();
    viewer = await openCard("알고리즘 연습");
    assert.equal(
      await viewer.evaluate(() => localStorage.getItem("answer")),
      "A",
    );
    await viewer.close();
    await manager
      .getByRole("button", { name: "카테고리 관리", exact: true })
      .click();
    await manager
      .getByRole("button", { name: "JavaScript 카테고리 수정", exact: true })
      .click();
    await manager
      .getByRole("textbox", { name: "카테고리 이름", exact: true })
      .fill("문제풀이");
    await manager.getByRole("button", { name: "저장", exact: true }).click();
    await manager
      .getByRole("button", { name: "문제풀이 카테고리 삭제", exact: true })
      .click();
    await manager
      .getByRole("button", { name: "카테고리 삭제", exact: true })
      .click();
    await manager.getByRole("button", { name: "닫기", exact: true }).click();
    assert.equal(
      JSON.parse(
        await fs.readFile(path.join(data, "library.json"), "utf8"),
      ).items.find((item) => item.id === firstId).categoryId,
      null,
    );

    await manager
      .getByRole("button", { name: "알고리즘 연습 삭제", exact: true })
      .click();
    await manager.getByRole("button", { name: "취소", exact: true }).click();
    await manager
      .getByRole("button", { name: "알고리즘 연습 열기", exact: true })
      .waitFor();
    await manager
      .getByRole("button", { name: "알고리즘 연습 삭제", exact: true })
      .click();
    await manager.getByRole("button", { name: "삭제", exact: true }).click();
    await manager
      .getByRole("button", { name: "알고리즘 연습 열기", exact: true })
      .waitFor({ state: "detached" });
    await assert.rejects(fs.access(path.join(data, "files", firstId)), {
      code: "ENOENT",
    });
    assert.equal(
      await electronApp.evaluate(async ({ session, BrowserWindow }, id) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            session: session.fromPartition(`persist:study-${id}`),
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        try {
          await window.loadURL(`study://${id}/index.html`);
          return await window.webContents.executeJavaScript(
            "localStorage.getItem('answer')",
          );
        } finally {
          window.destroy();
        }
      }, firstId),
      null,
    );
    await assert.rejects(
      electronApp.evaluate(async ({ BrowserWindow }, id) => {
        const window = BrowserWindow.getAllWindows()[0];
        const response = await window.webContents.executeJavaScript(
          `window.htmlViewer.openItem(${JSON.stringify(id)})`,
        );
        if (!response.ok) throw new Error(response.error);
      }, firstId),
      /등록된 HTML/,
    );
    assert.deepEqual(pageErrors, []);
    saved = JSON.parse(
      await fs.readFile(path.join(data, "library.json"), "utf8"),
    );
    assert.equal(saved.items.length, 1);
    assert.equal(saved.categories.length, 0);
    console.log(
      "PASS: 등록 → 모아보기 → 클릭 실행, CSS/JS, 원본 삭제 후 보존, 제목/검색/카테고리, 격리, 저장 분리·재시작 유지, 삭제",
    );
  } finally {
    if (electronApp) await electronApp.close();
    assert.equal(path.dirname(temporary), os.tmpdir());
    assert.ok(path.basename(temporary).startsWith("htmlviewer-smoke-"));
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
