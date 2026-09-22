(function () {
  "use strict";

  const instances = new Set();

  function makeResetButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "exhibit-reset";
    button.setAttribute("aria-label", "Начать заново");
    button.title = "Начать заново";
    button.innerHTML = `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path class="exhibit-reset__ring" d="M25.8 11.2A11.2 11.2 0 1 0 27 18" />
        <path d="M26 5.8v6.6h-6.6" />
      </svg>`;
    return button;
  }

  function mount(options = {}) {
    document.documentElement.classList.add("exhibit-ui");

    const timeout = Number(options.timeout ?? document.body?.dataset.inactivityTimeout ?? 60000);
    const enabled = options.controls !== false;
    const reset = typeof options.reset === "function" ? options.reset : () => window.location.reload();
    const activityEvents = ["pointerdown", "pointermove", "touchstart", "keydown", "wheel"];
    let timer = 0;
    let lastMove = 0;
    let button = null;

    const restartTimer = (event) => {
      if (event?.type === "pointermove") {
        const now = performance.now();
        if (now - lastMove < 900) return;
        lastMove = now;
      }
      window.clearTimeout(timer);
      if (Number.isFinite(timeout) && timeout > 0) {
        timer = window.setTimeout(() => invokeReset("idle"), timeout);
      }
    };

    const invokeReset = (reason = "button") => {
      window.clearTimeout(timer);
      button?.classList.add("is-resetting");
      try {
        reset(reason);
      } finally {
        window.setTimeout(() => button?.classList.remove("is-resetting"), 520);
        restartTimer();
      }
    };

    if (enabled) {
      button = makeResetButton();
      button.addEventListener("click", () => invokeReset("button"));
      document.body.append(button);
    }

    activityEvents.forEach((eventName) => window.addEventListener(eventName, restartTimer, { passive: true }));
    restartTimer();

    const instance = {
      reset: invokeReset,
      restartTimer,
      destroy() {
        window.clearTimeout(timer);
        activityEvents.forEach((eventName) => window.removeEventListener(eventName, restartTimer));
        button?.remove();
        instances.delete(instance);
      }
    };
    instances.add(instance);
    return instance;
  }

  window.ExhibitUI = { mount, instances };
})();
