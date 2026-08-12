(() => {
  const LOG = "[GamePixBridge]";
  const AD_EVERY_GAMEOVERS = 3;

  let sdk = null;
  let adOpen = false;
  let gameovers = 0;
  let lastState = null;

  function log(...args) {
    console.log(LOG, ...args);
  }

  function detectSdk() {
    return window.GamePix || window.gamepix || null;
  }

  function call(names, payload, withPayload = false) {
    if (!sdk) return undefined;

    for (const name of names) {
      const fn = sdk[name];

      if (typeof fn === "function") {
        try {
          const result = withPayload ? fn.call(sdk, payload) : fn.call(sdk);
          log("Called SDK method: " + name);
          return result;
        } catch (error) {
          console.warn(LOG, name + " failed", error);
        }
      }
    }

    return undefined;
  }

  function pauseGame() {
    if (window.ColorSwitchBlast) window.ColorSwitchBlast.pause();
  }

  function resumeGame() {
    if (window.ColorSwitchBlast) window.ColorSwitchBlast.resume();
  }

  function bindSdkEvents() {
    const on = (name, handler) => {
      try {
        if (typeof sdk.addEventListener === "function") {
          sdk.addEventListener(name, handler);
        } else if (typeof sdk.on === "function") {
          sdk.on(name, handler);
        }
      } catch (error) {
        // Unsupported event system
      }
    };

    on("pause", pauseGame);
    on("resume", resumeGame);
  }

  function showInterstitial() {
    if (!sdk || adOpen) return;

    adOpen = true;
    pauseGame();

    const done = () => {
      adOpen = false;
    };

    try {
      const result = call(["presentAd", "showInterstitialAd", "interstitialAd"]);

      if (result && typeof result.then === "function") {
        result.then(done).catch(done);
      } else {
        setTimeout(done, 100);
      }
    } catch (error) {
      done();
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

      try {
        const result = call([
          "presentRewardAd",
          "showRewardAd",
          "rewardAd"
        ]);

        if (result && typeof result.then === "function") {
          result
            .then((res) => done(!!(res && (res.success || res.rewarded))))
            .catch(() => done(false));
        } else {
          done(false);
        }
      } catch (error) {
        done(false);
      }
    });
  }

  function onGameOver(state) {
    call(["updateScore"], state.score, true);

    gameovers += 1;

    if (gameovers % AD_EVERY_GAMEOVERS === 0) {
      setTimeout(showInterstitial, 600);
    }
  }

  function startWatcher() {
    setInterval(() => {
      const api = window.ColorSwitchBlast;

      if (!api || typeof api.getState !== "function") return;

      const state = api.getState();

      if (!state || state.state === lastState) return;

      const prev = lastState;
      lastState = state.state;

      log("State changed:", state.state);

      if (!sdk) return;

      if (state.state === "paused") {
        call(["pause"]);
      }

      if (state.state === "playing" && prev === "paused") {
        call(["resume"]);
      }

      if (state.state === "gameover") {
        onGameOver(state);
      }
    }, 250);
  }

  function init() {
    sdk = detectSdk();

    if (sdk) {
      log("GamePix SDK detected");
      bindSdkEvents();
    } else {
      log("GamePix SDK not detected. Running in test mode (normal outside GamePix).");
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