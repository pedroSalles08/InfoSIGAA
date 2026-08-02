(function () {
  "use strict";

  document.documentElement.classList.add("js");

  const toggle = document.querySelector("[data-nav-toggle]");
  const navigation = document.querySelector("[data-site-nav]");

  function closeNavigation(restoreFocus) {
    if (!toggle || !navigation) {
      return;
    }

    toggle.setAttribute("aria-expanded", "false");
    navigation.removeAttribute("data-open");

    if (restoreFocus) {
      toggle.focus();
    }
  }

  if (toggle && navigation) {
    toggle.addEventListener("click", function () {
      const willOpen = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(willOpen));

      if (willOpen) {
        navigation.setAttribute("data-open", "true");
      } else {
        navigation.removeAttribute("data-open");
      }
    });

    navigation.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        closeNavigation(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        closeNavigation(true);
      }
    });

    document.addEventListener("click", function (event) {
      if (
        toggle.getAttribute("aria-expanded") === "true" &&
        !navigation.contains(event.target) &&
        !toggle.contains(event.target)
      ) {
        closeNavigation(false);
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 820) {
        closeNavigation(false);
      }
    });
  }

  document.querySelectorAll("[data-current-year]").forEach(function (element) {
    element.textContent = String(new Date().getFullYear());
  });
})();
