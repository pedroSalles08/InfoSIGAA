importScripts("sigaa-parser.js", "snapshot.js", "sigaa-fetcher.js");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "refreshGrades") {
    return false;
  }

  globalThis.SigaaFetcher.refreshAllGrades(message.activePage || null)
    .then((data) => {
      sendResponse({ ok: true, data });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message || "Falha ao atualizar notas."
      });
    });

  return true;
});
