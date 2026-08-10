(() => {
  const LOG_PREFIX = "[PlayablesBridge]";

  const bridge = {
    sdk: null,
    sdkName: "none",
    readySent: false,
    lastState: null
  };

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function callSdkMethod(names, payload, withPayload = false) {
    if (!bridge.sdk) {
      return false;
    }

    for (const name of names) {
      const fn = bridge.sdk[name];

      if (typeof fn === "function") {
        try {
          if (withPayload) {
            fn.call(bridge.sdk, payload);
          } else {
            fn.call(bridge.sdk);
          }

          log(`Called SDK method: ${name}`, withPayload ? payload : "");
          return true;
        } catch (error) {
          warn(`SDK method ${name} failed`, error);
        }
      }
    }

    return false;
  }

  function detectSdk() {
    const candidates = [
      { name: "YTPlayables", sdk: window.YTPlayables },
      { name: "PlayablesSDK", sdk: window.PlayablesSDK },
      { name: "YouTubePlayables", sdk: window.YouTubePlayables },
      { name: "YoutubePlayables", sdk: window.YoutubePlayables },
      { name: "ytPlayables", sdk: window.ytPlayables },
      { name: "playables", sdk: window.playables },
      { name: "ysdk", sdk: window.ysdk },
      { name: "YT", sdk: window.YT }
    ];

    for (const candidate of candidates) {
      if (candidate.sdk) {
        return candidate;
      }
    }

    return null;
  }

  function bindSdkEvents(sdk) {
    const pause = () => window.ColorSwitchBlast?.pause?.();
    const resume = () => window.ColorSwitchBlast?.resume?.();
    const restart = () => window.ColorSwitchBlast?.restart?.();

    const events = {
      pause,
      gamePause: pause,
      appPause: pause,
      resume,
      gameResume: resume,
      appResume: resume,
      restart,
      gameRestart: restart
    };

    if (typeof sdk.addEventListener === "function") {
      Object.entries(events).forEach(([eventName, handler]) => {
        try {
          sdk.addEventListener(eventName, handler);
        } catch {
          // Ignore unsupported event
        }
      });
    }

    if (typeof sdk.on === "function") {
      Object.entries(events).forEach(([eventName, handler]) => {
        try {
          sdk.on(eventName, handler);
        } catch {
          // Ignore unsupported event
        }
      });
    }

    Object.entries(events).forEach(([eventName, handler]) => {
      const callbackName = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;

      if (!(callbackName in sdk)) {
        try {
          sdk[callbackName] = handler;
        } catch {
          // Ignore unsupported callback
        }
      }
    });
  }

  function notifyReady() {
    if (bridge.readySent) {
      return;
    }

    bridge.readySent = true;
    log("Game ready");

    callSdkMethod([
      "gameReady",
      "ready",
      "setReady",
      "loadingComplete",
      "setLoadingComplete",
      "onGameReady"
    ]);
  }

  function notifyGameStart() {
    log("Game started");

    callSdkMethod([
      "gameStarted",
      "startGame",
      "onGameStart"
    ]);
  }

  function notifyGameOver(state) {
    log("Game over", state);

    callSdkMethod([
      "gameOver",
      "endGame",
      "gameEnded",
      "onGameOver"
    ], {
      score: state.score,
      best: state.best,
      combo: state.combo,
      maxCombo: state.maxCombo
    }, true);

    callSdkMethod([
      "submitScore",
      "setScore",
      "reportScore",
      "updateScore"
    ], state.score, true);

    callSdkMethod([
      "saveData",
      "saveGame",
      "save"
    ], {
      score: state.score,
      best: state.best,
      settings: state.settings
    }, true);
  }

  function startStateWatcher() {
    setInterval(() => {
      const api = window.ColorSwitchBlast;

      if (!api || typeof api.getState !== "function") {
        return;
      }

      const state = api.getState();

      if (!state) {
        return;
      }

      if (bridge.lastState === state.state) {
        return;
      }

      bridge.lastState = state.state;
      log("State changed:", state.state);

      if (state.state === "playing") {
        notifyGameStart();
      }

      if (state.state === "gameover") {
        notifyGameOver(state);
      }
    }, 250);
  }

  function init() {
    const found = detectSdk();

    if (found) {
      bridge.sdk = found.sdk;
      bridge.sdkName = found.name;
      bindSdkEvents(found.sdk);
      log(`Detected SDK: ${found.name}`);
    } else {
      log("No official SDK detected. Running in standalone web mode.");
    }

    window.addEventListener("color-switch-blast:ready", notifyReady);

    // Fallback in case the ready event was missed.
    setTimeout(notifyReady, 3000);

    startStateWatcher();
  }

  window.PlayablesBridge = {
    get sdkName() {
      return bridge.sdkName;
    },
    notifyReady,
    pause() {
      window.ColorSwitchBlast?.pause?.();
    },
    resume() {
      window.ColorSwitchBlast?.resume?.();
    },
    restart() {
      window.ColorSwitchBlast?.restart?.();
    }
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();