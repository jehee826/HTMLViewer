function isStudyDocument(value, id) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "study:" &&
      url.hostname === id &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname === "/index.html"
    );
  } catch {
    return false;
  }
}

function isStudyResource(value, id) {
  return (
    isStudyDocument(value, id) ||
    value.startsWith("data:") ||
    value.startsWith(`blob:study://${id}/`)
  );
}

const STUDY_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src data: blob:",
  "media-src data: blob:",
  "connect-src 'self'",
  "worker-src blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

module.exports = { isStudyDocument, isStudyResource, STUDY_CSP };
