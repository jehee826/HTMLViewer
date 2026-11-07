import messages from "../electron/locales.json";

export function createTranslator(language) {
  return (key, values = {}) => {
    const text = messages[language]?.[key] ?? messages.ko[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_match, name) =>
      String(values[name] ?? ""),
    );
  };
}
