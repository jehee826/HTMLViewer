const messages = require("./locales.json");

function translate(language, key, values = {}) {
  const text = messages[language]?.[key] ?? messages.ko[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_match, name) =>
    String(values[name] ?? ""),
  );
}

function translatedError(key, values = {}, cause) {
  const error = new Error(
    translate("ko", key, { ...values, detail: cause?.message }),
    { cause },
  );
  error.translationKey = key;
  error.translationValues = values;
  return error;
}

function errorMessage(error, language) {
  if (!error.translationKey) return error.message;
  return translate(language, error.translationKey, {
    ...error.translationValues,
    detail: error.cause ? errorMessage(error.cause, language) : "",
  });
}

module.exports = { messages, translate, translatedError, errorMessage };
