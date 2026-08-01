(function () {
  "use strict";

  const NOTICE_ID = "sigaa-grade-monitor-notice";

  function removeExistingNotice(documentRef) {
    const existing = documentRef.getElementById(NOTICE_ID);

    if (existing) {
      existing.remove();
    }
  }

  function createBaseNotice(documentRef, variant) {
    const notice = documentRef.createElement("section");
    notice.id = NOTICE_ID;
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");

    const palette =
      variant === "warning"
        ? {
            border: "#b45309",
            background: "#fffbeb",
            text: "#451a03"
          }
        : {
            border: "#2563eb",
            background: "#eff6ff",
            text: "#172554"
          };

    Object.assign(notice.style, {
      boxSizing: "border-box",
      width: "calc(100% - 24px)",
      margin: "12px",
      padding: "12px 14px",
      border: `1px solid ${palette.border}`,
      borderRadius: "6px",
      background: palette.background,
      color: palette.text,
      font: "14px/1.4 Arial, Helvetica, sans-serif",
      position: "relative",
      zIndex: "2147483647"
    });

    return notice;
  }

  function appendTitle(documentRef, notice, text) {
    const title = documentRef.createElement("strong");
    title.textContent = text;
    title.style.display = "block";
    title.style.marginBottom = "4px";
    notice.appendChild(title);
  }

  function appendText(documentRef, notice, text) {
    const paragraph = documentRef.createElement("p");
    paragraph.textContent = text;
    paragraph.style.margin = "0";
    notice.appendChild(paragraph);
  }

  function describeItem(item) {
    const parts = [item.subject, item.assessment || item.unit, item.grade, item.status]
      .filter(Boolean)
      .slice(0, 4);
    return parts.join(" - ") || item.rawText || "Linha de nota";
  }

  function describeChange(change) {
    const previousGrade = change.previous.grade || change.previous.status || change.previous.rawText || "";
    const currentGrade = change.current.grade || change.current.status || change.current.rawText || "";
    const label = [change.current.subject, change.current.assessment || change.current.unit]
      .filter(Boolean)
      .join(" - ");

    if (previousGrade || currentGrade) {
      return `${label || "Nota"}: ${previousGrade || "sem valor"} -> ${currentGrade || "sem valor"}`;
    }

    return describeItem(change.current);
  }

  function appendChangesList(documentRef, notice, diff) {
    const list = documentRef.createElement("ul");
    list.style.margin = "8px 0 0";
    list.style.paddingLeft = "20px";

    diff.added.slice(0, 5).forEach((item) => {
      const listItem = documentRef.createElement("li");
      listItem.textContent = `Nova nota: ${describeItem(item)}`;
      list.appendChild(listItem);
    });

    diff.changed.slice(0, 5).forEach((change) => {
      const listItem = documentRef.createElement("li");
      listItem.textContent = `Nota alterada: ${describeChange(change)}`;
      list.appendChild(listItem);
    });

    const hiddenCount = diff.added.length + diff.changed.length - list.children.length;

    if (hiddenCount > 0) {
      const listItem = documentRef.createElement("li");
      listItem.textContent = `Mais ${hiddenCount} mudanca(s) omitida(s).`;
      list.appendChild(listItem);
    }

    notice.appendChild(list);
  }

  function insertNotice(documentRef, notice) {
    const target =
      documentRef.querySelector("#conteudo, #content, main, body") ||
      documentRef.documentElement;

    target.insertBefore(notice, target.firstChild);
  }

  function showFirstSnapshotNotice(documentRef, itemCount) {
    removeExistingNotice(documentRef);

    const notice = createBaseNotice(documentRef, "info");
    appendTitle(documentRef, notice, "Monitor de Notas SIGAA");
    appendText(
      documentRef,
      notice,
      `Primeiro snapshot local registrado com ${itemCount} item(ns). As proximas visitas serao comparadas com este estado.`
    );
    insertNotice(documentRef, notice);
  }

  function showNoTableNotice(documentRef) {
    removeExistingNotice(documentRef);

    const notice = createBaseNotice(documentRef, "warning");
    appendTitle(documentRef, notice, "Monitor de Notas SIGAA");
    appendText(documentRef, notice, "Nao encontrei uma tabela de notas nesta pagina.");
    insertNotice(documentRef, notice);
  }

  function showChangesNotice(documentRef, diff) {
    removeExistingNotice(documentRef);

    const notice = createBaseNotice(documentRef, "warning");
    appendTitle(documentRef, notice, "Mudancas detectadas nas notas");
    appendText(
      documentRef,
      notice,
      `${diff.added.length} nova(s) nota(s) e ${diff.changed.length} nota(s) alterada(s) desde o snapshot anterior.`
    );
    appendChangesList(documentRef, notice, diff);
    insertNotice(documentRef, notice);
  }

  globalThis.SigaaGradeNotice = {
    showChangesNotice,
    showFirstSnapshotNotice,
    showNoTableNotice
  };
})();
