const assert = require("assert");

function createArea(initial = {}) {
  const values = { ...initial };

  return {
    values,
    accessLevel: "",
    get(keys, callback) {
      if (keys == null) {
        callback({ ...values });
        return;
      }

      const requested = Array.isArray(keys) ? keys : [keys];
      const result = {};
      requested.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          result[key] = values[key];
        }
      });
      callback(result);
    },
    set(nextValues, callback) {
      Object.assign(values, nextValues);
      callback?.();
    },
    remove(keys, callback) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete values[key]);
      callback?.();
    },
    async setAccessLevel({ accessLevel }) {
      this.accessLevel = accessLevel;
    }
  };
}

const legacyKey = "sigaa-grade-monitor:data:v2";
const legacySnapshotKey = "sigaa-grade-monitor:snapshot:v1:https://sig.example/notas";
const legacyData = {
  ok: true,
  courses: [
    {
      courseId: "A",
      enrollment: "000.000.000-00",
      studentName: "ALUNO TESTE",
      periods: []
    }
  ]
};
const local = createArea({
  [legacyKey]: legacyData,
  [legacySnapshotKey]: { items: [] }
});
const session = createArea();

global.chrome = {
  runtime: {},
  storage: { local, session }
};

const storage = require("../src/privacy-storage.js");

function dataFor(enrollment, courseId = "A") {
  return {
    ok: true,
    updatedAt: "2026-08-04T12:00:00.000Z",
    courses: [
      {
        courseId,
        enrollment,
        studentName: `ALUNO ${enrollment}`,
        periods: []
      }
    ]
  };
}

async function run() {
  assert.strictEqual(storage.getEffectiveMode("personal", true), storage.PUBLIC_MODE);
  assert.strictEqual(storage.getEffectiveMode("personal", false), storage.PERSONAL_MODE);

  assert.deepStrictEqual(await storage.getAutoRefreshState(), {
    autoRefreshEnabled: false,
    autoRefreshConfigured: false,
    autoRefreshOnboardingPending: false
  });
  await storage.markAutoRefreshOnboardingPending();
  assert.deepStrictEqual(await storage.getAutoRefreshState(), {
    autoRefreshEnabled: false,
    autoRefreshConfigured: false,
    autoRefreshOnboardingPending: true
  });
  await storage.setAutoRefreshEnabled(true);
  assert.deepStrictEqual(await storage.getAutoRefreshState(), {
    autoRefreshEnabled: true,
    autoRefreshConfigured: true,
    autoRefreshOnboardingPending: false
  });

  await storage.setDeviceMode(storage.PERSONAL_MODE);
  assert.strictEqual(local.values[storage.PRIVACY_KEY].deviceMode, storage.PERSONAL_MODE);
  assert.strictEqual(local.values[legacyKey], undefined);
  assert.strictEqual(local.values[legacySnapshotKey], undefined);
  assert.strictEqual(local.values[storage.DATA_KEY].owner.enrollment, "00000000000");

  const firstStudent = dataFor("0000000000");
  const sameStudent = dataFor("000.000.000-0", "B");
  const otherStudent = dataFor("00000000000");
  assert.strictEqual(storage.ownersMatch(firstStudent, sameStudent), true);
  assert.strictEqual(storage.getMatchingPrevious(firstStudent, otherStudent), null);

  await storage.saveData({ mode: storage.PERSONAL_MODE, incognito: false }, firstStudent);
  assert.strictEqual(local.values[storage.DATA_KEY].owner.enrollment, "0000000000");

  await storage.setDeviceMode(storage.PUBLIC_MODE);
  assert.strictEqual(local.values[storage.DATA_KEY], undefined);
  assert.strictEqual(local.values[storage.PRIVACY_KEY].deviceMode, storage.PUBLIC_MODE);

  const publicContext = { mode: storage.PUBLIC_MODE, incognito: false };
  const incognitoContext = { mode: storage.PUBLIC_MODE, incognito: true };
  await storage.saveData(publicContext, firstStudent);
  await storage.saveData(incognitoContext, otherStudent);
  assert.strictEqual((await storage.loadData(publicContext)).owner.enrollment, "0000000000");
  assert.strictEqual((await storage.loadData(incognitoContext)).owner.enrollment, "00000000000");
  assert.strictEqual(local.values[storage.DATA_KEY], undefined);

  await storage.restrictStorageAccess();
  assert.strictEqual(local.accessLevel, "TRUSTED_CONTEXTS");
  assert.strictEqual(session.accessLevel, "TRUSTED_CONTEXTS");

  await storage.clearAcademicData();
  assert.strictEqual(await storage.loadData(publicContext), null);
  assert.strictEqual(await storage.loadData(incognitoContext), null);
  assert.strictEqual(local.values[storage.PRIVACY_KEY].deviceMode, storage.PUBLIC_MODE);
  assert.strictEqual(local.values[storage.SETTINGS_KEY].autoRefreshEnabled, true);

  delete local.values[storage.SETTINGS_KEY];
  await storage.initializeAutoRefreshForExistingUser();
  assert.deepStrictEqual(await storage.getAutoRefreshState(), {
    autoRefreshEnabled: false,
    autoRefreshConfigured: true,
    autoRefreshOnboardingPending: false
  });

  console.log("privacy-storage-smoke-ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
