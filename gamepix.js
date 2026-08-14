(() => {
  const LOG = "[GamePixBridge]";

  const AD_MIN_INTERVAL = 45000; // throttle after the first ad

  let sdkReady = false;
  let adBusy = false;
  let lastAdAt = 0;
  let lastState = null;
  let lastScore = -1;
  let lastLevel = -1;
  let lastComboBucket = 0;

  function log(...args) {
    console.log(LOG, ...args);
  }

  function hasSdk() {
    return typeof window.GamePix !== "undefined" && !!window.GamePix;
  }

  function inPlatform() {
    try {
      return window.self !== window.top;
    } catch (error) {
      return true;
    }
  }

  function safe(fn) {
    try {
      return fn();
    } catch (error) {
      console.warn(LOG, "SDK call failed", error);
      return undefined;
    }
  }

  function pauseGame() {
    if (window.ColorSwitchBlast) window.ColorSwitchBlast.pause();
  }

  function resumeGame() {
    if (window.ColorSwitchBlast) window.ColorSwitchBlast.resume();
  }

  function initSdk() {
    if (!hasSdk()) {
      log("GamePix SDK not detected. Running in test mode.");
      return;
    }

    log("GamePix SDK detected");

    safe(() => {
      log("Player language:", window.GamePix.lang());
    });

    // MANDATORY: loaded() must be called before any other SDK method
    safe(() => {
      const p = window.GamePix.loaded();

      if (p && typeof p.then === "function") {
        p.then(() => {
          sdkReady = true;
          log("GamePix.loaded() resolved. SDK ready.");

          safe(() => window.GamePix.localStorage.getItem("csb-best"));
        }).catch(() => {
          sdkReady = true;
        });
      } else {
        sdkReady = true;
      }
    });
  }

  function mirrorSave(best) {
    if (!sdkReady) return;

    safe(() =>
      window.GamePix.localStorage.setItem("csb-best", String(best))
    );
  }

  function onScore(score) {
    if (!sdkReady) return;
    if (!Number.isFinite(score)) return;

    safe(() => window.GamePix.updateScore(Math.floor(score)));

    const level = 1 + Math.floor(score / 10);

    if (level !== lastLevel) {
      lastLevel = level;
      safe(() => window.GamePix.updateLevel(level));
    }
  }

  function happyMoment() {
    if (!sdkReady) return;
    safe(() => window.GamePix.happyMoment());
  }

  function showInterstitial() {
    if (!sdkReady || adBusy || !inPlatform()) return;

    const now = Date.now();

    if (lastAdAt && now - lastAdAt < AD_MIN_INTERVAL) return;

    adBusy = true;
    lastAdAt = now;

    pauseGame(); // REQUIRED: pause before ad

    safe(() => {
      const p = window.GamePix.interstitialAd();

      if (p && typeof p.then === "function") {
        p.then((res) => {
          adBusy = false;
          log("interstitialAd finished", res);
        }).catch(() => {
          adBusy = false;
        });
      } else {
        adBusy = false;
      }
    });
  }

  function showRewardAd() {
    if (!sdkReady || adBusy || !inPlatform()) return Promise.resolve(false);

    adBusy = true;
    pauseGame();

    return new Promise((resolve) => {
      const finish = (ok) => {
        adBusy = false;
        resolve(ok);
      };

      safe(() => {
        const p = window.GamePix.rewardAd();

        if (p && typeof p.then === "function") {
          p
            .then((res) => finish(!!(res && res.success)))
            .catch(() => finish(false));
        } else {
          finish(false);
        }
      });
    });
  }

  function onGameOver(state) {
    mirrorSave(state.best);

    if (state.score > 0 && state.score === state.best) {
      happyMoment();
    }

    // Interstitial ONLY on death, never before menu, throttled
    setTimeout(showInterstitial, 600);
  }

  function bindPlatformEvents() {
    if (!hasSdk()) return;

    const on = (name, handler) => {
      safe(() => {
        if (typeof window.GamePix.addEventListener === "function") {
          window.GamePix.addEventListener(name, handler);
        } else if (typeof window.GamePix.on === "function") {
          window.GamePix.on(name, handler);
        }
      });
    };

    on("pause", pauseGame);
    on("resume", resumeGame);
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
          onScore(state.score);
        }

        const bucket = Math.floor(state.combo / 5);

        if (bucket > lastComboBucket) {
          lastComboBucket = bucket;
          happyMoment();
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

      if (state.state === "gameover") {
        onGameOver(state);
      }

      if (state.state === "paused" && sdkReady) {
        safe(() => {
          if (typeof window.GamePix.pause === "function") {
            window.GamePix.pause();
          }
        });
      }

      if (state.state === "playing" && prev === "paused" && sdkReady) {
        safe(() => {
          if (typeof window.GamePix.resume === "function") {
            window.GamePix.resume();
          }
        });
      }
    }, 250);
  }

  function init() {
    initSdk();
    bindPlatformEvents();
    startWatcher();
  }

  window.GamePixBridge = {
    showInterstitial,
    showRewardAd,
    get sdkReady() {
      return sdkReady;
    },
    get adsAvailable() {
      return sdkReady && inPlatform();
    }
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();