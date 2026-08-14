(() => {
  const LOG = "[PlaygamaBridge]";
  const LEADERBOARD_ID = "best-score";

  let ready = false;
  let active = false;
  let lastState = null;

  let bridgeReady = false;
  let gameReady = false;
  let gameReadySent = false;

  let setScoreFn = null;
  let showBoardFn = null;

  let rewardedResolver = null;
  let rewardedGot = false;

  function log(...args) {
    console.log(LOG, ...args);
  }

  function hasBridge() {
    return typeof window.bridge !== "undefined" && !!window.bridge;
  }

  function platformId() {
    try {
      const p = window.bridge && window.bridge.platform;
      return (p && p.id) || "";
    } catch {
      return "";
    }
  }

  function pauseGame() {
    if (window.ColorSwitchBlast) window.ColorSwitchBlast.pause();
  }

  function resumeGame() {
    if (window.ColorSwitchBlast) window.ColorSwitchBlast.resume();
  }

  function setMuted(m) {
    if (window.ColorSwitchBlast && window.ColorSwitchBlast.setMuted) {
      window.ColorSwitchBlast.setMuted(m);
    }
  }

  function eventName(key, fallback) {
    const EN = (window.bridge && window.bridge.EVENT_NAME) || {};
    return EN[key] || fallback;
  }

  function sendGameReady() {
    if (gameReadySent) return;
    gameReadySent = true;

    try {
      const p = window.bridge && window.bridge.platform;

      if (p && typeof p.sendMessage === "function") {
        p.sendMessage("game_ready");
        log("game_ready sent");
      }
    } catch (e) {
      log("game_ready failed", e);
    }
  }

  function checkReady() {
    if (bridgeReady && gameReady) sendGameReady();
  }

  function subscribe() {
    const b = window.bridge;
    const p = b.platform;
    const a = b.advertisement;

    // REQUIRED: universal pause + audio handlers
    if (p && typeof p.on === "function") {
      try {
        p.on(eventName("PAUSE_STATE_CHANGED", "pause_state_changed"), (isPaused) => {
          log("pause_state_changed:", isPaused);
          if (isPaused) pauseGame();
          else resumeGame();
        });

        p.on(eventName("AUDIO_STATE_CHANGED", "audio_state_changed"), (isEnabled) => {
          log("audio_state_changed:", isEnabled);
          setMuted(!isEnabled);
        });
      } catch (e) {
        log("platform events failed", e);
      }
    }

    // Rewarded ad lifecycle (early-close + completion tests)
    if (a && typeof a.on === "function") {
      try {
        a.on(eventName("REWARDED_STATE_CHANGED", "rewarded_state_changed"), (state) => {
          log("rewarded state:", state);

          if (state === "rewarded") rewardedGot = true;

          if (state === "closed" || state === "failed") {
            if (rewardedResolver) {
              const r = rewardedResolver;
              rewardedResolver = null;
              r(rewardedGot);
            }
          }
        });

        a.on(eventName("INTERSTITIAL_STATE_CHANGED", "interstitial_state_changed"), (state) => {
          log("interstitial state:", state);
        });
      } catch (e) {
        log("ad events failed", e);
      }
    }
  }

  function findLeaderboard() {
    const b = window.bridge;
    const lb = (b && (b.leaderboards || b.leaderboard)) || null;
    if (!lb) return;

    if (typeof lb.setScore === "function") setScoreFn = lb.setScore.bind(lb);
    else if (typeof lb.submitScore === "function") setScoreFn = lb.submitScore.bind(lb);
    else if (typeof lb.submit === "function") setScoreFn = lb.submit.bind(lb);

    if (typeof lb.show === "function") showBoardFn = lb.show.bind(lb);
  }

  function leaderboardEnabled() {
    return ready && active && !!LEADERBOARD_ID && !!(setScoreFn || showBoardFn);
  }

  function submitScore(score) {
    if (!leaderboardEnabled() || !setScoreFn) return;

    const s = Math.floor(score);

    try {
      setScoreFn({ leaderboardId: LEADERBOARD_ID, score: s });
    } catch {
      try { setScoreFn(LEADERBOARD_ID, s); } catch {}
    }
  }

  function showLeaderboard() {
    if (!leaderboardEnabled() || !showBoardFn) return;

    pauseGame();

    try {
      showBoardFn({ leaderboardId: LEADERBOARD_ID });
    } catch {
      try { showBoardFn(LEADERBOARD_ID); } catch {}
    }
  }

  function mirrorSave(state) {
    try {
      const s = window.bridge && window.bridge.storage;
      if (!s) return;

      const set = s.set || s.setItem;
      if (typeof set === "function") set.call(s, "csb-best", String(state.best));
    } catch {}
  }

  function showInterstitial() {
    if (!ready || !active) return;

    const a = window.bridge && window.bridge.advertisement;
    if (!a || typeof a.showInterstitial !== "function") return;

    pauseGame();

    try {
      a.showInterstitial("game_over");
      log("showInterstitial called");
    } catch (e) {
      log("interstitial failed", e);
    }
  }

  function showRewardAd() {
    if (!ready || !active) return Promise.resolve(false);

    const a = window.bridge && window.bridge.advertisement;
    if (!a || typeof a.showRewarded !== "function") return Promise.resolve(false);

    pauseGame();
    rewardedGot = false;

    return new Promise((resolve) => {
      rewardedResolver = resolve;

      // safety: never hang the revive flow
      setTimeout(() => {
        if (rewardedResolver) {
          const r = rewardedResolver;
          rewardedResolver = null;
          r(false);
        }
      }, 15000);

      try {
        a.showRewarded("revive");
        log("showRewarded called");
      } catch (e) {
        if (rewardedResolver) {
          const r = rewardedResolver;
          rewardedResolver = null;
          r(false);
        }
      }
    });
  }

  function startWatcher() {
    setInterval(() => {
      const api = window.ColorSwitchBlast;
      if (!api || typeof api.getState !== "function") return;

      const state = api.getState();
      if (!state || state.state === lastState) return;

      lastState = state.state;
      log("State changed:", state.state);

      if (state.state === "gameover") {
        mirrorSave(state);
        submitScore(state.score);
        setTimeout(showInterstitial, 600);
      }
    }, 250);
  }

  function init() {
    if (!hasBridge()) {
      log("Playgama Bridge not present.");
      startWatcher();
      return;
    }

    try {
      window.bridge.initialize().then(() => {
        ready = true;

        const id = platformId();
        active = !!id && id !== "mock";

        log("Bridge initialized. platform:", id || "unknown", active ? "(live)" : "(mock)");

        try {
          const p = window.bridge.platform;
          if (p && p.isAudioEnabled === false) setMuted(true);
        } catch {}

        subscribe();
        findLeaderboard();

        bridgeReady = true;
        checkReady();
      }).catch((e) => {
        ready = true;
        bridgeReady = true;
        checkReady();
        log("initialize error", e);
      });
    } catch {
      ready = true;
      bridgeReady = true;
      checkReady();
    }

    window.addEventListener("color-switch-blast:ready", () => {
      gameReady = true;
      checkReady();
    });

    // failsafe
    setTimeout(() => {
      gameReady = true;
      checkReady();
    }, 4000);

    startWatcher();
  }

  window.PlaygamaBridge = {
    showRewardAd,
    showInterstitial,
    showLeaderboard,
    submitScore,
    get sdkReady() { return ready; },
    get adsAvailable() { return ready && active; },
    get hasLeaderboard() { return leaderboardEnabled(); }
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();