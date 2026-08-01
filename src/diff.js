(function () {
  "use strict";

  const TRACKED_FIELDS = ["subject", "assessment", "unit", "period", "grade", "status", "rawText"];

  function indexByKey(items) {
    return new Map(items.map((item) => [item.key, item]));
  }

  function getChangedFields(previousItem, currentItem) {
    return TRACKED_FIELDS.filter((field) => {
      return String(previousItem[field] || "") !== String(currentItem[field] || "");
    });
  }

  function compareSnapshots(previousSnapshot, currentSnapshot) {
    const previousItems = Array.isArray(previousSnapshot?.items) ? previousSnapshot.items : [];
    const currentItems = Array.isArray(currentSnapshot?.items) ? currentSnapshot.items : [];
    const previousByKey = indexByKey(previousItems);
    const added = [];
    const changed = [];

    currentItems.forEach((currentItem) => {
      const previousItem = previousByKey.get(currentItem.key);

      if (!previousItem) {
        added.push(currentItem);
        return;
      }

      const changedFields = getChangedFields(previousItem, currentItem);

      if (changedFields.length > 0) {
        changed.push({
          key: currentItem.key,
          previous: previousItem,
          current: currentItem,
          fields: changedFields
        });
      }
    });

    return {
      added,
      changed,
      hasChanges: added.length > 0 || changed.length > 0
    };
  }

  globalThis.SigaaGradeDiff = {
    compareSnapshots
  };
})();
