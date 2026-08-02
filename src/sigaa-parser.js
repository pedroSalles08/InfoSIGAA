(function () {
  "use strict";

  const ENTITY_MAP = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
    Aacute: "A",
    aacute: "a",
    Acirc: "A",
    acirc: "a",
    Agrave: "A",
    agrave: "a",
    Atilde: "A",
    atilde: "a",
    Ccedil: "C",
    ccedil: "c",
    Eacute: "E",
    eacute: "e",
    Ecirc: "E",
    ecirc: "e",
    Iacute: "I",
    iacute: "i",
    Oacute: "O",
    oacute: "o",
    Ocirc: "O",
    ocirc: "o",
    Otilde: "O",
    otilde: "o",
    Uacute: "U",
    uacute: "u"
  };

  function decodeHtml(value) {
    return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === "#") {
        const isHex = entity[1]?.toLowerCase() === "x";
        const codePoint = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }

      return Object.prototype.hasOwnProperty.call(ENTITY_MAP, entity)
        ? ENTITY_MAP[entity]
        : match;
    });
  }

  function normalizeText(value) {
    return decodeHtml(value)
      .replace(/\r?\n|\t/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKey(value) {
    return normalizeText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s.-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeComparableText(value) {
    return normalizeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function stripHiddenElements(html) {
    return String(html || "")
      .replace(/<[^>]+\b(?:hidden|aria-hidden=["']?true["']?)[^>]*>[\s\S]*?<\/[^>]+>/gi, " ")
      .replace(/<[^>]+\bstyle=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, " ");
  }

  function stripTags(html) {
    return normalizeText(
      String(html || "")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    );
  }

  function stripVisibleTags(html) {
    return stripTags(stripHiddenElements(html));
  }

  function getAttr(tag, attrName) {
    const pattern = new RegExp(`${attrName}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
    const match = String(tag || "").match(pattern);
    return decodeHtml(match?.[2] || match?.[3] || match?.[4] || "");
  }

  function matchAll(html, pattern) {
    return Array.from(String(html || "").matchAll(pattern));
  }

  function extractFormHtml(html, formId) {
    const escaped = formId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`<form\\b[^>]*(?:id|name)=["']${escaped}["'][\\s\\S]*?<\\/form>`, "i");
    return String(html || "").match(pattern)?.[0] || "";
  }

  function extractHiddenInputs(formHtml) {
    const inputs = {};

    matchAll(formHtml, /<input\b[^>]*>/gi).forEach(([tag]) => {
      const type = getAttr(tag, "type").toLowerCase();
      const name = getAttr(tag, "name");

      if (!name || type !== "hidden") {
        return;
      }

      inputs[name] = getAttr(tag, "value");
    });

    return inputs;
  }

  function extractViewState(html, formId) {
    const formHtml = formId ? extractFormHtml(html, formId) : "";
    const source = formHtml || html;
    const inputs = extractHiddenInputs(source);
    return inputs["javax.faces.ViewState"] || "";
  }

  function extractFormAction(html, formId) {
    const formHtml = extractFormHtml(html, formId);
    const openTag = formHtml.match(/<form\b[^>]*>/i)?.[0] || "";
    return getAttr(openTag, "action") || "/sigaa/ava/index.jsf";
  }

  function parseJsfParams(onclick) {
    const params = {};
    const paramsBlock = String(onclick || "").match(/jsfcljs\s*\([^,]+,\s*\{([\s\S]*?)\}\s*,/i)?.[1];

    if (!paramsBlock) {
      return params;
    }

    matchAll(paramsBlock, /'([^']+)'\s*:\s*'([^']*)'/g).forEach(([, key, value]) => {
      params[decodeHtml(key)] = decodeHtml(value);
    });

    return params;
  }

  function parseFormIdFromOnclick(onclick, fallback) {
    return (
      String(onclick || "").match(/document\.getElementById\(['"]([^'"]+)['"]\)/i)?.[1] ||
      fallback
    );
  }

  function parseCourseTitle(rawTitle) {
    const title = normalizeText(rawTitle);
    const code = title.match(/^(\d{5,})\s*-/)?.[1] || "";
    const nameMatch = title.match(/^\d{5,}\s*-\s*(.*?)(?:\s*\(\d+h\)|\s*\(\d{4}\)|$)/i);
    const name = normalizeText(nameMatch?.[1] || title);
    const year = title.match(/\((20\d{2})\)/)?.[1] || "";

    return {
      code,
      name,
      year,
      rawTitle: title
    };
  }

  function extractCourses(html) {
    const anchors = matchAll(html, /<a\b[^>]*class=["'][^"']*\blinkTurma\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi);
    const seen = new Set();

    return anchors
      .map(([anchor]) => {
        const openTag = anchor.match(/<a\b[^>]*>/i)?.[0] || "";
        const onclick = getAttr(openTag, "onclick");
        const params = parseJsfParams(onclick);
        const frontEndIdTurma = params.frontEndIdTurma || "";
        const jsfAction = Object.keys(params).find((key) => key !== "frontEndIdTurma") || "";
        const title = parseCourseTitle(stripTags(anchor));

        if (!frontEndIdTurma || !jsfAction || !title.rawTitle || seen.has(frontEndIdTurma)) {
          return null;
        }

        seen.add(frontEndIdTurma);

        return {
          courseId: frontEndIdTurma,
          code: title.code,
          name: title.name,
          year: title.year,
          rawTitle: title.rawTitle,
          formId: parseFormIdFromOnclick(onclick, "formTurma"),
          actionParam: jsfAction,
          params
        };
      })
      .filter(Boolean);
  }

  function extractPortalCourses(html) {
    const forms = matchAll(
      html,
      /<form\b[^>]*(?:id|name)=["'](form_acessarTurmaVirtual[^"']*)["'][\s\S]*?<\/form>/gi
    );
    const seen = new Set();

    return forms
      .map(([formHtml, formId]) => {
        const anchor = formHtml.match(/<a\b[^>]*>[\s\S]*?<\/a>/i)?.[0] || "";
        const openTag = anchor.match(/<a\b[^>]*>/i)?.[0] || "";
        const onclick = getAttr(openTag, "onclick");
        const params = parseJsfParams(onclick);
        const frontEndIdTurma = params.frontEndIdTurma || "";
        const jsfAction = Object.keys(params).find((key) => key !== "frontEndIdTurma") || "";
        const name = stripTags(anchor);

        if (!frontEndIdTurma || !jsfAction || !name || seen.has(frontEndIdTurma)) {
          return null;
        }

        seen.add(frontEndIdTurma);

        return {
          courseId: frontEndIdTurma,
          code: "",
          name,
          year: "",
          rawTitle: name,
          formId,
          actionParam: jsfAction,
          params,
          source: "portal-discente"
        };
      })
      .filter(Boolean);
  }

  function extractVerNotasAction(html) {
    const anchors = matchAll(html, /<a\b[^>]*>[\s\S]*?<\/a>/gi);

    for (const [anchor] of anchors) {
      if (normalizeKey(stripTags(anchor)) !== "ver notas") {
        continue;
      }

      const openTag = anchor.match(/<a\b[^>]*>/i)?.[0] || "";
      const onclick = getAttr(openTag, "onclick");
      const params = parseJsfParams(onclick);
      const actionParam = Object.keys(params)[0] || "";

      if (!actionParam) {
        continue;
      }

      return {
        formId: parseFormIdFromOnclick(onclick, "formMenu"),
        actionParam,
        params
      };
    }

    return null;
  }

  function extractCurrentCourse(html) {
    const source = String(html || "");
    const codeTag = source.match(/<[^>]+\bid=["']linkCodigoTurma["'][^>]*>[\s\S]*?<\/[^>]+>/i)?.[0] || "";
    const nameTag = source.match(/<[^>]+\bid=["']linkNomeTurma["'][^>]*>[\s\S]*?<\/[^>]+>/i)?.[0] || "";
    const code = stripTags(codeTag).match(/\d{5,}/)?.[0] || "";
    const name = stripTags(nameTag).replace(/^\d{5,}\s*-\s*/, "").trim();

    if (code || name) {
      return {
        code,
        name,
        rawTitle: [code, name].filter(Boolean).join(" - ")
      };
    }

    const text = stripTags(source);
    const printedTitle = text.match(/Turma:\s*(\d{5,})\s*-\s*([^(]+?)\s*\(/i);

    if (printedTitle) {
      const parsedName = normalizeText(printedTitle[2]);

      return {
        code: printedTitle[1],
        name: parsedName,
        rawTitle: `${printedTitle[1]} - ${parsedName}`
      };
    }

    const headerTitle = text.match(/(\d{5,})\s*-\s*([A-ZÀ-Ú0-9\s]+?)\s*-\s*T[0-9A-Z]/i);

    if (!headerTitle) {
      return null;
    }

    const parsedName = normalizeText(headerTitle[2]);

    return {
      code: headerTitle[1],
      name: parsedName,
      rawTitle: `${headerTitle[1]} - ${parsedName}`
    };
  }

  function parseNumber(value) {
    const normalized = String(value || "").replace(",", ".").trim();
    if (!normalized) {
      return null;
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function findAttendanceRatio(text) {
    const normalized = normalizeComparableText(text);
    const explicit = normalized.match(/aulas\s*\(\s*ministradas\s*\/\s*total\s*\)\s*:?\s*(\d{1,4})\s*\/\s*(\d{1,4})/i);

    if (explicit) {
      return {
        aulasMinistradas: Number(explicit[1]),
        aulasTotal: Number(explicit[2])
      };
    }

    const markerIndex = normalized.indexOf("carga horaria ministrada");
    const source = markerIndex >= 0
      ? normalized.slice(Math.max(0, markerIndex - 300), markerIndex + 80)
      : normalized;
    const generic = source.match(/(?:^|[^\d/])(\d{1,4})\s+\/\s+(\d{1,4})(?!\d|\/)/);

    if (!generic) {
      return null;
    }

    return {
      aulasMinistradas: Number(generic[1]),
      aulasTotal: Number(generic[2])
    };
  }

  function findAttendancePercent(html, text) {
    const normalized = normalizeComparableText(text);
    const markerIndex = normalized.indexOf("carga horaria ministrada");

    if (markerIndex >= 0) {
      const source = normalized.slice(Math.max(0, markerIndex - 160), markerIndex + 80);
      const visiblePercent = source.match(/(\d+(?:[,.]\d+)?)%/);
      const parsedVisiblePercent = parseNumber(visiblePercent?.[1]);

      if (parsedVisiblePercent != null) {
        return parsedVisiblePercent;
      }
    }

    const progressMatch = String(html || "").match(
      /<div\b[^>]*class=["'][^"']*\bprogress-bar\b[^"']*["'][^>]*(?:style=["'][^"']*width\s*:\s*(\d+(?:[,.]\d+)?)%|aria-valuenow=["'](\d+(?:[,.]\d+)?)["'])/i
    );

    return parseNumber(progressMatch?.[1] || progressMatch?.[2]);
  }

  function extractAttendance(html) {
    const visibleText = stripTags(html);
    const ratio = findAttendanceRatio(visibleText);

    if (!ratio || !ratio.aulasTotal) {
      return null;
    }

    const parsedPercent = findAttendancePercent(html, visibleText);
    const percentualCargaMinistrada = parsedPercent != null
      ? parsedPercent
      : (ratio.aulasMinistradas / ratio.aulasTotal) * 100;

    return {
      aulasMinistradas: ratio.aulasMinistradas,
      aulasTotal: ratio.aulasTotal,
      percentualCargaMinistrada
    };
  }

  function extractTableNear(html, markerText) {
    const normalizedMarker = normalizeKey(markerText);
    const lowerHtml = String(html || "").toLowerCase();
    let markerIndex = lowerHtml.indexOf(String(markerText || "").toLowerCase());

    if (markerIndex < 0) {
      const textIndex = normalizeKey(stripTags(html)).indexOf(normalizedMarker);
      if (textIndex < 0) {
        return "";
      }

      markerIndex = 0;
    }

    const before = String(html).slice(0, markerIndex);
    const start = before.toLowerCase().lastIndexOf("<table");
    const end = String(html).toLowerCase().indexOf("</table>", markerIndex);

    if (start < 0 || end < 0) {
      return "";
    }

    return String(html).slice(start, end + "</table>".length);
  }

  function parsePositiveInteger(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function extractEvaluationMetadata(tableHtml) {
    const metadata = new Map();

    matchAll(tableHtml, /<input\b[^>]*>/gi).forEach(([tag]) => {
      const id = getAttr(tag, "id");
      const match = id.match(/^(abrevAval|denAval)_(.+)$/);

      if (!match) {
        return;
      }

      const [, type, evaluationId] = match;
      const current = metadata.get(evaluationId) || {};

      if (type === "abrevAval") {
        current.sigla = getAttr(tag, "value");
      } else if (type === "denAval") {
        current.nomeCompleto = getAttr(tag, "value");
      }

      metadata.set(evaluationId, current);
    });

    return metadata;
  }

  function cleanTooltipText(value) {
    return stripTags(String(value || "").replace(/\\x3C/gi, "<").replace(/\\x3E/gi, ">"));
  }

  function decodeJsString(value) {
    return decodeHtml(String(value || ""))
      .replace(/\\'/g, "'")
      .replace(/\\"/g, "\"")
      .replace(/\\n|\\r|\\t/g, " ");
  }

  function collectTooltipCandidates(cellHtml, visibleText) {
    const candidates = [];
    const preferredAttrs = [
      "title",
      "alt",
      "aria-label",
      "data-title",
      "data-original-title",
      "data-tooltip",
      "data-content",
      "data-qtip"
    ];

    matchAll(cellHtml, /<[^>]+>/gi).forEach(([tag]) => {
      preferredAttrs.forEach((attrName) => {
        const value = getAttr(tag, attrName);
        if (value) {
          candidates.push(value);
        }
      });

      ["onmouseover", "onmouseenter", "data-onmouseover"].forEach((attrName) => {
        const value = getAttr(tag, attrName);
        if (!value) {
          return;
        }

        matchAll(value, /'((?:\\'|[^']){2,})'|"((?:\\"|[^"]){2,})"/g).forEach(([, single, double]) => {
          candidates.push(decodeJsString(single || double || ""));
        });
      });
    });

    const allText = stripTags(cellHtml);
    if (allText && allText !== visibleText) {
      candidates.push(allText.replace(visibleText, " "));
    }

    return candidates
      .map(cleanTooltipText)
      .filter((text) => text && text !== visibleText && normalizeKey(text) !== normalizeKey(visibleText))
      .filter((text, index, list) => list.findIndex((item) => normalizeKey(item) === normalizeKey(text)) === index);
  }

  function parseCellObjects(rowHtml, evaluationMetadata) {
    return matchAll(rowHtml, /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi).map(([cellHtml, tagName, attrs, innerHtml]) => {
      const openTag = `<${tagName}${attrs || ""}>`;
      const cellId = getAttr(openTag, "id");
      const evaluationId = cellId.match(/^aval_(.+)$/)?.[1] || "";
      const evaluation = evaluationId ? evaluationMetadata?.get(evaluationId) : null;
      const visibleText = stripVisibleTags(innerHtml);

      return {
        id: 0,
        elementId: cellId,
        tagName: tagName.toLowerCase(),
        html: cellHtml,
        innerHtml,
        text: evaluation?.sigla || visibleText,
        allText: stripTags(innerHtml),
        colspan: parsePositiveInteger(getAttr(openTag, "colspan"), 1),
        rowspan: parsePositiveInteger(getAttr(openTag, "rowspan"), 1),
        tooltipCandidates: [
          evaluation?.nomeCompleto || "",
          ...collectTooltipCandidates(cellHtml, evaluation?.sigla || visibleText)
        ].filter(Boolean),
        evaluationId,
        evaluation
      };
    });
  }

  function parseCells(rowHtml) {
    return parseCellObjects(rowHtml, new Map()).map((cell) => cell.text);
  }

  function parseRows(tableHtml) {
    return matchAll(tableHtml, /<tr\b[^>]*>[\s\S]*?<\/tr>/gi)
      .map(([row]) => parseCells(row))
      .filter((cells) => cells.length > 0);
  }

  function parseTableGrid(tableHtml) {
    const rows = matchAll(tableHtml, /<tr\b[^>]*>[\s\S]*?<\/tr>/gi);
    const evaluationMetadata = extractEvaluationMetadata(tableHtml);
    const grid = [];
    let nextCellId = 1;

    rows.forEach(([rowHtml], rowIndex) => {
      const cells = parseCellObjects(rowHtml, evaluationMetadata);
      grid[rowIndex] = grid[rowIndex] || [];
      let columnIndex = 0;

      cells.forEach((cell) => {
        cell.id = nextCellId++;

        while (grid[rowIndex][columnIndex]) {
          columnIndex++;
        }

        for (let rowOffset = 0; rowOffset < cell.rowspan; rowOffset++) {
          const targetRow = rowIndex + rowOffset;
          grid[targetRow] = grid[targetRow] || [];

          for (let columnOffset = 0; columnOffset < cell.colspan; columnOffset++) {
            grid[targetRow][columnIndex + columnOffset] = {
              cell,
              originRow: rowIndex,
              originColumn: columnIndex,
              isOrigin: rowOffset === 0 && columnOffset === 0
            };
          }
        }

        columnIndex += cell.colspan;
      });
    });

    return grid;
  }

  function splitStudentIdentity(identity) {
    const text = normalizeText(identity);
    const match = text.match(/^(\d{5,})\s+(.+)$/);

    return {
      enrollment: match?.[1] || "",
      studentName: match?.[2] || text
    };
  }

  function isEnrollment(value) {
    return /^\d{5,}$/.test(normalizeText(value));
  }

  function getStudentIdentity(cells) {
    const firstCell = normalizeText(cells[0] || "");
    const combinedIdentity = splitStudentIdentity(firstCell);

    if (combinedIdentity.enrollment && combinedIdentity.studentName) {
      return {
        ...combinedIdentity,
        gradeStartIndex: 1
      };
    }

    if (isEnrollment(firstCell)) {
      return {
        enrollment: firstCell,
        studentName: normalizeText(cells[1] || ""),
        gradeStartIndex: 2
      };
    }

    return {
      ...combinedIdentity,
      gradeStartIndex: 1
    };
  }

  function rowLooksLikeStudent(cells) {
    return (
      cells.length >= 4 &&
      (/^\d{5,}\s+/.test(cells[0] || "") || isEnrollment(cells[0]))
    );
  }

  function valueOrEmpty(value) {
    const text = normalizeText(value);
    return text === "--" ? "" : text;
  }

  function grade(label, value) {
    return {
      label,
      value: valueOrEmpty(value),
      rawValue: normalizeText(value)
    };
  }

  function isIdentityHeader(text) {
    const key = normalizeKey(text);
    return key === "matricula" || key === "nome" || key === "matricula nome";
  }

  function isTableTitleHeader(text) {
    return normalizeKey(text) === "alunos matriculados";
  }

  function isSummaryHeader(text) {
    const key = normalizeKey(text);
    return (
      key === "media anual" ||
      key === "media" ||
      key === "resultado" ||
      key === "faltas" ||
      key === "sit" ||
      key === "situacao"
    );
  }

  function summaryKeyFromHeader(text) {
    const key = normalizeKey(text);

    if (key === "media anual" || key === "media") {
      return "mediaAnual";
    }

    if (key === "resultado") {
      return "resultado";
    }

    if (key === "faltas") {
      return "faltas";
    }

    if (key === "sit" || key === "situacao") {
      return "situacao";
    }

    return "";
  }

  function isPeriodHeader(text) {
    const key = normalizeKey(text);
    return (
      key.includes("semestre") ||
      key.includes("bimestre") ||
      key.includes("unidade") ||
      key.includes("etapa") ||
      key === "exame" ||
      key.includes("recuperacao")
    );
  }

  function normalizePeriodName(text) {
    return normalizeText(text)
      .replace(/\b1o\b/i, "1º")
      .replace(/\b2o\b/i, "2º")
      .replace(/\b3o\b/i, "3º")
      .replace(/\b4o\b/i, "4º");
  }

  function normalizePeriodKey(text) {
    return normalizeKey(text)
      .replace(/\b([1-4])o\b/g, "$1")
      .replace(/\b([1-4])\b/g, "$1");
  }

  function getExpandedRowTexts(gridRow) {
    return (gridRow || []).map((slot) => slot?.cell?.text || "");
  }

  function getHeaderChain(grid, studentRowIndex, columnIndex) {
    const headers = [];
    const seen = new Set();

    for (let rowIndex = 0; rowIndex < studentRowIndex; rowIndex++) {
      const slot = grid[rowIndex]?.[columnIndex];
      const cell = slot?.cell;

      if (!cell || seen.has(cell.id)) {
        continue;
      }

      seen.add(cell.id);

      if (!cell.text && cell.tooltipCandidates.length === 0) {
        continue;
      }

      headers.push(cell);
    }

    return headers;
  }

  function isUsefulAssessmentHeader(cell, periodText) {
    const text = normalizeText(cell?.text || "");

    return (
      text &&
      !isTableTitleHeader(text) &&
      !isIdentityHeader(text) &&
      !isSummaryHeader(text) &&
      normalizePeriodKey(text) !== normalizePeriodKey(periodText)
    );
  }

  function getPeriodFromHeaders(headers) {
    const explicit = [...headers].reverse().find((cell) => isPeriodHeader(cell.text));

    if (explicit) {
      return normalizePeriodName(explicit.text);
    }

    const grouped = [...headers]
      .reverse()
      .find((cell) => cell.colspan > 1 && !isTableTitleHeader(cell.text) && !isIdentityHeader(cell.text) && !isSummaryHeader(cell.text));

    return grouped ? normalizePeriodName(grouped.text) : "Notas";
  }

  function getAssessmentHeader(headers, periodText) {
    return [...headers].reverse().find((cell) => isUsefulAssessmentHeader(cell, periodText)) || null;
  }

  function getFullAssessmentName(headerCell, periodCell) {
    const candidates = [
      ...(headerCell?.tooltipCandidates || []),
      ...(periodCell?.tooltipCandidates || [])
    ];

    return candidates[0] || "";
  }

  function getPeriodCell(headers, periodText) {
    return headers.find((cell) => normalizePeriodKey(cell.text) === normalizePeriodKey(periodText)) || null;
  }

  function parseGenericGradeRow(tableHtml) {
    const grid = parseTableGrid(tableHtml);
    const studentRowIndex = grid.findIndex((row) => rowLooksLikeStudent(getExpandedRowTexts(row)));

    if (studentRowIndex < 0) {
      return null;
    }

    const studentCells = getExpandedRowTexts(grid[studentRowIndex]);
    const { gradeStartIndex, ...identity } = getStudentIdentity(studentCells);
    const periodsByName = new Map();
    const summary = {};
    let fallbackGradeCount = 1;

    for (let columnIndex = gradeStartIndex; columnIndex < studentCells.length; columnIndex++) {
      const value = studentCells[columnIndex];
      const headers = getHeaderChain(grid, studentRowIndex, columnIndex);
      const summaryKey = headers.map((cell) => summaryKeyFromHeader(cell.text)).find(Boolean);

      if (summaryKey) {
        summary[summaryKey] = valueOrEmpty(value);
        continue;
      }

      const periodName = getPeriodFromHeaders(headers);
      const periodCell = getPeriodCell(headers, periodName);
      const assessmentHeader = getAssessmentHeader(headers, periodName);
      const label = assessmentHeader?.text || `Nota ${fallbackGradeCount++}`;

      if (!periodsByName.has(periodName)) {
        periodsByName.set(periodName, {
          name: periodName,
          grades: []
        });
      }

      periodsByName.get(periodName).grades.push({
        label,
        sigla: label,
        nomeCompleto: getFullAssessmentName(assessmentHeader, periodCell),
        periodo: periodName,
        value: valueOrEmpty(value),
        valor: valueOrEmpty(value),
        rawValue: normalizeText(value)
      });
    }

    return {
      ...identity,
      periods: Array.from(periodsByName.values()).filter((period) => period.grades.length > 0),
      summary,
      rawCells: studentCells
    };
  }

  function parseSpecificGradeRow(cells) {
    const { gradeStartIndex, ...identity } = getStudentIdentity(cells);
    const firstSemesterLabels = ["FE", "CE", "TL", "PE", "Cap", "Nota"];
    let index = gradeStartIndex;

    const firstSemester = firstSemesterLabels.map((label) => grade(label, cells[index++]));
    const secondSemester = [grade("Nota", cells[index++])];
    const exam = [grade("Nota", cells[index++])];

    return {
      ...identity,
      periods: [
        {
          name: "1o Semestre",
          grades: firstSemester
        },
        {
          name: "2o Semestre",
          grades: secondSemester
        },
        {
          name: "Exame",
          grades: exam
        }
      ],
      summary: {
        mediaAnual: valueOrEmpty(cells[index++]),
        resultado: valueOrEmpty(cells[index++]),
        faltas: valueOrEmpty(cells[index++]),
        situacao: valueOrEmpty(cells[index++])
      },
      rawCells: cells
    };
  }

  function parseFallbackGradeRow(cells) {
    const { gradeStartIndex, ...identity } = getStudentIdentity(cells);
    return {
      ...identity,
      periods: [
        {
          name: "Notas",
          grades: cells.slice(gradeStartIndex).map((value, index) => grade(`Campo ${index + 1}`, value))
        }
      ],
      summary: {},
      rawCells: cells
    };
  }

  function extractCourseTitleFromGradesPage(html, fallbackCourse) {
    const marker = "Alunos Matriculados";
    const markerIndex = String(html || "").toLowerCase().indexOf(marker.toLowerCase());
    const beforeMarker = markerIndex >= 0 ? String(html).slice(0, markerIndex) : String(html || "");
    const titleCandidates = matchAll(beforeMarker, /<(?:h1|h2|h3|h4|strong|b)\b[^>]*>[\s\S]*?<\/(?:h1|h2|h3|h4|strong|b)>/gi)
      .map(([candidate]) => stripTags(candidate))
      .filter((text) => /^\d{5,}\s*-/.test(text));
    const parsed = parseCourseTitle(titleCandidates.at(-1) || fallbackCourse?.rawTitle || "");

    return {
      courseId: fallbackCourse?.courseId || parsed.code || normalizeKey(parsed.rawTitle),
      code: parsed.code || fallbackCourse?.code || "",
      name: parsed.name || fallbackCourse?.name || "",
      year: parsed.year || fallbackCourse?.year || "",
      rawTitle: parsed.rawTitle || fallbackCourse?.rawTitle || ""
    };
  }

  function parseGradesPage(html, fallbackCourse) {
    const tableHtml = extractTableNear(html, "Alunos Matriculados");
    const course = extractCourseTitleFromGradesPage(html, fallbackCourse);

    if (!tableHtml) {
      return {
        tableFound: false,
        course,
        studentName: "",
        enrollment: "",
        periods: [],
        summary: {},
        rawRows: []
      };
    }

    const rows = parseRows(tableHtml);
    const dataRow = rows.find(rowLooksLikeStudent);

    if (!dataRow) {
      return {
        tableFound: true,
        hasGrades: false,
        course,
        studentName: "",
        enrollment: "",
        periods: [],
        summary: {},
        rawRows: rows
      };
    }

    const parsedRow = parseGenericGradeRow(tableHtml) || (
      dataRow.length >= 12
        ? parseSpecificGradeRow(dataRow)
        : parseFallbackGradeRow(dataRow)
    );

    return {
      tableFound: true,
      hasGrades: true,
      course,
      ...parsedRow,
      rawRows: rows
    };
  }

  function isAuthenticationPage(html, responseUrl, status) {
    if (Number(status) === 401 || Number(status) === 403) {
      return true;
    }

    const normalizedUrl = String(responseUrl || "").toLowerCase();
    const authenticationUrlPatterns = [
      /\/vertelalogin(?:\.[a-z0-9]+)?(?:[/?#]|$)/,
      /\/(?:login|signin|logar|autenticar)(?:[/.?#-]|$)/,
      /\/sso(?:[/.?#-]|$)/,
      /\/oauth2\/authorization(?:[/?#]|$)/,
      /\/auth\/(?:login|realms)(?:[/?#]|$)/
    ];

    if (authenticationUrlPatterns.some((pattern) => pattern.test(normalizedUrl))) {
      return true;
    }

    const source = String(html || "");
    const text = normalizeKey(stripTags(source));
    const expiredMarkers = [
      "sessao expirada",
      "sua sessao expirou",
      "sessao foi expirada",
      "sessao invalida",
      "sessao encerrada",
      "nao esta autenticado",
      "usuario nao autenticado",
      "autenticacao necessaria",
      "autenticacao requerida",
      "faca login novamente",
      "efetue o login",
      "realize o login novamente",
      "viewexpiredexception"
    ];

    if (expiredMarkers.some((marker) => text.includes(marker))) {
      return true;
    }

    const hasPasswordInput = /<input\b[^>]*\btype=["']?password["']?[^>]*>/i.test(source);
    const hasUserInput = /<input\b[^>]*(?:\bname|\bid)=["'][^"']*(?:usuario|username|login)[^"']*["'][^>]*>/i.test(source);
    const hasLoginLanguage = text.includes("entrar") || text.includes("acessar") || text.includes("login");

    return hasPasswordInput && (hasUserInput || hasLoginLanguage);
  }

  function isLoginPage(html) {
    return isAuthenticationPage(html, "", 200);
  }

  function buildFormPayload(html, formId, params) {
    const formHtml = extractFormHtml(html, formId);
    const hiddenInputs = extractHiddenInputs(formHtml);

    return {
      [formId]: formId,
      ...hiddenInputs,
      ...params
    };
  }

  globalThis.SigaaParser = {
    buildFormPayload,
    decodeHtml,
    extractCourses,
    extractCurrentCourse,
    extractFormAction,
    extractAttendance,
    extractPortalCourses,
    extractVerNotasAction,
    extractViewState,
    isAuthenticationPage,
    isLoginPage,
    normalizeText,
    parseGradesPage,
    parseJsfParams,
    stripTags
  };

  if (typeof module !== "undefined") {
    module.exports = globalThis.SigaaParser;
  }
})();
