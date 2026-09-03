(function () {
  "use strict";

  const BLOCKED_EVENTS = [
    "click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup",
    "auxclick", "contextmenu", "touchstart", "touchmove", "touchend", "wheel",
    "keydown", "keypress", "keyup", "beforeinput", "input", "change", "submit", "dragstart",
    "focus", "focusin"
  ];
  let locked = false;
  let overlayHost = null;
  let overlayPending = false;
  let currentRefreshId = "";

  function phaseText(status) {
    if (status?.phase === "verifying_session") return "Verificando a sessão do SIGAA";
    if (status?.phase === "saving") return "Salvando os dados";
    if (status?.phase === "collecting_course") {
      const progress = status.totalCourses
        ? `${status.completedCourses} de ${status.totalCourses}`
        : "";
      return [status.currentCourseName || "Coletando disciplina", progress].filter(Boolean).join(" · ");
    }
    return "Preparando a atualização";
  }

  function isOverlayEvent(event) {
    return Boolean(overlayHost && event.composedPath?.().includes(overlayHost));
  }

  function blockEvent(event) {
    if (!locked || isOverlayEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  BLOCKED_EVENTS.forEach((eventName) => {
    globalThis.addEventListener(eventName, blockEvent, { capture: true, passive: false });
  });

  function ensureOverlay() {
    if (globalThis.top !== globalThis || overlayHost) return;
    if (!document.documentElement) {
      if (overlayPending) return;
      overlayPending = true;
      document.addEventListener("DOMContentLoaded", () => {
        overlayPending = false;
        if (locked) ensureOverlay();
      }, { once: true });
      return;
    }
    overlayHost = document.createElement("div");
    overlayHost.id = "infosigaa-update-lock";
    const root = overlayHost.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; background: rgb(10 10 10 / 86%); color: #ececec; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
        .panel { width: min(420px, 100%); padding: 20px; border: 1px solid rgb(255 255 255 / 16%); border-radius: 10px; background: #202020; }
        h1 { margin: 0 0 8px; color: #fff; font-size: 18px; line-height: 1.25; }
        p { margin: 0; color: #a3a3a3; }
        .progress { margin-top: 14px; color: #ececec; }
        button { width: 100%; min-height: 34px; margin-top: 16px; border: 1px solid rgb(255 255 255 / 16%); border-radius: 7px; background: transparent; color: #ececec; cursor: pointer; font: inherit; font-weight: 650; }
        button:hover { background: rgb(255 255 255 / 8%); }
        button:focus-visible { outline: 2px solid #ececec; outline-offset: 2px; }
      </style>
      <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="title">
        <section class="panel">
          <h1 id="title">Atualização do InfoSIGAA em andamento</h1>
          <p>Não use o SIGAA até a atualização terminar.</p>
          <p class="progress" id="progress" aria-live="polite">Preparando a atualização</p>
          <button id="cancel" type="button">Cancelar atualização</button>
        </section>
      </div>`;
    overlayHost._progress = root.getElementById("progress");
    root.getElementById("cancel").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "cancelRefresh", refreshId: currentRefreshId }).catch(() => {});
    });
    document.documentElement.appendChild(overlayHost);
  }

  function applyLock(shouldLock, status) {
    locked = Boolean(shouldLock);
    currentRefreshId = status?.refreshId || "";

    if (globalThis.top !== globalThis) return;
    if (locked) {
      ensureOverlay();
      if (overlayHost) {
        overlayHost.hidden = false;
        overlayHost._progress.textContent = phaseText(status);
      }
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } else if (overlayHost) {
      overlayHost.remove();
      overlayHost = null;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "setSigaaInteractionLock") applyLock(message.locked, message.status);
  });

  chrome.runtime.sendMessage({ type: "sigaaLockReady" })
    .then((response) => applyLock(response?.locked, response?.status))
    .catch(() => applyLock(false));
})();
