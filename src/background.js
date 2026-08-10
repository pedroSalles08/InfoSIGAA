importScripts("privacy-storage.js", "sigaa-parser.js", "snapshot.js", "sigaa-fetcher.js");

globalThis.InfoSigaaPrivacyStorage.restrictStorageAccess();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "refreshGrades") {
    return false;
  }

  globalThis.InfoSigaaPrivacyStorage.getContext({
    incognito: Boolean(message.activePage?.incognito)
  })
    .then((privacyContext) =>
      globalThis.SigaaFetcher.refreshAllGrades(message.activePage || null, privacyContext)
    )
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
