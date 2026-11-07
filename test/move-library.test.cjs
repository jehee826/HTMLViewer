const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Library } = require("../electron/library.cjs");
const { Preferences } = require("../electron/preferences.cjs");
const { prepareLibraryMove } = require("../electron/move-library.cjs");

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "htmlviewer-move-"));
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith("htmlviewer-move-"));
    return fs.rm(root, { recursive: true, force: true });
  });
  const source = path.join(root, "app-data");
  const destination = path.join(root, "my-library");
  await fs.mkdir(destination);
  const library = new Library(source);
  await library.init();
  const original = path.join(root, "원본.html");
  await fs.writeFile(original, "<meta charset=utf-8><h1>학습 자료</h1>");
  const {
    items: [item],
  } = await library.importFile(original);
  const preferences = new Preferences(source);
  await preferences.update({ language: "en" });
  return { root, source, destination, library, original, item, preferences };
}

test("복사 검증 후 설정을 전환하고 앱이 관리하는 이전 파일만 정리한다", async (t) => {
  const { source, destination, library, original, item, preferences } =
    await setup(t);
  const before = library.snapshot();
  await fs.writeFile(path.join(source, "keep.txt"), "보존");
  const move = await prepareLibraryMove(library, destination, source);
  assert.deepEqual(move.library.snapshot(), before);
  await fs.access(library.getFile(item.id));
  await preferences.update({ libraryPath: move.library.root });
  assert.equal(await move.cleanupSource(), true);
  await assert.rejects(fs.access(library.file), { code: "ENOENT" });
  await assert.rejects(fs.access(library.getFile(item.id)), { code: "ENOENT" });
  assert.equal(
    await fs.readFile(move.library.getFile(item.id), "utf8"),
    await fs.readFile(original, "utf8"),
  );
  assert.equal(
    await fs.readFile(path.join(source, "keep.txt"), "utf8"),
    "보존",
  );
  assert.equal((await new Preferences(source).init()).libraryPath, destination);
  const back = await prepareLibraryMove(move.library, source, source);
  await preferences.update({ libraryPath: back.library.root });
  assert.equal(await back.cleanupSource(), true);
  assert.deepEqual(back.library.snapshot(), before);
});

test("설정 전환 실패 시 복사본만 정리하고 기존 보관함을 보존한다", async (t) => {
  const { source, destination, library, item, preferences } = await setup(t);
  const before = await fs.readFile(library.file, "utf8");
  const move = await prepareLibraryMove(library, destination, source);
  await assert.rejects(
    preferences.update({ language: "unsupported" }),
    /지원하지/,
  );
  assert.equal(await move.cancel(), true);
  assert.equal(await fs.readFile(library.file, "utf8"), before);
  await fs.access(library.getFile(item.id));
  assert.deepEqual(await fs.readdir(destination), []);
});

test("기존 자료가 있는 폴더와 중첩 경로를 거부한다", async (t) => {
  const { source, destination, library } = await setup(t);
  await fs.writeFile(path.join(destination, "사용자파일.txt"), "유지");
  await assert.rejects(
    prepareLibraryMove(library, destination, source),
    /비어 있지/,
  );
  await assert.rejects(prepareLibraryMove(library, source, source), /겹치는/);
  const inside = path.join(source, "nested");
  await fs.mkdir(inside);
  await assert.rejects(prepareLibraryMove(library, inside, source), /겹치는/);
  assert.equal(
    await fs.readFile(path.join(destination, "사용자파일.txt"), "utf8"),
    "유지",
  );
});

test("이동 준비 후 원본이 바뀌면 이전 자료를 지우지 않는다", async (t) => {
  const { source, destination, library, item } = await setup(t);
  const move = await prepareLibraryMove(library, destination, source);
  await fs.writeFile(library.getFile(item.id), "사용자가 변경한 내용");
  assert.equal(await move.cleanupSource(), false);
  assert.equal(
    await fs.readFile(library.getFile(item.id), "utf8"),
    "사용자가 변경한 내용",
  );
  await fs.access(library.file);
});
