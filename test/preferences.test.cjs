const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Preferences } = require("../electron/preferences.cjs");
const {
  messages,
  translate,
  translatedError,
  errorMessage,
} = require("../electron/i18n.cjs");

test("한국어·영어 번역의 키와 치환값이 일치한다", () => {
  assert.deepEqual(
    Object.keys(messages.ko).sort(),
    Object.keys(messages.en).sort(),
  );
  for (const key of Object.keys(messages.ko)) {
    assert.ok(messages.ko[key] || key.endsWith("Prefix"), key);
    assert.ok(messages.en[key], key);
    const placeholders = (text) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      placeholders(messages.ko[key]),
      placeholders(messages.en[key]),
      key,
    );
  }
  assert.equal(
    translate("en", "openNamed", { name: "내 문제.html" }),
    "Open 내 문제.html",
  );
  const error = translatedError(
    "readLibrary",
    {},
    translatedError("invalidMetadata"),
  );
  assert.match(errorMessage(error, "en"), /original data has not been changed/);
  assert.doesNotMatch(errorMessage(error, "en"), /[가-힣]/);
});

test("언어·보관함 설정을 재시작 후 복원하고 잘못된 설정은 보존한다", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "htmlviewer-preferences-"),
  );
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith("htmlviewer-preferences-"));
    return fs.rm(root, { recursive: true, force: true });
  });
  const preferences = new Preferences(root);
  assert.deepEqual(await preferences.init(), {
    language: "ko",
    libraryPath: null,
  });
  await Promise.all([
    preferences.update({ language: "en" }),
    preferences.update({ libraryPath: path.join(root, "library") }),
  ]);
  const restarted = new Preferences(root);
  assert.deepEqual(await restarted.init(), preferences.snapshot());
  const before = await fs.readFile(preferences.file, "utf8");
  await assert.rejects(preferences.update({ language: "fr" }), /지원하지/);
  assert.equal(await fs.readFile(preferences.file, "utf8"), before);
  await fs.writeFile(preferences.file, "{broken");
  await assert.rejects(new Preferences(root).init(), /기존 설정은 변경하지/);
  assert.equal(await fs.readFile(preferences.file, "utf8"), "{broken");
});
