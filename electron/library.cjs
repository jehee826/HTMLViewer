const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { translate, translatedError } = require("./i18n.cjs");

const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function requireId(id) {
  if (typeof id !== "string" || !ID_PATTERN.test(id))
    throw translatedError("invalidId");
  return id;
}

function requireName(value, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw translatedError(
      label === "제목" ? "titleRequired" : "categoryRequired",
    );
  }
  return value.trim();
}

function validateLibrary(data) {
  if (
    data?.version !== 1 ||
    !Array.isArray(data.items) ||
    !Array.isArray(data.categories)
  ) {
    throw translatedError("unsupportedLibrary");
  }
  const categories = new Set();
  const names = new Set();
  for (const category of data.categories) {
    requireId(category.id);
    const name = requireName(category.name, "카테고리");
    if (
      categories.has(category.id) ||
      names.has(name.toLocaleLowerCase("ko"))
    ) {
      throw translatedError("duplicateCategory");
    }
    categories.add(category.id);
    names.add(name.toLocaleLowerCase("ko"));
  }
  const items = new Set();
  for (const item of data.items) {
    requireId(item.id);
    requireName(item.title, "제목");
    if (
      items.has(item.id) ||
      (item.categoryId !== null && !categories.has(item.categoryId)) ||
      typeof item.originalFileName !== "string" ||
      !/\.html?$/i.test(item.originalFileName) ||
      typeof item.createdAt !== "string" ||
      !Number.isFinite(Date.parse(item.createdAt))
    ) {
      throw translatedError("invalidMetadata");
    }
    items.add(item.id);
  }
  return data;
}

class Library {
  constructor(root, getLanguage = () => "ko") {
    this.getLanguage = getLanguage;
    this.root = root;
    this.file = path.join(root, "library.json");
    this.files = path.join(root, "files");
    this.data = null;
    this.pending = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.files, { recursive: true });
    try {
      this.data = validateLibrary(
        JSON.parse(await fs.readFile(this.file, "utf8")),
      );
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw translatedError("readLibrary", {}, error);
      }
      this.data = { version: 1, categories: [], items: [] };
      await this.save(this.data);
    }
    return this.snapshot();
  }

  snapshot() {
    return structuredClone(this.data);
  }

  enqueue(operation) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }

  async save(data) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, "wx");
      try {
        await handle.writeFile(JSON.stringify(data, null, 2), "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, this.file);
      this.data = data;
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  getItem(id) {
    requireId(id);
    const item = this.data.items.find((entry) => entry.id === id);
    if (!item) throw translatedError("itemNotFound");
    return { ...item };
  }

  getFile(id) {
    this.getItem(id);
    return path.join(this.files, id, "index.html");
  }

  requireCategory(id) {
    if (id === null) return;
    requireId(id);
    if (!this.data.categories.some((category) => category.id === id)) {
      throw translatedError("categoryNotFound");
    }
  }

  importFile(source, categoryId = null) {
    return this.enqueue(async () => {
      this.requireCategory(categoryId);
      if (typeof source !== "string" || !/\.html?$/i.test(source)) {
        throw translatedError("htmlOnly");
      }
      const stat = await fs.stat(source);
      if (!stat.isFile()) throw translatedError("fileRequired");
      const id = randomUUID();
      const directory = path.join(this.files, id);
      const originalFileName = path.basename(source);
      const item = {
        id,
        title:
          path.parse(originalFileName).name.slice(0, 100).trim() ||
          translate(this.getLanguage(), "untitled"),
        categoryId,
        originalFileName,
        createdAt: new Date().toISOString(),
      };
      await fs.mkdir(directory);
      try {
        await fs.copyFile(source, path.join(directory, "index.html"));
        const next = this.snapshot();
        next.items.unshift(item);
        await this.save(next);
      } catch (error) {
        await fs.rm(directory, { recursive: true, force: true });
        throw error;
      }
      return this.snapshot();
    });
  }

  updateItem(id, title, categoryId) {
    return this.enqueue(async () => {
      this.getItem(id);
      this.requireCategory(categoryId);
      const next = this.snapshot();
      Object.assign(
        next.items.find((item) => item.id === id),
        {
          title: requireName(title, "제목"),
          categoryId,
        },
      );
      await this.save(next);
      return this.snapshot();
    });
  }

  removeItem(id) {
    return this.enqueue(async () => {
      this.getItem(id);
      const next = this.snapshot();
      next.items = next.items.filter((item) => item.id !== id);
      // 메타데이터 저장 실패 시 파일을 보존한다. 남은 파일은 앱에서 실행할 수 없다.
      await this.save(next);
      let cleanupWarning = null;
      try {
        await fs.rm(path.join(this.files, id), {
          recursive: true,
          force: true,
        });
      } catch {
        cleanupWarning = translate(this.getLanguage(), "copyCleanupWarning");
      }
      return { library: this.snapshot(), cleanupWarning };
    });
  }

  saveCategory(id, value) {
    return this.enqueue(async () => {
      const name = requireName(value, "카테고리");
      if (id !== null) this.requireCategory(id);
      if (
        this.data.categories.some(
          (category) =>
            category.id !== id &&
            category.name.toLocaleLowerCase("ko") ===
              name.toLocaleLowerCase("ko"),
        )
      ) {
        throw translatedError("duplicateCategoryName");
      }
      const next = this.snapshot();
      if (id === null) next.categories.push({ id: randomUUID(), name });
      else next.categories.find((category) => category.id === id).name = name;
      await this.save(next);
      return this.snapshot();
    });
  }

  removeCategory(id) {
    return this.enqueue(async () => {
      this.requireCategory(id);
      if (id === null) throw translatedError("cannotDeleteUncategorized");
      const next = this.snapshot();
      next.categories = next.categories.filter(
        (category) => category.id !== id,
      );
      for (const item of next.items)
        if (item.categoryId === id) item.categoryId = null;
      await this.save(next);
      return this.snapshot();
    });
  }
}

module.exports = { Library, requireId };
