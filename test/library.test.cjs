const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Library } = require("../electron/library.cjs");

async function setup(t) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "htmlviewer-unit-"),
  );
  t.after(() => {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith("htmlviewer-unit-"));
    return fs.rm(directory, { recursive: true, force: true });
  });
  const library = new Library(path.join(directory, "data"));
  await library.init();
  const source = path.join(directory, "한글 공부.html");
  const html =
    '<!doctype html><meta charset="utf-8"><style>body{color:red}</style><script>localStorage.a=1</script>공부';
  await fs.writeFile(source, html);
  return { library, source, html, directory };
}

test("원본을 삭제해도 복사본과 메타데이터가 재시작 후 유지된다", async (t) => {
  const { library, source, html } = await setup(t);
  const imported = await library.importFile(source);
  const item = imported.items[0];
  await fs.unlink(source);
  assert.equal(await fs.readFile(library.getFile(item.id), "utf8"), html);
  const restarted = new Library(library.root);
  await restarted.init();
  assert.deepEqual(restarted.snapshot(), imported);
  imported.items[0].title = "외부 변경";
  assert.equal(library.getItem(item.id).title, "한글 공부");
});

test("제목·카테고리 변경과 카테고리 삭제가 파일을 보존한다", async (t) => {
  const { library, source } = await setup(t);
  await library.saveCategory(null, "JavaScript");
  const categoryId = library.snapshot().categories[0].id;
  const {
    items: [item],
  } = await library.importFile(source, categoryId);
  await library.updateItem(item.id, "문제 풀이", categoryId);
  await library.saveCategory(categoryId, "알고리즘");
  await library.removeCategory(categoryId);
  assert.equal(library.getItem(item.id).title, "문제 풀이");
  assert.equal(library.getItem(item.id).categoryId, null);
  await fs.access(library.getFile(item.id));
  await assert.rejects(library.saveCategory(null, ""), /1~100/);
  await library.saveCategory(null, "영어");
  await assert.rejects(library.saveCategory(null, " 영어 "), /이미/);
});

test("연속 등록 요청을 직렬 처리해 항목 누락을 방지한다", async (t) => {
  const { library, source } = await setup(t);
  await Promise.all([
    library.importFile(source),
    library.importFile(source),
    library.saveCategory(null, "공부"),
  ]);
  assert.equal(library.snapshot().items.length, 2);
  assert.equal(
    new Set(library.snapshot().items.map((item) => item.id)).size,
    2,
  );
  assert.equal(library.snapshot().categories.length, 1);
  const saved = JSON.parse(await fs.readFile(library.file, "utf8"));
  assert.deepEqual(saved, library.snapshot());
});

test("삭제는 복사본만 지우고 원본을 유지한다", async (t) => {
  const { library, source } = await setup(t);
  const {
    items: [item],
  } = await library.importFile(source);
  const copied = library.getFile(item.id);
  const result = await library.removeItem(item.id);
  assert.equal(result.library.items.length, 0);
  assert.equal(result.cleanupWarning, null);
  await assert.rejects(fs.access(copied), { code: "ENOENT" });
  await fs.access(source);
  assert.throws(() => library.getFile("../library.json"), /잘못된/);
  await assert.rejects(
    library.importFile(path.join(path.dirname(source), "readme.txt")),
    /html/,
  );
});

test("메타데이터 저장에 실패하면 기존 데이터와 등록 파일을 보존한다", async (t) => {
  const { library, source } = await setup(t);
  const {
    items: [item],
  } = await library.importFile(source);
  const copied = library.getFile(item.id);
  const before = await fs.readFile(library.file, "utf8");
  library.save = async () => {
    throw new Error("디스크 쓰기 실패");
  };
  await assert.rejects(library.removeItem(item.id), /디스크/);
  await assert.rejects(library.importFile(source), /디스크/);
  await fs.access(copied);
  assert.equal(await fs.readFile(library.file, "utf8"), before);
  assert.equal(library.snapshot().items.length, 1);
  assert.deepEqual(await fs.readdir(library.files), [item.id]);
});

test("손상된 library.json을 덮어쓰지 않는다", async (t) => {
  const { library } = await setup(t);
  await fs.writeFile(library.file, "{broken");
  await assert.rejects(
    new Library(library.root).init(),
    /원본 데이터는 변경하지/,
  );
  assert.equal(await fs.readFile(library.file, "utf8"), "{broken");
});
