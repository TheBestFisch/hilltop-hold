(() => {
  'use strict';

  /**
   * Thin localStorage wrapper. Storage can be unavailable (private mode,
   * blocked site data), in which case reads fall back and writes are no-ops.
   */
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Persisting is best-effort.
    }
  }

  Object.assign(Hold, { readJson, writeJson });
})();
