(function () {
  "use strict";

  const PERSONAL_MODE = "personal";
  const PUBLIC_MODE = "public";
  const PRIVACY_KEY = "infosigaa:privacy:v1";
  const UI_PREFERENCES_KEY = "infosigaa:ui-preferences:v1";
  const DATA_KEY = "sigaa-grade-monitor:data:v4";
  const PREVIOUS_DATA_KEY = "sigaa-grade-monitor:data:v3";
  const LEGACY_DATA_KEY = "sigaa-grade-monitor:data:v2";
  const LEGACY_SNAPSHOT_PREFIX = "sigaa-grade-monitor:snapshot:v1:";
  const SESSION_DATA_PREFIX = "infosigaa:session:data:v4:";
  const PREVIOUS_SESSION_DATA_PREFIX = "infosigaa:session:data:v3:";

  function getChromeStorage() {
    return globalThis.chrome?.storage || null;
  }

  function getArea(areaName) {
    return getChromeStorage()?.[areaName] || null;
  }

  function readArea(areaName, keys) {
    const area = getArea(areaName);

    if (!area) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      area.get(keys, (result) => {
        if (globalThis.chrome?.runtime?.lastError) {
          console.warn(
            `[InfoSIGAA] Falha ao ler chrome.storage.${areaName}:`,
            chrome.runtime.lastError.message
          );
          resolve({});
          return;
        }

        resolve(result || {});
      });
    });
  }

  function writeArea(areaName, values) {
    const area = getArea(areaName);

    if (!area) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      area.set(values, () => {
        if (globalThis.chrome?.runtime?.lastError) {
          console.warn(
            `[InfoSIGAA] Falha ao gravar chrome.storage.${areaName}:`,
            chrome.runtime.lastError.message
          );
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  function removeFromArea(areaName, keys) {
    const area = getArea(areaName);
    const requestedKeys = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);

    if (!area || requestedKeys.length === 0) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      area.remove(requestedKeys, () => {
        if (globalThis.chrome?.runtime?.lastError) {
          console.warn(
            `[InfoSIGAA] Falha ao limpar chrome.storage.${areaName}:`,
            chrome.runtime.lastError.message
          );
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  function normalizeEnrollment(value) {
    return String(value || "").replace(/\D/g, "").trim();
  }

  function normalizeName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function extractOwner(data) {
    const explicitEnrollment = normalizeEnrollment(data?.owner?.enrollment);

    if (explicitEnrollment) {
      return {
        enrollment: explicitEnrollment,
        studentName: normalizeName(data.owner.studentName)
      };
    }

    const identities = new Map();

    (data?.courses || []).forEach((course) => {
      const enrollment = normalizeEnrollment(course?.enrollment);

      if (!enrollment) {
        return;
      }

      const studentName = normalizeName(course?.studentName);
      const currentName = identities.get(enrollment) || "";
      identities.set(enrollment, currentName || studentName);
    });

    if (identities.size !== 1) {
      return null;
    }

    const [enrollment, studentName] = identities.entries().next().value;
    return { enrollment, studentName };
  }

  function attachOwner(data) {
    if (!data) {
      return data;
    }

    const owner = extractOwner(data);
    const result = { ...data };

    if (owner) {
      result.owner = owner;
    } else {
      delete result.owner;
    }

    return result;
  }

  function ownersMatch(firstData, secondData) {
    const firstOwner = extractOwner(firstData);
    const secondOwner = extractOwner(secondData);

    return Boolean(
      firstOwner?.enrollment &&
      secondOwner?.enrollment &&
      firstOwner.enrollment === secondOwner.enrollment
    );
  }

  function getMatchingPrevious(previousData, currentData) {
    return ownersMatch(previousData, currentData) ? previousData : null;
  }

  function migrateSnapshot(data) {
    if (!data || Number(data.schemaVersion) >= 4) {
      return data || null;
    }

    return attachOwner({
      ...data,
      schemaVersion: 4,
      needsAcademicModelRefresh: true,
      courses: (data.courses || []).map((course) => ({
        ...course,
        performance: course.performance || null
      }))
    });
  }

  function normalizeMode(value) {
    return value === PERSONAL_MODE || value === PUBLIC_MODE ? value : "";
  }

  function normalizeSemesterFocus(value) {
    const focus = Number(value) || 0;
    return [0, 1, 2].includes(focus) ? focus : 0;
  }

  function normalizeUiPreferences(value) {
    const semesterFocusByYear = {};
    Object.entries(value?.semesterFocusByYear || {}).forEach(([year, focus]) => {
      const normalizedYear = String(year || "").trim();
      if (/^\d{4}$/.test(normalizedYear)) {
        semesterFocusByYear[normalizedYear] = normalizeSemesterFocus(focus);
      }
    });
    return { semesterFocusByYear };
  }

  async function getUiPreferences() {
    const result = await readArea("local", [UI_PREFERENCES_KEY]);
    return normalizeUiPreferences(result[UI_PREFERENCES_KEY]);
  }

  async function setSemesterFocus(year, focus) {
    const normalizedYear = String(year || "").trim();
    if (!/^\d{4}$/.test(normalizedYear)) {
      throw new Error("Ano letivo inválido para salvar o período em foco.");
    }

    const preferences = await getUiPreferences();
    preferences.semesterFocusByYear[normalizedYear] = normalizeSemesterFocus(focus);
    const saved = await writeArea("local", { [UI_PREFERENCES_KEY]: preferences });
    if (!saved) {
      throw new Error("Não foi possível salvar o período em foco.");
    }
    return preferences;
  }

  async function getPrivacyState() {
    const result = await readArea("local", [PRIVACY_KEY]);
    const stored = result[PRIVACY_KEY] || {};

    return {
      deviceMode: normalizeMode(stored.deviceMode),
      onboardingVersion: Number(stored.onboardingVersion) || 0
    };
  }

  function getEffectiveMode(deviceMode, incognito) {
    return incognito ? PUBLIC_MODE : normalizeMode(deviceMode);
  }

  async function getContext({ incognito = false } = {}) {
    const privacy = await getPrivacyState();

    return {
      incognito: Boolean(incognito),
      deviceMode: privacy.deviceMode,
      mode: getEffectiveMode(privacy.deviceMode, incognito)
    };
  }

  function getDataLocation(context) {
    if (context?.mode === PUBLIC_MODE) {
      return {
        areaName: "session",
        key: `${SESSION_DATA_PREFIX}${context.incognito ? "incognito" : "regular"}`
      };
    }

    return {
      areaName: "local",
      key: DATA_KEY
    };
  }

  async function loadData(context) {
    const location = getDataLocation(context);

    if (location.areaName === "local") {
      const result = await readArea("local", [DATA_KEY, PREVIOUS_DATA_KEY, LEGACY_DATA_KEY]);
      if (result[DATA_KEY]) {
        return result[DATA_KEY];
      }

      const migrated = migrateSnapshot(result[PREVIOUS_DATA_KEY] || result[LEGACY_DATA_KEY]);
      if (migrated) {
        await writeArea("local", { [DATA_KEY]: migrated });
      }
      return migrated;
    }

    const previousKey = `${PREVIOUS_SESSION_DATA_PREFIX}${context.incognito ? "incognito" : "regular"}`;
    const result = await readArea(location.areaName, [location.key, previousKey]);
    if (result[location.key]) {
      return result[location.key];
    }

    const migrated = migrateSnapshot(result[previousKey]);
    if (migrated) {
      await writeArea(location.areaName, { [location.key]: migrated });
    }
    return migrated;
  }

  async function saveData(context, data) {
    const location = getDataLocation(context);
    return writeArea(location.areaName, {
      [location.key]: attachOwner({
        ...data,
        schemaVersion: 4,
        needsAcademicModelRefresh: Boolean(data?.needsAcademicModelRefresh)
      })
    });
  }

  async function removeCurrentData(context) {
    const location = getDataLocation(context);
    return removeFromArea(location.areaName, location.key);
  }

  function isAcademicLocalKey(key) {
    return (
      key === DATA_KEY ||
      key === PREVIOUS_DATA_KEY ||
      key === LEGACY_DATA_KEY ||
      key.startsWith(LEGACY_SNAPSHOT_PREFIX) ||
      key.startsWith(SESSION_DATA_PREFIX) ||
      key.startsWith(PREVIOUS_SESSION_DATA_PREFIX)
    );
  }

  async function clearAreaByPredicate(areaName, predicate) {
    const values = await readArea(areaName, null);
    const keys = Object.keys(values).filter(predicate);
    return removeFromArea(areaName, keys);
  }

  async function clearAcademicData() {
    const [localCleared, sessionCleared] = await Promise.all([
      clearAreaByPredicate("local", isAcademicLocalKey),
      clearAreaByPredicate("session", (key) =>
        key.startsWith(SESSION_DATA_PREFIX) || key.startsWith(PREVIOUS_SESSION_DATA_PREFIX)
      )
    ]);

    return localCleared && sessionCleared;
  }

  async function migrateLegacyToPersonal() {
    const values = await readArea("local", null);
    const existing = values[DATA_KEY];
    const legacy = values[PREVIOUS_DATA_KEY] || values[LEGACY_DATA_KEY];

    if (!existing && legacy) {
      const migrated = await writeArea("local", { [DATA_KEY]: migrateSnapshot(legacy) });

      if (!migrated) {
        throw new Error("Não foi possível migrar os dados salvos.");
      }
    }

    const obsoleteKeys = Object.keys(values).filter(
      (key) => key === PREVIOUS_DATA_KEY || key === LEGACY_DATA_KEY || key.startsWith(LEGACY_SNAPSHOT_PREFIX)
    );
    const removed = await removeFromArea("local", obsoleteKeys);

    if (!removed) {
      throw new Error("Não foi possível concluir a migração dos dados.");
    }
  }

  async function setDeviceMode(mode) {
    const normalizedMode = normalizeMode(mode);

    if (!normalizedMode) {
      throw new Error("Modo de privacidade invalido.");
    }

    if (normalizedMode === PUBLIC_MODE) {
      const cleared = await clearAcademicData();

      if (!cleared) {
        throw new Error("Não foi possível apagar os dados antes de ativar o modo compartilhado.");
      }
    } else {
      const sessionCleared = await clearAreaByPredicate(
        "session",
        (key) => key.startsWith(SESSION_DATA_PREFIX) || key.startsWith(PREVIOUS_SESSION_DATA_PREFIX)
      );

      if (!sessionCleared) {
        throw new Error("Não foi possível limpar os dados temporários.");
      }

      await migrateLegacyToPersonal();
    }

    const saved = await writeArea("local", {
      [PRIVACY_KEY]: {
        deviceMode: normalizedMode,
        onboardingVersion: 1
      }
    });

    if (!saved) {
      throw new Error("Não foi possível salvar a preferência de privacidade.");
    }

    return normalizedMode;
  }

  async function restrictStorageAccess() {
    const areas = [getArea("local"), getArea("session")].filter(Boolean);

    await Promise.all(areas.map(async (area) => {
      if (typeof area.setAccessLevel !== "function") {
        return;
      }

      try {
        await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
      } catch (error) {
        console.warn("[InfoSIGAA] Não foi possível restringir o armazenamento:", error?.message || error);
      }
    }));
  }

  const api = {
    DATA_KEY,
    LEGACY_DATA_KEY,
    LEGACY_SNAPSHOT_PREFIX,
    PREVIOUS_DATA_KEY,
    PREVIOUS_SESSION_DATA_PREFIX,
    PERSONAL_MODE,
    PRIVACY_KEY,
    PUBLIC_MODE,
    SESSION_DATA_PREFIX,
    UI_PREFERENCES_KEY,
    attachOwner,
    clearAcademicData,
    extractOwner,
    getContext,
    getEffectiveMode,
    getMatchingPrevious,
    getPrivacyState,
    getUiPreferences,
    loadData,
    migrateLegacyToPersonal,
    migrateSnapshot,
    normalizeEnrollment,
    normalizeUiPreferences,
    ownersMatch,
    removeCurrentData,
    restrictStorageAccess,
    saveData,
    setSemesterFocus,
    setDeviceMode
  };

  globalThis.InfoSigaaPrivacyStorage = api;

  if (typeof module !== "undefined") {
    module.exports = api;
  }
})();
