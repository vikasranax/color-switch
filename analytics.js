(() => {
  const LOG = "[Analytics]";
  let lastState = null;

  function sendEvent(name) {
    try {
      if (window.goatcounter && typeof window.goatcounter.count === "function") {
        window.goatcounter.count({
          path: "event-" + name,
          title: name,
          event: true
        });

        console.log(LOG, name);
      }
    } catch (error) {
      // Ignore analytics errors
    }
  }

  setInterval(() => {
    const api = window.ColorSwitchBlast;

    if (!api || typeof api.getState !== "function") return;

    const state = api.getState();

    if (!state || state.state === lastState) return;

    lastState = state.state;

    if (state.state === "playing") {
      sendEvent("game-start");
    }

    if (state.state === "gameover") {
      sendEvent("game-over");
    }
  }, 250);
})();