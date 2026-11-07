const query = document.getElementById("query");
const count = document.getElementById("count");
const previous = document.getElementById("previous");
const next = document.getElementById("next");

function search(forward = true, advance = false) {
  previous.disabled = next.disabled = !query.value;
  if (!advance) {
    count.textContent = query.value ? "검색 중…" : "";
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
