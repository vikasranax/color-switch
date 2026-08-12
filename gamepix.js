(() => {
  const LOG = "[GamePixBridge]";
  const AD_EVERY_GAMEOVERS = 2;

  let sdk = null;
  let sdkReady = false;
  let adOpen = false;
  let gameovers = 0;
  let lastState = null;
  let lastScore = -1;
  let lastLevel = -1;
  let lastComboBucket = 0;

  function log(...args) {
    console.log(LOG, ...args);
  }

  function detectSdk() {
    return window.GamePix || window.gamepix || null;
  }

  function call(name, args = []) {
    if (!sdk) return undefined;

    const fn = sdk[name];

    if (typeof fn !== "function") {
      return undefined;
    }

    try {
      const result = fn.apply(sdk, args);
      log("Called GamePix." + name + "()");
      return result;
    } catch (error) {
      console.warn(LOG, "GamePix." + name + " failed", error);
      return undefined;
    }
  }

  function pauseGame() {
    if (window.ColorSwitchBlast) window.ColorSwitchBlast.pause();
  }

  function resumeGame() {
    if (window.ColorSwitchBlast) window.ColorSwitchBlast.resume();
  }

  function bindEvents() {
    const on = (name, handler) => {
      try {
        if (typeof sdk.addEventListener === "function") {
          sdk.addEventListener(name, handler);
        } else if (typeof sdk.on === "function") {
          sdk.on(name, handler);
        }
      } catch (error) {
        // Event system not supported
      }
    };

    on("pause", pauseGame);
    on("resume", resumeGame);
  }

  function sdkInitCalls() {
    const lang = call("lang");

    if (lang && typeof lang.then === "function") {
      lang.then((l) => log("Player language:", l)).catch(() => {});
    } else if (lang) {
      log("Player language:", lang);
    }

    call("getItem", ["csb-best"]);
  }

  function showInterstitial() {
    if (!sdk || adOpen) return;

    adOpen = true;
    pauseGame();

    const done = () => {
      adOpen = false;
    };

    const result = call("presentAd") || call("interstitialAd");

    if (result && typeof result.then === "function") {
      result.then(done).catch(done);
    } else {
      setTimeout(done, 100);
    }
  }

  function showRewardAd() {
    if (!sdk || adOpen) return Promise.resolve(false);

    adOpen = true;
    pauseGame();

    return new Promise((resolve) => {
      const done = (ok) => {
        adOpen = false;
        resolve(ok);
      };

      const result = call("presentRewardAd") || call("rewardAd");

      if (result && typeof result.then === "function") {
        result
          .then((res) => done(!!(res && (res.success || res.rewarded))))
          .catch(() => done(false));
      } else {
        done(false);
      }
    });
  }

  function onScoreChange(score) {
    call("updateScore", [score]);

    const level = 1 + Math.floor(score / 10);

    if (level !== lastLevel) {
      lastLevel = level;
      call("updateLevel", [level]);
    }
  }

  function onGameOver(state) {
    gameovers += 1;

    call("setItem", ["csb-best", String(state.best)]);

    if (state.score > 0 && state.score === state.best) {
      call("happyMoment");
    }

    if (gameovers % AD_EVERY_GAMEOVERS === 0) {
      setTimeout(showInterstitial, 600);
    }
  }

  function startWatcher() {
    setInterval(() => {
      const api = window.ColorSwitchBlast;

      if (!api || typeof api.getState !== "function") return;

      const state = api.getState();

      if (!state) return;

      if (state.state === "playing") {
        if (state.score !== lastScore) {
          lastScore = state.score;

          if (sdk) onScoreChange(state.score);
        }

        const bucket = Math.floor(state.combo / 5);

        if (bucket > lastComboBucket) {
          lastComboBucket = bucket;

          if (sdk) call("happyMoment");
        }
      } else {
        lastComboBucket = 0;

        if (state.state === "menu") {
          lastScore = -1;
          lastLevel = -1;
        }
      }

      if (state.state === lastState) return;

      const prev = lastState;
      lastState = state.state;

      log("State changed:", state.state);

      if (!sdk) return;

      if (state.state === "paused") {
        call("pause");
      }

      if (state.state === "playing" && prev === "paused") {
        call("resume");
      }

      if (state.state === "gameover") {
        onGameOver(state);
      }
    }, 250);
  }

  function init() {
    const tryDetect = () => {
      sdk = detectSdk();

      if (sdk && !sdkReady) {
        sdkReady = true;
        log("GamePix SDK detected");
        bindEvents();
        sdkInitCalls();
      }
    };

    tryDetect();

    if (!sdk) {
      let tries = 0;

      const t = setInterval(() => {
        tries += 1;
        tryDetect();

        if (sdk || tries > 20) {
          clearInterval(t);

          if (!sdk) {
            log("GamePix SDK not detected. Running in test mode.");
          }
        }
      }, 250);
    }

    startWatcher();
  }

  window.GamePixBridge = {
    showInterstitial,
    showRewardAd,
    get sdkDetected() {
      return !!sdk;
    }
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();