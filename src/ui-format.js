(function () {
  "use strict";

  function formatNumber(value, maximumFractionDigits = 1) {
    return Number.isFinite(Number(value))
      ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(Number(value))
      : "—";
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const day = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
    const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
    return `${day} às ${time}`;
  }

  function formatUpdatedAt(value, emptyText = "Nenhuma atualização") {
    const formatted = formatDateTime(value);
    return formatted ? `Atualizado em ${formatted}` : emptyText;
  }

  const api = { formatDateTime, formatNumber, formatUpdatedAt };
  globalThis.InfoSigaaUiFormat = api;
  if (typeof module !== "undefined") module.exports = api;
})();
