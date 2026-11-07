const fs = require("node:fs/promises");
const { createReadStream, constants } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { Library } = require("./library.cjs");
const { translatedError } = require("./i18n.cjs");

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return (
    !relative ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

async function prepareLibraryMove(library, selectedFolder, defaultFolder) {
  return library.enqueue(async () => {
    const source = await fs.realpath(library.root);
    if (
      path.relative(
        path.join(source, "files"),
        await fs.realpath(library.files),
      )
    ) {
      throw translatedError("storageChanged");
    }
    const destination = await fs.realpath(selectedFolder);
    const defaultRoot = await fs.realpath(defaultFolder);
    if (contains(source, destination) || contains(destination, source)) {
      throw translatedError("storageOverlap");
    }
    const contents = await fs.readdir(destination);
    if (
      contents.length &&
      (destination !== defaultRoot ||
        contents.includes("library.json") ||
        contents.includes("files"))
    ) {
      throw translatedError("storageNotEmpty");
    }
    const originalMetadata = await fs.readFile(library.file);
    if (
      JSON.stringify(JSON.parse(originalMetadata.toString("utf8"))) !==
      JSON.stringify(library.snapshot())
    ) {
      throw translatedError("storageChanged");
    }
    const createdFiles = [];
    const createdDirectories = [];
    const checksums = [];
    const targetFiles = path.join(destination, "files");

    async function cancel() {
      let complete = true;
      for (const file of [...createdFiles].reverse()) {
        try {
          await fs.unlink(file);
        } catch (error) {
          if (error.code !== "ENOENT") complete = false;
        }
      }
      for (const directory of [...createdDirectories].reverse()) {
        try {
          await fs.rmdir(directory);
        } catch (error) {
          if (error.code !== "ENOENT") complete = false;
        }
      }
      return complete;
    }

    try {
      await fs.mkdir(targetFiles);
      createdDirectories.push(targetFiles);
      for (const item of library.snapshot().items) {
        const from = library.getFile(item.id);
        if (
          path.relative(
            path.join(source, "files", item.id, "index.html"),
            await fs.realpath(from),
          )
        ) {
          throw translatedError("storageChanged");
        }
        const directory = path.join(targetFiles, item.id);
        const to = path.join(directory, "index.html");
        const expected = await hashFile(from);
        await fs.mkdir(directory);
        createdDirectories.push(directory);
        createdFiles.push(to);
        await fs.copyFile(from, to, constants.COPYFILE_EXCL);
        const copiedFile = await fs.open(to, "r+");
        try {
          await copiedFile.sync();
        } finally {
          await copiedFile.close();
        }
        if ((await hashFile(to)) !== expected)
          throw translatedError("storageCopyMismatch");
        checksums.push({ from, directory: path.dirname(from), expected });
      }
      const targetMetadata = path.join(destination, "library.json");
      const metadataHandle = await fs.open(targetMetadata, "wx");
      createdFiles.push(targetMetadata);
      try {
        await metadataHandle.writeFile(originalMetadata);
        await metadataHandle.sync();
      } finally {
        await metadataHandle.close();
      }
      const next = new Library(destination, library.getLanguage);
      await next.init();

      return {
        library: next,
        cancel,
        async cleanupSource() {
          try {
            // 전환 후 원본이 바뀌었으면 보존한다. 정리는 앱이 관리하는 파일에만 한정한다.
            if (!(await fs.readFile(library.file)).equals(originalMetadata))
              return false;
            for (const entry of checksums) {
              if ((await hashFile(entry.from)) !== entry.expected) return false;
            }
            for (const entry of checksums) {
              await fs.unlink(entry.from);
              try {
                await fs.rmdir(entry.directory);
              } catch (error) {
                if (error.code !== "ENOTEMPTY") throw error;
              }
            }
            await fs.unlink(library.file);
            try {
              await fs.rmdir(library.files);
            } catch (error) {
              if (error.code !== "ENOTEMPTY") throw error;
            }
            return true;
          } catch {
            return false;
          }
        },
      };
    } catch (error) {
      if (!(await cancel()))
        throw translatedError(
          "storageRollbackFailed",
          { path: destination },
          error,
        );
      throw error;
    }
  });
}

module.exports = { prepareLibraryMove };
