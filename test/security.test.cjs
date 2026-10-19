const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  isStudyDocument,
  isStudyResource,
} = require("../electron/security.cjs");

test("실행 창은 해당 HTML과 내장 리소스만 요청할 수 있다", () => {
  const id = randomUUID();
  assert.equal(
    isStudyDocument(`study://${id}/index.html#question-2`, id),
    true,
  );
  assert.equal(isStudyResource("data:image/png;base64,aGVsbG8=", id), true);
  assert.equal(isStudyResource(`blob:study://${id}/${randomUUID()}`, id), true);
  for (const url of [
    "file:///C:/Users/private.txt",
    "https://example.com",
    "http://127.0.0.1:5173",
    `study://${randomUUID()}/index.html`,
    `study://${id}/library.json`,
    `study://${id}/../library.json`,
    `study://${id}/%2e%2e/library.json`,
    `study://${id}/%2findex.html`,
    `study://${id}:80/index.html`,
    `study://user@${id}/index.html`,
    "javascript:alert(1)",
    "invalid",
  ])
    assert.equal(isStudyResource(url, id), false, url);
});
