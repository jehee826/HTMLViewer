import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

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
  if (!window.htmlViewer) throw new Error("Electron 앱에서 실행해 주세요.");
  const result = await window.htmlViewer[method](...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function Notice({ notice, dismiss }) {
  if (!notice) return null;
  return (
    <div
      className={`notice ${notice.error ? "notice-error" : ""}`}
      role={notice.error ? "alert" : "status"}
    >
      <span>{notice.text}</span>
      <button className="icon-button" onClick={dismiss} aria-label="알림 닫기">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function Modal({ title, children, onClose, busy, notice, dismiss }) {
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
          aria-label="닫기"
        >
          <Icon name="close" />
        </button>
      </div>
      <Notice notice={notice} dismiss={dismiss} />
      {children}
    </dialog>
  );
}

function App() {
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
      setLibrary(await call("getLibrary"));
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
          text: "HTML을 등록했습니다. 카드를 클릭해서 열어 보세요.",
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
        .toLocaleLowerCase("ko")
        .includes(search.trim().toLocaleLowerCase("ko")),
  );
  const categoryTitle =
    filter === "all"
      ? "내 HTML 보관함"
      : filter === "uncategorized"
        ? "미분류"
        : (library.categories.find((category) => category.id === filter)
            ?.name ?? "내 HTML 보관함");
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
      <aside className="sidebar" aria-label="보관함 탐색">
        <div className="brand">
          <span className="brand-icon">
            <Icon name="code" size={24} />
          </span>
          <span>
            HTMLViewer
            <span className="brand-caption">나만의 HTML 라이브러리</span>
          </span>
        </div>
        <div className="sidebar-section-label">라이브러리</div>
        <nav>
          <button
            className={`nav-item ${filter === "all" ? "selected" : ""}`}
            onClick={() => setFilter("all")}
          >
            <Icon name="grid" />
            <span>전체 HTML</span>
            <span className="nav-count">{library.items.length}</span>
          </button>
          <button
            className={`nav-item ${filter === "uncategorized" ? "selected" : ""}`}
            onClick={() => setFilter("uncategorized")}
          >
            <Icon name="folder" />
            <span>미분류</span>
            <span className="nav-count">{categoryCount(null)}</span>
          </button>
          <div className="category-heading">
            <span className="sidebar-section-label">카테고리</span>
            <button
              className="icon-button"
              aria-label="카테고리 추가"
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
            <p className="category-hint">
              필요할 때 카테고리를
              <br />
              추가해 정리하세요.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
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
            카테고리 관리
          </button>
          <button
            className="sidebar-action"
            disabled={busy || loading}
            onClick={() => run(() => call("openDataFolder"))}
          >
            <Icon name="folder" size={18} />
            저장 폴더 열기
          </button>
          <div className="local-note">
            <Icon name="lock" size={15} />
            <span>모든 자료는 이 PC에만 저장됩니다.</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>내 공부 자료, 한곳에.</span>
          <span className="offline-badge">
            <span />
            로컬 보관함
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{categoryTitle}</h1>
              <p>모아둔 HTML을 클릭하고, 바로 이어서 공부하세요.</p>
            </div>
            <button
              className="button primary"
              onClick={importHtml}
              disabled={busy || loading}
            >
              <Icon name="plus" size={19} />
              HTML 등록
            </button>
          </div>
          {!modal && <Notice notice={notice} dismiss={() => setNotice(null)} />}
          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={19} />
              <input
                aria-label="제목 검색"
                placeholder="제목으로 검색"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  className="icon-button"
                  onClick={() => setSearch("")}
                  aria-label="검색어 지우기"
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </label>
            <span className="result-count">
              {filtered.length}개의 HTML
              <span className="sort-label">최근 등록순</span>
            </span>
          </div>
          {loading ? (
            <div className="empty-state" role="status">
              보관함을 불러오는 중입니다.
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
                      aria-label={`${item.title} 열기`}
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
                        {category?.name ?? "미분류"}
                      </span>
                      <span className="card-launch">
                        열기
                        <Icon name="arrow" size={17} />
                      </span>
                    </button>
                    <div className="card-footer">
                      <time dateTime={item.createdAt}>
                        {new Intl.DateTimeFormat("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(new Date(item.createdAt))}{" "}
                        등록
                      </time>
                      <div>
                        <button
                          className="icon-button"
                          disabled={busy}
                          aria-label={`${item.title} 수정`}
                          onClick={() => openEditor(item)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          className="icon-button delete-button"
                          disabled={busy}
                          aria-label={`${item.title} 삭제`}
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
                  ? "검색 결과가 없습니다"
                  : library.items.length
                    ? "아직 이곳에 등록한 HTML이 없어요"
                    : "첫 HTML을 등록해 보세요"}
              </h2>
              <p>
                {search ? (
                  "다른 제목으로 검색해 보세요."
                ) : (
                  <>
                    공부 자료나 문제풀이 HTML 파일을 모아두고
                    <br />
                    클릭 한 번으로 별도 창에서 열 수 있어요.
                  </>
                )}
              </p>
              {search ? (
                <button
                  className="button secondary"
                  onClick={() => setSearch("")}
                >
                  검색 초기화
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={importHtml}
                >
                  <Icon name="plus" size={18} />
                  HTML 등록
                </button>
              )}
            </div>
          )}
          <p className="support-note">
            <Icon name="lock" size={14} />
            내부 CSS·JavaScript가 포함된 단일 HTML 지원
            <span>원본을 옮겨도 등록한 파일은 유지돼요.</span>
          </p>
        </div>
      </main>
      {modal && (
        <Modal
          title={
            modal.type === "edit"
              ? "HTML 정보 수정"
              : modal.type === "delete"
                ? "HTML 삭제"
                : modal.type === "deleteCategory"
                  ? "카테고리 삭제"
                  : "카테고리 관리"
          }
          onClose={closeModal}
          busy={busy}
          notice={notice}
          dismiss={() => setNotice(null)}
        >
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
                제목
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="field">
                카테고리
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">미분류</option>
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
                  취소
                </button>
                <button
                  className="button primary"
                  disabled={busy || !title.trim()}
                >
                  저장
                </button>
              </div>
            </form>
          )}
          {modal.type === "delete" && (
            <>
              <p className="delete-copy">
                <strong>{modal.item.title}</strong>을(를) 보관함에서 삭제할까요?
              </p>
              <p className="muted">
                복사된 HTML과 해당 HTML의 저장 데이터가 삭제됩니다.
                <br />
                원본 파일은 유지됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={closeModal}
                >
                  취소
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
                  삭제
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
                  {editingCategory ? "카테고리 이름 수정" : "새 카테고리"}
                  <div className="input-row">
                    <input
                      autoFocus
                      required
                      maxLength={100}
                      aria-label="카테고리 이름"
                      placeholder="예: JavaScript, 영어, 알고리즘"
                      value={categoryName}
                      onChange={(event) => setCategoryName(event.target.value)}
                    />
                    <button
                      className="button primary"
                      disabled={busy || !categoryName.trim()}
                    >
                      {editingCategory ? "저장" : "추가"}
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
                    수정 취소
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
                        <small>{categoryCount(category.id)}개</small>
                      </span>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`${category.name} 카테고리 수정`}
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
                        aria-label={`${category.name} 카테고리 삭제`}
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
                  <p className="muted">아직 등록한 카테고리가 없습니다.</p>
                )}
              </div>
              <p className="muted small">
                카테고리를 삭제해도 HTML은 미분류에 남습니다.
              </p>
            </>
          )}
          {modal.type === "deleteCategory" && (
            <>
              <p className="delete-copy">
                <strong>{modal.category.name}</strong> 카테고리를 삭제할까요?
              </p>
              <p className="muted">
                이 카테고리의 HTML은 삭제되지 않고 미분류로 이동합니다.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal({ type: "categories" })}
                >
                  취소
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
                  카테고리 삭제
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
