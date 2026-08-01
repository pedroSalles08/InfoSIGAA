(function () {
  "use strict";

  const STORAGE_PREFIX = "sigaa-grade-monitor:snapshot:v1:";

  function getExtensionStorage() {
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) {
      return null;
    }

    return chrome.storage.local;
  }

  function getSnapshotKey(locationLike) {
    const origin = locationLike.origin || "";
    const pathname = locationLike.pathname || "";
    return `${STORAGE_PREFIX}${origin}${pathname}`;
  }

  function loadSnapshot(key) {
    const storage = getExtensionStorage();

    if (!storage) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      storage.get([key], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn(
            "[Monitor de Notas SIGAA] Falha ao ler snapshot:",
            chrome.runtime.lastError.message
          );
          resolve(null);
          return;
        }

        resolve(result[key] || null);
      });
    });
  }

  function saveSnapshot(key, snapshot) {
    const storage = getExtensionStorage();

    if (!storage) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      storage.set({ [key]: snapshot }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn(
            "[Monitor de Notas SIGAA] Falha ao salvar snapshot:",
            chrome.runtime.lastError.message
          );
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  globalThis.SigaaGradeStorage = {
    getSnapshotKey,
    loadSnapshot,
    saveSnapshot
  };
})();
