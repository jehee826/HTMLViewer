const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { translatedError } = require("./i18n.cjs");

class Preferences {
  constructor(root) {
    this.root = root;
    this.file = path.join(root, "preferences.json");
    this.data = { language: "ko", libraryPath: null };
    this.pending = Promise.resolve();
  }

  snapshot() {
    return { ...this.data };
  }

  async init() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, "utf8"));
      if (
        !data ||
        !["ko", "en"].includes(data.language) ||
        (data.libraryPath != null && typeof data.libraryPath !== "string") ||
        (data.libraryPath && !path.isAbsolute(data.libraryPath))
      ) {
        throw translatedError("invalidPreferences");
      }
      this.data = {
        language: data.language,
        libraryPath: data.libraryPath ?? null,
      };
    } catch (error) {
      if (error.code !== "ENOENT")
        throw translatedError("readPreferences", {}, error);
    }
    return this.snapshot();
  }

  update(changes) {
    const result = this.pending.then(async () => {
      const next = { ...this.data, ...changes };
      if (!["ko", "en"].includes(next.language))
        throw translatedError("invalidLanguage");
      if (
        next.libraryPath !== null &&
        (typeof next.libraryPath !== "string" ||
          !path.isAbsolute(next.libraryPath))
      ) {
        throw translatedError("invalidPreferences");
      }
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await fs.mkdir(this.root, { recursive: true });
      try {
        const handle = await fs.open(temporary, "wx");
        try {
          await handle.writeFile(JSON.stringify(next, null, 2), "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(temporary, this.file);
        this.data = next;
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => {});
      }
      return this.snapshot();
    });
    this.pending = result.catch(() => {});
    return result;
  }
}

module.exports = { Preferences };
