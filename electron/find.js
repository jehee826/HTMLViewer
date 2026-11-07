const query = document.getElementById("query");
const count = document.getElementById("count");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
let labels = { finding: "검색 중…" };

window.documentFind.onLanguage(({ language, labels: translated }) => {
  labels = translated;
  document.documentElement.lang = language;
  document.title = labels.findTitle;
  document
    .querySelector(".findbar")
    .setAttribute("aria-label", labels.findTitle);
  query.placeholder = labels.findTitle;
  query.setAttribute("aria-label", labels.findQuery);
  count.setAttribute("aria-label", labels.findResults);
  for (const [id, key, shortcut] of [
    ["previous", "findPrevious", "Shift+Enter"],
    ["next", "findNext", "Enter"],
    ["close", "findClose", "Esc"],
  ]) {
    const button = document.getElementById(id);
    button.setAttribute("aria-label", labels[key]);
    button.title = `${labels[key]} (${shortcut})`;
  }
});

function search(forward = true, advance = false) {
  previous.disabled = next.disabled = !query.value;
  if (!advance) {
    count.textContent = query.value ? labels.finding : "";
    count.dataset.empty = "false";
  }
  window.documentFind.search(query.value, forward, advance);
}

query.addEventListener("input", () => search());
query.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    search(!event.shiftKey, true);
  }
});
previous.addEventListener("click", () => search(false, true));
next.addEventListener("click", () => search(true, true));
document
  .getElementById("close")
  .addEventListener("click", () => window.documentFind.close());
window.documentFind.onFocus(() => {
  query.focus();
  query.select();
  search();
});
window.documentFind.onResult(({ matches, activeMatchOrdinal }) => {
  count.textContent = query.value ? `${activeMatchOrdinal} / ${matches}` : "";
  count.dataset.empty = String(Boolean(query.value) && matches === 0);
  previous.disabled = next.disabled = !query.value || matches === 0;
});
