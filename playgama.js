(() => {
  const LOG = "[PlaygamaBridge]";
  const AD_MIN_INTERVAL = 45000;

  let ready = false;
  let active = false;
  let adBusy = false;
  let lastAdAt = 0;
  let lastState = null;
  let interstitialFn = null;
  let rewardedFn = null;

  const LEADERBOARD_ID = "best-score";

  let setScoreFn = null;
  let showBoardFn = null;

  function log(...args) {
    console.log(LOG, ...args);
  }

  function hasBridge() {
    return typeof window.bridge !== "undefined" && !!window.bridge;
  }

  function platformId() {
    try {
      const p = window.bridge && window.bridge.platform;
      return (p && (p.id || p.platformId)) || (window.bridge && window.bridge.platformId) || "";
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

  function deepFindObject(root, keyword, depth, seen) {
    depth = depth || 0;
    seen = seen || new WeakSet();
    if (!root || typeof root !== "object" || depth > 3 || seen.has(root)) return null;
    seen.add(root);

    let keys = [];
    try { keys = Object.keys(root); } catch { return null; }

    for (const key of keys) {
      let val = null;
      try { val = root[key]; } catch { continue; }
      if (val && typeof val === "object" && key.toLowerCase().includes(keyword)) return val;
    }

    for (const key of keys) {
      let val = null;
      try { val = root[key]; } catch { continue; }
      if (val && typeof val === "object") {
        const found = deepFindObject(val, keyword, depth + 1, seen);
        if (found) return found;
      }
    }
    return null;
  }

  function deepFindFn(root, keyword, depth, seen) {
    depth = depth || 0;
    seen = seen || new WeakSet();
    if (!root || typeof root !== "object" || depth > 3 || seen.has(root)) return null;
    seen.add(root);

    let keys = [];
    try { keys = Object.keys(root); } catch { return null; }

    for (const key of keys) {
      let val = null;
      try { val = root[key]; } catch { continue; }
      if (typeof val === "function" && key.toLowerCase().includes(keyword)) return val.bind(root);
    }

    for (const key of keys) {
      let val = null;
      try { val = root[key]; } catch { continue; }
      if (val && typeof val === "object") {
        const found = deepFindFn(val, keyword, depth + 1, seen);
        if (found) return found;
      }
    }
    return null;
  }

  function findAdFn(keyword) {
    const b = window.bridge;
    if (!b) return null;

    const obj = deepFindObject(b, keyword);

    if (obj) {
      for (const name of ["show", "display", "play", "start"]) {
        if (typeof obj[name] === "function") return obj[name].bind(obj);
      }

      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "function") return obj[key].bind(obj);
      }
    }

    return deepFindFn(b, keyword);
  }

  function subscribeEvents() {
    const p = window.bridge && window.bridge.platform;
    if (!p) return;

    const on =
      (typeof p.on === "function" && p.on.bind(p)) ||
      (typeof p.addEventListener === "function" && p.addEventListener.bind(p)) ||
      (typeof p.subscribe === "function" && p.subscribe.bind(p)) ||
      null;

    if (!on) return;

    const tryOn = (name, handler) => {
      try { on(name, handler); } catch {}
    };

    tryOn("pause", pauseGame);
    tryOn("resume", resumeGame);
    tryOn("audio", (muted) => { if (muted) pauseGame(); });
    tryOn("audioStateChanged", (muted) => { if (muted) pauseGame(); });
  }

  function mirrorSave(state) {
    try {
      const s = window.bridge && window.bridge.storage;
      if (!s) return;

      const set = s.set || s.setItem;

      if (typeof set === "function") {
        set.call(s, "csb-best", String(state.best));
      }
    } catch {}
  }

  function showInterstitial() {
    if (!ready || !active || adBusy) return;

    const now = Date.now();
    if (lastAdAt && now - lastAdAt < AD_MIN_INTERVAL) return;
    if (!interstitialFn) return;

    adBusy = true;
    lastAdAt = now;
    pauseGame();

    try {
      const res = interstitialFn();

      if (res && typeof res.then === "function") {
        res.then(() => { adBusy = false; }).catch(() => { adBusy = false; });
      } else {
        adBusy = false;
      }
    } catch {
      adBusy = false;
    }
  }

  function showRewardAd() {
    if (!ready || !active || adBusy) return Promise.resolve(false);
    if (!rewardedFn) return Promise.resolve(false);

    adBusy = true;
    pauseGame();

    return new Promise((resolve) => {
      let rewarded = false;
      let settled = false;

      const done = (ok) => {
        if (settled) return;
        settled = true;
        adBusy = false;
        resolve(ok);
      };

      setTimeout(() => done(false), 10000); // safety

      try {
        const res = rewardedFn({
          onRewarded: () => { rewarded = true; },
          onSuccess: () => { rewarded = true; },
          onClose: () => done(rewarded),
          onClosed: () => done(rewarded)
        });

        if (res && typeof res.then === "function") {
          res
            .then((r) => done(rewarded || !!(r && (r.success || r.rewarded))))
            .catch(() => done(false));
        }
      } catch {
        done(false);
      }
    });
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
          log("language:", window.bridge.platform && window.bridge.platform.language);
        } catch {}

        interstitialFn = findAdFn("interstitial");
        rewardedFn = findAdFn("rewarded");

        const boardObj = deepFindObject(window.bridge, "leaderboard");

        if (boardObj) {
          setScoreFn =
            (typeof boardObj.setScore === "function" && boardObj.setScore.bind(boardObj)) ||
            (typeof boardObj.submitScore === "function" && boardObj.submitScore.bind(boardObj)) ||
            (typeof boardObj.submit === "function" && boardObj.submit.bind(boardObj)) ||
            null;

          showBoardFn = (typeof boardObj.show === "function" && boardObj.show.bind(boardObj)) || null;
        }

        subscribeEvents();
      }).catch((e) => {
        ready = true;
        log("initialize error", e);
      });
    } catch {
      ready = true;
    }

    window.addEventListener("color-switch-blast:ready", () => {
      try {
        const p = window.bridge && window.bridge.platform;
        if (p && typeof p.sendMessage === "function") {
          p.sendMessage("game_ready");
        }
      } catch {}
    });

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