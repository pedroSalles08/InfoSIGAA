(function () {
  "use strict";

  const GRADE_WORDS = [
    "nota",
    "notas",
    "media",
    "média",
    "situacao",
    "situação",
    "resultado",
    "avaliacao",
    "avaliação"
  ];

  const SUBJECT_WORDS = [
    "disciplina",
    "componente",
    "curricular",
    "turma",
    "materia",
    "matéria"
  ];

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKeyPart(value) {
    return normalizeText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s.-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function includesAny(text, words) {
    const normalized = normalizeKeyPart(text);
    return words.some((word) => normalized.includes(normalizeKeyPart(word)));
  }

  function collectCellTexts(row, selector) {
    return Array.from(row.querySelectorAll(selector))
      .map((cell) => normalizeText(cell.innerText || cell.textContent))
      .filter(Boolean);
  }

  function getTableHeaders(table) {
    const explicitHeaders = collectCellTexts(table, "thead th");

    if (explicitHeaders.length > 0) {
      return explicitHeaders;
    }

    const firstRow = table.querySelector("tr");

    if (!firstRow) {
      return [];
    }

    const firstRowHeaders = collectCellTexts(firstRow, "th");
    return firstRowHeaders.length > 0 ? firstRowHeaders : [];
  }

  function scoreTable(table) {
    const tableText = normalizeText(table.innerText || table.textContent);
    const headers = getTableHeaders(table).join(" ");
    const rows = table.querySelectorAll("tr").length;
    let score = 0;

    if (rows > 1) {
      score += 2;
    }

    if (includesAny(headers, GRADE_WORDS)) {
      score += 4;
    }

    if (includesAny(headers, SUBJECT_WORDS)) {
      score += 3;
    }

    if (includesAny(tableText, GRADE_WORDS)) {
      score += 2;
    }

    if (includesAny(tableText, SUBJECT_WORDS)) {
      score += 1;
    }

    return score;
  }

  function findLikelyGradesTable(documentRef) {
    const tables = Array.from(documentRef.querySelectorAll("table"));

    return tables
      .map((table) => ({ table, score: scoreTable(table) }))
      .filter((candidate) => candidate.score >= 3)
      .sort((a, b) => b.score - a.score)[0]?.table || null;
  }

  function findHeaderIndex(headers, words) {
    return headers.findIndex((header) => includesAny(header, words));
  }

  function getFieldByHeader(headers, cells, words) {
    const index = findHeaderIndex(headers, words);
    return index >= 0 ? cells[index] || "" : "";
  }

  function buildFallbackSubject(cells) {
    return cells.find((cell) => !/^\d+([,.]\d+)?$/.test(cell)) || cells[0] || "";
  }

  function buildFallbackGrade(cells) {
    return (
      cells.find((cell) => /^\d+([,.]\d+)?$/.test(cell)) ||
      cells.find((cell) => /\b(aprovado|reprovado|trancado|dispensado)\b/i.test(cell)) ||
      ""
    );
  }

  function buildItemKey(item, rowIndex) {
    const stableParts = [
      item.subject,
      item.assessment,
      item.unit,
      item.period
    ].filter(Boolean);

    if (stableParts.length > 0) {
      return normalizeKeyPart(stableParts.join(" | "));
    }

    const fallbackParts = item.cells.slice(0, 3).filter(Boolean);
    return normalizeKeyPart(fallbackParts.join(" | ") || `linha-${rowIndex + 1}`);
  }

  function rowLooksLikeHeader(row) {
    const hasDataCells = row.querySelectorAll("td").length > 0;
    const hasHeaderCells = row.querySelectorAll("th").length > 0;
    return hasHeaderCells && !hasDataCells;
  }

  function parseGradesFromDocument(documentRef) {
    const table = findLikelyGradesTable(documentRef);

    if (!table) {
      return {
        tableFound: false,
        items: []
      };
    }

    const headers = getTableHeaders(table);
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    const rows = bodyRows.length > 0 ? bodyRows : Array.from(table.querySelectorAll("tr"));

    const items = rows
      .filter((row) => !rowLooksLikeHeader(row))
      .map((row, rowIndex) => {
        const cells = collectCellTexts(row, "td, th");

        if (cells.length === 0) {
          return null;
        }

        const item = {
          subject:
            getFieldByHeader(headers, cells, ["disciplina", "componente", "curricular", "materia", "matéria"]) ||
            buildFallbackSubject(cells),
          assessment:
            getFieldByHeader(headers, cells, ["avaliacao", "avaliação", "atividade", "descricao", "descrição"]) ||
            "",
          unit: getFieldByHeader(headers, cells, ["unidade", "bimestre", "semestre", "etapa"]) || "",
          period: getFieldByHeader(headers, cells, ["periodo", "período", "ano"]) || "",
          grade: getFieldByHeader(headers, cells, ["nota", "media", "média", "conceito"]) || buildFallbackGrade(cells),
          status: getFieldByHeader(headers, cells, ["situacao", "situação", "resultado", "status"]) || "",
          rawText: normalizeText(cells.join(" | ")),
          cells
        };

        return {
          ...item,
          key: buildItemKey(item, rowIndex)
        };
      })
      .filter(Boolean);

    return {
      tableFound: true,
      items
    };
  }

  function isLikelyGradesPage(documentRef, locationLike) {
    const url = `${locationLike.pathname || ""}${locationLike.search || ""}`;
    const title = normalizeText(documentRef.title);
    const headingText = Array.from(documentRef.querySelectorAll("h1, h2, h3, legend, caption"))
      .map((element) => normalizeText(element.innerText || element.textContent))
      .join(" ");
    const pageHints = `${url} ${title} ${headingText}`;

    if (/vernota|ver-nota|ver_nota/i.test(url)) {
      return true;
    }

    if (/ver notas?/i.test(pageHints)) {
      return true;
    }

    const parsed = parseGradesFromDocument(documentRef);
    return parsed.tableFound && parsed.items.length > 0;
  }

  globalThis.SigaaGradeParser = {
    isLikelyGradesPage,
    normalizeText,
    parseGradesFromDocument
  };
})();
