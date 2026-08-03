(async function () {
  "use strict";

  const parser = globalThis.SigaaGradeParser;
  const storage = globalThis.SigaaGradeStorage;
  const diff = globalThis.SigaaGradeDiff;
  const notice = globalThis.SigaaGradeNotice;

  if (!parser || !storage || !diff || !notice) {
    console.warn("[InfoSIGAA] Modulos da extensao nao foram carregados.");
    return;
  }

  if (!parser.isLikelyGradesPage(document, location)) {
    return;
  }

  const parsed = parser.parseGradesFromDocument(document);

  if (!parsed.tableFound || parsed.items.length === 0) {
    notice.showNoTableNotice(document);
    return;
  }

  const snapshot = {
    capturedAt: new Date().toISOString(),
    page: {
      origin: location.origin,
      pathname: location.pathname,
      title: parser.normalizeText(document.title)
    },
    items: parsed.items
  };

  const snapshotKey = storage.getSnapshotKey(location);
  const previousSnapshot = await storage.loadSnapshot(snapshotKey);

  if (!previousSnapshot) {
    await storage.saveSnapshot(snapshotKey, snapshot);
    notice.showFirstSnapshotNotice(document, snapshot.items.length);
    return;
  }

  const comparison = diff.compareSnapshots(previousSnapshot, snapshot);
  await storage.saveSnapshot(snapshotKey, snapshot);

  if (comparison.hasChanges) {
    notice.showChangesNotice(document, comparison);
  }
})();
