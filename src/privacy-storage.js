(function () {
  "use strict";

  const PERSONAL_MODE = "personal";
  const PUBLIC_MODE = "public";
  const PRIVACY_KEY = "infosigaa:privacy:v1";
  const DATA_KEY = "sigaa-grade-monitor:data:v3";
  const LEGACY_DATA_KEY = "sigaa-grade-monitor:data:v2";
  const LEGACY_SNAPSHOT_PREFIX = "sigaa-grade-monitor:snapshot:v1:";
  const SESSION_DATA_PREFIX = "infosigaa:session:data:v3:";

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

  function normalizeMode(value) {
    return value === PERSONAL_MODE || value === PUBLIC_MODE ? value : "";
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
      const result = await readArea("local", [DATA_KEY, LEGACY_DATA_KEY]);
      return result[DATA_KEY] || result[LEGACY_DATA_KEY] || null;
    }

    const result = await readArea(location.areaName, [location.key]);
    return result[location.key] || null;
  }

  async function saveData(context, data) {
    const location = getDataLocation(context);
    return writeArea(location.areaName, { [location.key]: attachOwner(data) });
  }

  async function removeCurrentData(context) {
    const location = getDataLocation(context);
    return removeFromArea(location.areaName, location.key);
  }

  function isAcademicLocalKey(key) {
    return (
      key === DATA_KEY ||
      key === LEGACY_DATA_KEY ||
      key.startsWith(LEGACY_SNAPSHOT_PREFIX) ||
      key.startsWith(SESSION_DATA_PREFIX)
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
      clearAreaByPredicate("session", (key) => key.startsWith(SESSION_DATA_PREFIX))
    ]);

    return localCleared && sessionCleared;
  }

  async function migrateLegacyToPersonal() {
    const values = await readArea("local", null);
    const existing = values[DATA_KEY];
    const legacy = values[LEGACY_DATA_KEY];

    if (!existing && legacy) {
      const migrated = await writeArea("local", { [DATA_KEY]: attachOwner(legacy) });

      if (!migrated) {
        throw new Error("Nao foi possivel migrar os dados salvos.");
      }
    }

    const obsoleteKeys = Object.keys(values).filter(
      (key) => key === LEGACY_DATA_KEY || key.startsWith(LEGACY_SNAPSHOT_PREFIX)
    );
    const removed = await removeFromArea("local", obsoleteKeys);

    if (!removed) {
      throw new Error("Nao foi possivel concluir a migracao dos dados.");
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
        throw new Error("Nao foi possivel apagar os dados antes de ativar o modo compartilhado.");
      }
    } else {
      const sessionCleared = await clearAreaByPredicate(
        "session",
        (key) => key.startsWith(SESSION_DATA_PREFIX)
      );

      if (!sessionCleared) {
        throw new Error("Nao foi possivel limpar os dados temporarios.");
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
      throw new Error("Nao foi possivel salvar a preferencia de privacidade.");
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
        console.warn("[InfoSIGAA] Nao foi possivel restringir o armazenamento:", error?.message || error);
      }
    }));
  }

  const api = {
    DATA_KEY,
    LEGACY_DATA_KEY,
    LEGACY_SNAPSHOT_PREFIX,
    PERSONAL_MODE,
    PRIVACY_KEY,
    PUBLIC_MODE,
    SESSION_DATA_PREFIX,
    attachOwner,
    clearAcademicData,
    extractOwner,
    getContext,
    getEffectiveMode,
    getMatchingPrevious,
    getPrivacyState,
    loadData,
    migrateLegacyToPersonal,
    normalizeEnrollment,
    ownersMatch,
    removeCurrentData,
    restrictStorageAccess,
    saveData,
    setDeviceMode
  };

  globalThis.InfoSigaaPrivacyStorage = api;

  if (typeof module !== "undefined") {
    module.exports = api;
  }
})();
