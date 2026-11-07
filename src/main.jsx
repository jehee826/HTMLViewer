import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { createTranslator } from "./i18n.js";

function Icon({ name, size = 20, ...props }) {
  const paths = {
    code: (
      <>
        <path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.3" />
        <path d="m16 16 4 4" />
      </>
    ),
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    edit: (
      <>
        <path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
      </>
    ),
    gear: (
      <>
        <path d="M10 3h4l.5 2.5 2 .9 2-.9 2 3.5-1.7 1.4v2.2l1.7 1.4-2 3.5-2-.9-2 .9L14 20h-4l-.5-2.5-2-.9-2 .9-2-3.5 1.7-1.4v-2.2L3 9l2-3.5 2 .9 2-.9Z" />
        <circle cx="12" cy="11.5" r="3" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    file: (
      <>
        <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7" />
        <path d="m10 14-2 2 2 2m4-4 2 2-2 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

async function call(method, ...args) {
  if (!window.htmlViewer)
    throw new Error(
      createTranslator(document.documentElement.lang)("electronOnly"),
    );
  const result = await window.htmlViewer[method](...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function Notice({ notice, dismiss, t }) {
  if (!notice) return null;
  return (
    <div
      className={`notice ${notice.error ? "notice-error" : ""}`}
      role={notice.error ? "alert" : "status"}
    >
      <span>{notice.text}</span>
      <button
        className="icon-button"
        onClick={dismiss}
        aria-label={t("dismissNotice")}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function Modal({ title, children, onClose, busy, notice, dismiss, t }) {
  const ref = useRef(null);
  const heading = React.useId();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={heading}>{title}</h2>
        <button
          className="icon-button"
          disabled={busy}
          onClick={onClose}
          aria-label={t("close")}
        >
          <Icon name="close" />
        </button>
      </div>
      <Notice notice={notice} dismiss={dismiss} t={t} />
      {children}
    </dialog>
  );
}

function App() {
  const [preferences, setPreferences] = useState({ language: "ko" });
  const language = preferences.language;
  const t = createTranslator(language);
  const [library, setLibrary] = useState({ items: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [data, settings] = await Promise.all([
        call("getLibrary"),
        call("getSettings"),
      ]);
      setLibrary(data);
      setPreferences(settings);
      setNotice(null);
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function changeLanguage(value) {
    await run(async () => setPreferences(await call("setLanguage", value)));
  }

  async function chooseLibraryFolder() {
    await run(async () => {
      const folder = await call("chooseLibraryFolder");
      if (folder) setModal({ type: "moveLibrary", folder });
    });
  }

  function closeModal() {
    setModal(null);
    setNotice(null);
  }

  async function importHtml() {
    await run(async () => {
      const result = await call(
        "importFile",
        filter === "all" || filter === "uncategorized" ? null : filter,
      );
      if (result) {
        setLibrary(result);
        setSearch("");
        setNotice({
          text: t("imported"),
        });
      }
    });
  }

  const filtered = library.items.filter(
    (item) =>
      (filter === "all" ||
        (filter === "uncategorized"
          ? item.categoryId === null
          : item.categoryId === filter)) &&
      item.title
        .toLocaleLowerCase(language)
        .includes(search.trim().toLocaleLowerCase(language)),
  );
  const categoryTitle =
    filter === "all"
      ? t("libraryTitle")
      : filter === "uncategorized"
        ? t("uncategorized")
        : (library.categories.find((category) => category.id === filter)
            ?.name ?? t("libraryTitle"));
  const dateFormatter = new Intl.DateTimeFormat(
    language === "en" ? "en-US" : "ko-KR",
    { year: "numeric", month: "2-digit", day: "2-digit" },
  );
  const categoryCount = (id) =>
    library.items.filter((item) => item.categoryId === id).length;

  function openEditor(item) {
    setTitle(item.title);
    setCategoryId(item.categoryId ?? "");
    setNotice(null);
    setModal({ type: "edit", item });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label={t("libraryNavigation")}>
        <div className="brand">
          <span className="brand-icon">
            <Icon name="code" size={24} />
          </span>
          <span>
            HTMLViewer
            <span className="brand-caption">{t("brandCaption")}</span>
          </span>
        </div>
        <div className="sidebar-section-label">{t("library")}</div>
        <nav>
          <button
            className={`nav-item ${filter === "all" ? "selected" : ""}`}
            onClick={() => setFilter("all")}
          >
            <Icon name="grid" />
            <span>{t("allHtml")}</span>
            <span className="nav-count">{library.items.length}</span>
          </button>
          <button
            className={`nav-item ${filter === "uncategorized" ? "selected" : ""}`}
            onClick={() => setFilter("uncategorized")}
          >
            <Icon name="folder" />
            <span>{t("uncategorized")}</span>
            <span className="nav-count">{categoryCount(null)}</span>
          </button>
          <div className="category-heading">
            <span className="sidebar-section-label">{t("categories")}</span>
            <button
              className="icon-button"
              aria-label={t("addCategory")}
              disabled={busy || loading}
              onClick={() => {
                setCategoryName("");
                setEditingCategory(null);
                setNotice(null);
                setModal({ type: "categories" });
              }}
            >
              <Icon name="plus" size={17} />
            </button>
          </div>
          {library.categories.map((category) => (
            <button
              key={category.id}
              className={`nav-item ${filter === category.id ? "selected" : ""}`}
              onClick={() => setFilter(category.id)}
            >
              <span className="category-dot" />
              <span className="nav-name">{category.name}</span>
              <span className="nav-count">{categoryCount(category.id)}</span>
            </button>
          ))}
          {!library.categories.length && (
            <p className="category-hint">{t("categoryHint")}</p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-action"
            disabled={busy || loading}
            onClick={() => {
              setNotice(null);
              setModal({ type: "settings" });
            }}
          >
            <Icon name="gear" size={18} />
            {t("settings")}
          </button>
          <button
            className="sidebar-action"
            disabled={busy || loading}
            onClick={() => {
              setCategoryName("");
              setEditingCategory(null);
              setNotice(null);
              setModal({ type: "categories" });
            }}
          >
            <Icon name="settings" size={18} />
            {t("manageCategories")}
          </button>
          <button
            className="sidebar-action"
            disabled={busy || loading}
            onClick={() => run(() => call("openDataFolder"))}
          >
            <Icon name="folder" size={18} />
            {t("openDataFolder")}
          </button>
          <div className="local-note">
            <Icon name="lock" size={15} />
            <span>{t("localNote")}</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>{t("tagline")}</span>
          <span className="offline-badge">
            <span />
            {t("localLibrary")}
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{categoryTitle}</h1>
              <p>{t("pageDescription")}</p>
            </div>
            <button
              className="button primary"
              onClick={importHtml}
              disabled={busy || loading}
            >
              <Icon name="plus" size={19} />
              {t("importHtml")}
            </button>
          </div>
          {!modal && (
            <Notice notice={notice} dismiss={() => setNotice(null)} t={t} />
          )}
          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={19} />
              <input
                aria-label={t("titleSearch")}
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  className="icon-button"
                  onClick={() => setSearch("")}
                  aria-label={t("clearSearch")}
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </label>
            <span className="result-count">
              {t(filtered.length === 1 ? "oneHtml" : "manyHtml", {
                count: filtered.length,
              })}
              <span className="sort-label">{t("newestFirst")}</span>
            </span>
          </div>
          {loading ? (
            <div className="empty-state" role="status">
              {t("loading")}
            </div>
          ) : filtered.length ? (
            <div className="card-grid">
              {filtered.map((item) => {
                const category = library.categories.find(
                  (entry) => entry.id === item.categoryId,
                );
                return (
                  <article className="html-card" key={item.id}>
                    <button
                      className="card-open"
                      aria-label={t("openNamed", { name: item.title })}
                      disabled={busy}
                      onClick={() => run(() => call("openItem", item.id))}
                    >
                      <div className="card-top">
                        <span className="file-icon">
                          <Icon name="code" size={27} />
                        </span>
                        <span className="file-extension">HTML</span>
                      </div>
                      <h2>{item.title}</h2>
                      <p className="file-name" title={item.originalFileName}>
                        {item.originalFileName}
                      </p>
                      <span className="category-chip">
                        {category?.name ?? t("uncategorized")}
                      </span>
                      <span className="card-launch">
                        {t("open")}
                        <Icon name="arrow" size={17} />
                      </span>
                    </button>
                    <div className="card-footer">
                      <time dateTime={item.createdAt}>
                        {t("registeredOn", {
                          date: dateFormatter.format(new Date(item.createdAt)),
                        })}
                      </time>
                      <div>
                        <button
                          className="icon-button"
                          disabled={busy}
                          aria-label={t("editNamed", { name: item.title })}
                          onClick={() => openEditor(item)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          className="icon-button delete-button"
                          disabled={busy}
                          aria-label={t("deleteNamed", { name: item.title })}
                          onClick={() => {
                            setNotice(null);
                            setModal({ type: "delete", item });
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name={search ? "search" : "file"} size={38} />
              </span>
              <h2>
                {search
                  ? t("noResults")
                  : library.items.length
                    ? t("noCategoryItems")
                    : t("firstHtml")}
              </h2>
              <p>{search ? t("trySearch") : <>{t("emptyDescription")}</>}</p>
              {search ? (
                <button
                  className="button secondary"
                  onClick={() => setSearch("")}
                >
                  {t("resetSearch")}
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={importHtml}
                >
                  <Icon name="plus" size={18} />
                  {t("importHtml")}
                </button>
              )}
            </div>
          )}
          <p className="support-note">
            <Icon name="lock" size={14} />
            {t("supportNote")}
            <span>{t("copyNote")}</span>
          </p>
        </div>
      </main>
      {modal && (
        <Modal
          t={t}
          title={
            modal.type === "settings"
              ? t("settings")
              : modal.type === "moveLibrary"
                ? t("storageMoveTitle")
                : modal.type === "edit"
                  ? t("editHtml")
                  : modal.type === "delete"
                    ? t("deleteHtml")
                    : modal.type === "deleteCategory"
                      ? t("deleteCategory")
                      : t("manageCategories")
          }
          onClose={closeModal}
          busy={busy}
          notice={notice}
          dismiss={() => setNotice(null)}
        >
          {modal.type === "settings" && (
            <>
              <label className="field">
                {t("language")}
                <select
                  aria-label="언어 / Language"
                  value={language}
                  disabled={busy}
                  onChange={(event) => changeLanguage(event.target.value)}
                >
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
              </label>
              <p className="muted">{t("languageHint")}</p>
              <section className="storage-settings">
                <h3>{t("storageFolder")}</h3>
                <p className="muted">{t("storageHint")}</p>
                <p className="storage-path">{preferences.libraryPath}</p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={chooseLibraryFolder}
                >
                  <Icon name="folder" size={17} />
                  {t("chooseFolder")}
                </button>
                <p className="muted small">{t("storageRecordsHint")}</p>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => run(() => call("openAppDataFolder"))}
                >
                  {t("appDataFolder")}
                </button>
              </section>
            </>
          )}
          {modal.type === "moveLibrary" && (
            <>
              <p className="muted">{t("storageMoveDescription")}</p>
              <p className="storage-path">{modal.folder}</p>
              <p className="muted small">{t("storageEmptyHint")}</p>
              <p className="muted small">{t("storageKeepRecords")}</p>
              {busy && (
                <p role="status" className="muted">
                  {t("storageMoveProgress")}
                </p>
              )}
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal({ type: "settings" })}
                >
                  {t("cancel")}
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await call("moveLibrary");
                      setLibrary(result.library);
                      setPreferences(result.settings);
                      setModal({ type: "settings" });
                      setNotice({
                        text: result.cleanupWarning ?? t("storageMoved"),
                        error: Boolean(result.cleanupWarning),
                      });
                    })
                  }
                >
                  {t("storageMove")}
                </button>
              </div>
            </>
          )}
          {modal.type === "edit" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  setLibrary(
                    await call(
                      "updateItem",
                      modal.item.id,
                      title,
                      categoryId || null,
                    ),
                  );
                  closeModal();
                });
              }}
            >
              <label className="field">
                {t("title")}
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="field">
                {t("category")}
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">{t("uncategorized")}</option>
                  {library.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={closeModal}
                >
                  {t("cancel")}
                </button>
                <button
                  className="button primary"
                  disabled={busy || !title.trim()}
                >
                  {t("save")}
                </button>
              </div>
            </form>
          )}
          {modal.type === "delete" && (
            <>
              <p className="delete-copy">
                {t("deleteItemPrefix")}
                <strong>{modal.item.title}</strong>
                {t("deleteItemSuffix")}
              </p>
              <p className="muted">
                {t("deleteItemWarning")}
                <br />
                {t("deleteOriginalNote")}
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={closeModal}
                >
                  {t("cancel")}
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await call("removeItem", modal.item.id);
                      setLibrary(result.library);
                      closeModal();
                      if (result.cleanupWarning)
                        setNotice({ text: result.cleanupWarning, error: true });
                    })
                  }
                >
                  {t("delete")}
                </button>
              </div>
            </>
          )}
          {modal.type === "categories" && (
            <>
              <form
                className="category-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    setLibrary(
                      await call("saveCategory", editingCategory, categoryName),
                    );
                    setCategoryName("");
                    setEditingCategory(null);
                  });
                }}
              >
                <label className="field">
                  {editingCategory ? t("renameCategory") : t("newCategory")}
                  <div className="input-row">
                    <input
                      autoFocus
                      required
                      maxLength={100}
                      aria-label={t("categoryName")}
                      placeholder={t("categoryPlaceholder")}
                      value={categoryName}
                      onChange={(event) => setCategoryName(event.target.value)}
                    />
                    <button
                      className="button primary"
                      disabled={busy || !categoryName.trim()}
                    >
                      {editingCategory ? t("save") : t("add")}
                    </button>
                  </div>
                </label>
                {editingCategory && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryName("");
                    }}
                  >
                    {t("cancelEdit")}
                  </button>
                )}
              </form>
              <div className="category-list">
                {library.categories.length ? (
                  library.categories.map((category) => (
                    <div className="category-row" key={category.id}>
                      <Icon name="folder" size={18} />
                      <span>
                        {category.name}
                        <small>
                          {t("categoryItems", {
                            count: categoryCount(category.id),
                          })}
                        </small>
                      </span>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={t("editCategoryNamed", {
                          name: category.name,
                        })}
                        onClick={() => {
                          setEditingCategory(category.id);
                          setCategoryName(category.name);
                        }}
                      >
                        <Icon name="edit" size={17} />
                      </button>
                      <button
                        className="icon-button delete-button"
                        disabled={busy}
                        aria-label={t("deleteCategoryNamed", {
                          name: category.name,
                        })}
                        onClick={() => {
                          setNotice(null);
                          setModal({ type: "deleteCategory", category });
                        }}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">{t("noCategories")}</p>
                )}
              </div>
              <p className="muted small">{t("categoryDeleteHint")}</p>
            </>
          )}
          {modal.type === "deleteCategory" && (
            <>
              <p className="delete-copy">
                {t("deleteCategoryPrefix")}
                <strong>{modal.category.name}</strong>
                {t("deleteCategorySuffix")}
              </p>
              <p className="muted">{t("deleteCategoryWarning")}</p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal({ type: "categories" })}
                >
                  {t("cancel")}
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setLibrary(
                        await call("removeCategory", modal.category.id),
                      );
                      if (filter === modal.category.id)
                        setFilter("uncategorized");
                      setEditingCategory(null);
                      setCategoryName("");
                      setModal({ type: "categories" });
                    })
                  }
                >
                  {t("deleteCategory")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
