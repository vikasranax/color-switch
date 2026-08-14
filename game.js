(() => {
  const canvas = document.getElementById("game");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const loader = document.getElementById("loader");

  window.addEventListener("error", (e) => {
    const t = document.getElementById("loaderTitle");
    if (t && loader && document.body.contains(loader)) {
      t.textContent = "ERROR: " + (e.message || "unknown");
    }
  });

  const loaderLogo = document.getElementById("loaderLogo");
  if (loaderLogo) {
    loaderLogo.addEventListener("load", () => {
      const t = document.getElementById("loaderTitle");
      if (t) t.style.display = "none";
    });
    loaderLogo.addEventListener("error", () => loaderLogo.remove());
  }

  const logoImg = new Image();
  let logoLoaded = false;
  logoImg.onload = () => { logoLoaded = true; };
  logoImg.src = "logo.png?v=3.2";

  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('800 20px "JetBrains Mono"');
      document.fonts.load('600 14px "JetBrains Mono"');
    }
  } catch {}

  const COLORS = [
    { name: "cyan", hex: "#22d3ee" },
    { name: "pink", hex: "#f472b6" },
    { name: "yellow", hex: "#facc15" },
    { name: "green", hex: "#4ade80" }
  ];

  const POWERUPS = [
    { id: "shield", color: "#38bdf8", label: "SHIELD" },
    { id: "slow", color: "#a78bfa", label: "SLOW-MO" },
    { id: "double", color: "#fb923c", label: "DOUBLE POINTS" }
  ];

  const MILESTONES = [25, 50, 100, 150, 200, 300];
  const MAX_SCORE = 9999;
  const MAX_COUNTER = 1000000;
  const SECRET = "csb-v3-integrity";
  const GAME_VERSION = "v3.0";

  const STORAGE_KEYS = {
    profile: "color-switch-blast-profile",
    settings: "color-switch-blast-settings",
    legacyBest: "color-switch-blast-best"
  };

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} }
  };

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function saveSecure(key, obj) {
    const json = JSON.stringify(obj);
    storage.set(key, json + "." + hashString(json + SECRET));
  }

  function loadSecure(key, defaults) {
    const raw = storage.get(key);
    if (!raw) return Object.assign({}, defaults);
    const idx = raw.lastIndexOf(".");
    if (idx === -1) return Object.assign({}, defaults);
    const json = raw.slice(0, idx);
    const hash = raw.slice(idx + 1);
    if (hashString(json + SECRET) !== hash) return Object.assign({}, defaults);
    try { return Object.assign({}, defaults, JSON.parse(json)); } catch { return Object.assign({}, defaults); }
  }

  function clampNum(v, min, max, fb) {
    if (!Number.isFinite(v)) return fb;
    return Math.min(max, Math.max(min, v));
  }

  const profile = loadSecure(STORAGE_KEYS.profile, { best: 0, games: 0, perfects: 0 });
  profile.best = clampNum(profile.best, 0, MAX_SCORE, 0);
  profile.games = clampNum(profile.games, 0, MAX_COUNTER, 0);
  profile.perfects = clampNum(profile.perfects, 0, MAX_COUNTER, 0);

  const legacyBest = clampNum(Number(storage.get(STORAGE_KEYS.legacyBest) || 0), 0, MAX_SCORE, 0);
  if (legacyBest > profile.best) profile.best = legacyBest;

  const settings = loadSecure(STORAGE_KEYS.settings, { sound: true, fx: true });
  settings.sound = settings.sound !== false;
  settings.fx = settings.fx !== false;

  function saveProfile() {
    saveSecure(STORAGE_KEYS.profile, { best: profile.best, games: profile.games, perfects: profile.perfects });
  }

  function saveSettings() {
    saveSecure(STORAGE_KEYS.settings, settings);
  }

  let W = 0, H = 0, dpr = 1;
  let lastTime = performance.now();
  let audioCtx = null;
  let fpsAvg = 0, lowPerfTimer = 0;
  let safeTop = 0, safeRight = 0, safeBottom = 0, safeLeft = 0;
  let loaderHidden = false, loaderTimeoutSet = false;

  const game = {
    state: "menu", // menu, ready, playing, paused, revive, gameover
    time: 0,
    readyTimer: 0,
    score: 0,
    best: profile.best,
    speed: 185,
    spawnTimer: 0.55,
    spawnInterval: 1.08,
    walls: [],
    demoWalls: [],
    powerups: [],
    powerTimer: 6,
    shield: 0,
    slowTimer: 0,
    doubleTimer: 0,
    reviveUsed: false,
    nextMilestone: 0,
    particles: [],
    popups: [],
    stars: [],
    orbs: [],
    shake: 0,
    hitStop: 0,
    bgFlash: 0,
    bgFlashColor: "#ffffff",
    gameOverAt: 0,
    newBest: false,
    combo: 0,
    maxCombo: 0,
    runPerfects: 0,
    lastSwitchAt: -10,
    perfectWindow: 0.18,
    demoSpawnTimer: 0,
    trailTimer: 0,
    lowPerf: false,
    uiRects: {},
    settings
  };

  const ball = {
    colorIndex: 0,
    radius: 17,
    pulse: 0,
    switchFlash: 0,
    get x() { return W / 2; },
    get y() { return H * 0.76; }
  };

  function updateSafeArea() {
    const styles = getComputedStyle(document.documentElement);
    safeTop = parseFloat(styles.getPropertyValue("--sat")) || 0;
    safeRight = parseFloat(styles.getPropertyValue("--sar")) || 0;
    safeBottom = parseFloat(styles.getPropertyValue("--sab")) || 0;
    safeLeft = parseFloat(styles.getPropertyValue("--sal")) || 0;
  }

  function resize() {
    updateSafeArea();
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeStars();
    makeOrbs();
  }

  function makeStars() {
    game.stars = Array.from({ length: 85 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      size: Math.random() * 2 + 0.4, speed: Math.random() * 25 + 8,
      alpha: Math.random() * 0.35 + 0.08
    }));
  }

  function makeOrbs() {
    game.orbs = Array.from({ length: 7 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      radius: 30 + Math.random() * 95, speed: 5 + Math.random() * 16,
      drift: Math.random() * 20 - 10, alpha: 0.035 + Math.random() * 0.06,
      colorIndex: Math.floor(Math.random() * COLORS.length)
    }));
  }

  function hideLoader() {
    if (loader && !loaderHidden) {
      loaderHidden = true;
      loader.classList.add("hidden");
      setTimeout(() => { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 500);
      window.dispatchEvent(new Event("color-switch-blast:ready"));
    }
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, Math.max(0, w / 2), Math.max(0, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function inRect(x, y, r) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function vibrate(pattern) {
    if (!game.settings.fx) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
  }

  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
  }

  function toneAt(freq, duration, type, volume, when) {
    if (!game.settings.sound) return;
    try {
      ensureAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t0 = when || audioCtx.currentTime;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch {}
  }

  function playTone(f, d = 0.08, t = "sine", v = 0.03) { toneAt(f, d, t, v, 0); }

  let musicTimer = null, musicStep = 0;
  const MUSIC_SCALE = [220, 261.63, 293.66, 329.63, 392, 440];

  function startMusic() {
    if (musicTimer || !game.settings.sound) return;
    ensureAudio();
    musicTimer = setInterval(() => {
      if (!audioCtx || game.state === "paused") return;
      if (musicStep % 4 === 0) toneAt(MUSIC_SCALE[0] / 2, 0.4, "sine", 0.015, 0);
      const note = MUSIC_SCALE[(musicStep * 3 + (game.combo % 4)) % MUSIC_SCALE.length];
      toneAt(note, 0.18, "triangle", 0.012, 0);
      musicStep++;
    }, 240);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function playClick() { playTone(360, 0.05, "triangle", 0.025); }
  function playSwitch() { playTone(260 + ball.colorIndex * 75, 0.055, "triangle", 0.025); }
  function playPass() {
    const base = 480 + Math.min(48, game.combo * 6);
    playTone(base, 0.07, "sine", 0.035);
    playTone(base * 1.5, 0.05, "triangle", 0.02);
  }
  function playPerfect() {
    playTone(720, 0.07, "triangle", 0.04);
    playTone(1040, 0.10, "sine", 0.035);
    playTone(1440, 0.12, "sine", 0.02);
  }
  function playGameOver() {
    playTone(220, 0.12, "sawtooth", 0.04);
    playTone(110, 0.30, "sawtooth", 0.05);
  }
  function playPowerup() { playTone(660, 0.08, "triangle", 0.04); playTone(990, 0.1, "sine", 0.03); }

  function toggleSound() {
    game.settings.sound = !game.settings.sound;
    saveSettings();
    if (game.settings.sound) {
      ensureAudio();
      playClick();
      if (game.state === "playing") startMusic();
    } else stopMusic();
  }

  function toggleFx() {
    game.settings.fx = !game.settings.fx;
    saveSettings();
    playClick();
  }

  function addShake(a) { if (game.settings.fx) game.shake = Math.max(game.shake, a); }

  function addParticles(x, y, color, count, spread = 1, life = 0.7) {
    if (game.lowPerf) count = Math.ceil(count / 2);
    if (!game.settings.fx) { count = Math.min(3, count); spread *= 0.4; life *= 0.5; }
    for (let i = 0; i < count; i++) {
      game.particles.push({
        x, y, color,
        vx: (Math.random() - 0.5) * 360 * spread,
        vy: (Math.random() - 0.8) * 360 * spread,
        life: Math.random() * life + 0.15,
        size: Math.random() * 3.5 + 1
      });
    }
  }

  function addPopup(text, color, x, y, size = 24) {
    game.popups.push({ text, color, x, y, size, life: 0.95, maxLife: 0.95 });
  }

  function pickWallOffset() {
    const same = Math.max(0.08, 0.20 - game.score * 0.001);
    const one = 0.46, two = 0.32;
    const three = Math.min(0.24, 0.08 + game.score * 0.001);
    const total = same + one + two + three;
    let r = Math.random() * total;
    if ((r -= same) < 0) return 0;
    if ((r -= one) < 0) return 1;
    if ((r -= two) < 0) return 2;
    return 3;
  }

  function spawnWall() {
    game.walls.push({
      y: -80, height: 30,
      colorIndex: (ball.colorIndex + pickWallOffset()) % COLORS.length,
      passed: false, glow: 0
    });
  }

  function spawnPowerup() {
    const type = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
    game.powerups.push({ y: -60, x: ball.x, r: 16, spin: Math.random() * 6, type });
  }

  function startGame() {
    game.state = "ready";
    game.readyTimer = 0.9;
    game.score = 0;
    game.speed = 185;
    game.spawnTimer = 0.55;
    game.spawnInterval = 1.08;
    game.walls = [];
    game.demoWalls = [];
    game.powerups = [];
    game.powerTimer = 6;
    game.shield = 0;
    game.slowTimer = 0;
    game.doubleTimer = 0;
    game.reviveUsed = false;
    game.nextMilestone = MILESTONES[0];
    game.particles = [];
    game.popups = [];
    game.shake = 0;
    game.hitStop = 0;
    game.bgFlash = 0;
    game.bgFlashColor = "#ffffff";
    game.newBest = false;
    game.combo = 0;
    game.maxCombo = 0;
    game.runPerfects = 0;
    game.lastSwitchAt = -10;
    game.trailTimer = 0;
    game.best = profile.best;
    ball.colorIndex = 0;
    ball.pulse = 0;
    ball.switchFlash = 0;
  }

  function enterRevive() {
    game.state = "revive";
    stopMusic();
    vibrate(30);
  }

  function doRevive() {
    game.reviveUsed = true;
    game.walls = [];
    game.powerups = [];
    game.combo = 0;
    game.state = "ready";
    game.readyTimer = 1.0;
    startMusic();
  }

  function declineRevive() { gameOver(); }

  function tryRevive() {
    const bridge = window.PlaygamaBridge && window.PlaygamaBridge.adsAvailable
      ? window.PlaygamaBridge
      : window.GamePixBridge;
    if (bridge && bridge.adsAvailable) {
      bridge.showRewardAd().then((ok) => { if (ok) doRevive(); else declineRevive(); });
    } else {
      doRevive();
    }
  }

  function gameOver() {
    game.state = "gameover";
    game.gameOverAt = performance.now();
    stopMusic();
    addShake(18);
    vibrate([40, 60, 40]);
    game.bgFlash = 0.22;
    game.bgFlashColor = "#ef4444";
    game.newBest = game.score > profile.best;
    if (game.newBest) { profile.best = game.score; game.best = profile.best; }
    saveProfile();
    addParticles(ball.x, ball.y, COLORS[ball.colorIndex].hex, 46, 1.6, 1.1);
    playGameOver();
  }

  function switchColor() {
    ball.colorIndex = (ball.colorIndex + 1) % COLORS.length;
    ball.pulse = 1;
    ball.switchFlash = 1;
    game.lastSwitchAt = performance.now() / 1000;
    addParticles(ball.x, ball.y, COLORS[ball.colorIndex].hex, 10, 0.5, 0.45);
    playSwitch();
  }

  function shareGame(mode) {
    const score = mode === "over" ? game.score : game.best;
    const text = "I scored " + score + " in Color Switch Blast by VRX Games! Can you beat me?";
    const url = location.href;
    try {
      if (navigator.share) {
        navigator.share({ title: "Color Switch Blast", text, url }).catch(() => {});
        return;
      }
    } catch {}
    try {
      navigator.clipboard.writeText(text + " " + url).then(() => {
        addPopup("COPIED!", "#4ade80", W / 2, H * 0.5, 24);
      });
    } catch {}
  }

  function action() {
    if (game.state === "menu") { startGame(); return; }
    if (game.state === "ready") { switchColor(); return; }
    if (game.state === "paused") { resumeGame(); return; }
    if (game.state === "playing") { switchColor(); return; }
    if (game.state === "gameover" && performance.now() - game.gameOverAt > 500) startGame();
  }

  function pauseGame() { if (game.state === "playing") game.state = "paused"; }
  function resumeGame() {
    if (game.state === "paused") { game.state = "playing"; lastTime = performance.now(); }
  }
  function togglePause() {
    if (game.state === "playing") pauseGame();
    else if (game.state === "paused") resumeGame();
  }

  function updateStars(dt) {
    const m = game.state === "playing" ? 1.8 : 0.5;
    for (const s of game.stars) {
      s.y += s.speed * m * dt;
      if (s.y > H + 10) { s.y = -10; s.x = Math.random() * W; }
    }
  }

  function updateOrbs(dt) {
    for (const o of game.orbs) {
      o.y -= o.speed * dt;
      o.x += Math.sin(game.time * 0.25 + o.drift) * 6 * dt;
      if (o.y < -o.radius * 2) {
        o.y = H + o.radius * 2;
        o.x = Math.random() * W;
        o.colorIndex = Math.floor(Math.random() * COLORS.length);
      }
    }
  }

  function updateParticles(dt) {
    for (const p of game.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt; p.life -= dt; }
    game.particles = game.particles.filter(p => p.life > 0);
  }

  function updatePopups(dt) {
    for (const p of game.popups) { p.y -= 48 * dt; p.life -= dt; }
    game.popups = game.popups.filter(p => p.life > 0);
  }

  function updateDemoWalls(dt) {
    game.demoSpawnTimer -= dt;
    if (game.demoSpawnTimer <= 0) {
      game.demoSpawnTimer = 1.2;
      game.demoWalls.push({ y: -80, height: 26, colorIndex: Math.floor(Math.random() * COLORS.length), glow: 0 });
    }
    for (const w of game.demoWalls) w.y += 70 * dt;
    game.demoWalls = game.demoWalls.filter(w => w.y < H + 100);
  }

  function collectPowerup(p) {
    if (p.type.id === "shield") game.shield = 1;
    if (p.type.id === "slow") game.slowTimer = 4;
    if (p.type.id === "double") game.doubleTimer = 6;
    addPopup(p.type.label, p.type.color, ball.x, ball.y - 72, 24);
    addParticles(ball.x, ball.y, p.type.color, 20, 1, 0.8);
    playPowerup();
    vibrate(12);
  }

  function update(dt) {
    if (game.state === "paused") return;

    game.time += dt;
    game.bgFlash = Math.max(0, game.bgFlash - 1.8 * dt);
    game.shake = Math.max(0, game.shake - 40 * dt);
    ball.pulse = Math.max(0, ball.pulse - 4 * dt);
    ball.switchFlash = Math.max(0, ball.switchFlash - 5 * dt);

    if (game.hitStop > 0) {
      game.hitStop -= dt;
      updateParticles(dt * 0.35);
      updatePopups(dt * 0.35);
      return;
    }

    updateStars(dt);
    updateOrbs(dt);
    updateParticles(dt);
    updatePopups(dt);

    if (game.state === "menu") { updateDemoWalls(dt); return; }

    if (game.state === "ready") {
      game.readyTimer -= dt;
      if (game.readyTimer <= 0) {
        game.state = "playing";
        profile.games = Math.min(MAX_COUNTER, profile.games + 1);
        startMusic();
        vibrate(10);
      }
      return;
    }

    if (game.state !== "playing") return;

    game.slowTimer = Math.max(0, game.slowTimer - dt);
    game.doubleTimer = Math.max(0, game.doubleTimer - dt);
    const speedMul = game.slowTimer > 0 ? 0.6 : 1;

    game.trailTimer -= dt;
    if (game.trailTimer <= 0) {
      game.trailTimer = 0.035;
      if (game.settings.fx) {
        addParticles(ball.x, ball.y + ball.radius * 0.6, COLORS[ball.colorIndex].hex, 1, 0.03, 0.22);
      }
    }

    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      spawnWall();
      game.spawnInterval = Math.max(0.44, 1.08 - game.score * 0.0045);
      game.spawnTimer = game.spawnInterval;
    }

    game.powerTimer -= dt;
    if (game.powerTimer <= 0 && game.score >= 5) {
      game.powerTimer = 6 + Math.random() * 5;
      spawnPowerup();
    }

    game.speed = Math.min(560, 185 + game.score * 4.2 + Math.floor(game.score / 10) * 12);

    for (const p of game.powerups) {
      p.y += game.speed * 0.8 * speedMul * dt;
      p.spin += dt * 3;
    }
    game.powerups = game.powerups.filter(p => {
      if (p.y + p.r >= ball.y - ball.radius && p.y - p.r <= ball.y + ball.radius) {
        collectPowerup(p);
        return false;
      }
      return p.y < H + 80;
    });

    for (const wall of game.walls) {
      wall.y += game.speed * speedMul * dt;
      wall.glow = Math.max(0, wall.glow - 3 * dt);

      if (!wall.passed && wall.y + wall.height >= ball.y - ball.radius) {
        wall.passed = true;

        if (wall.colorIndex === ball.colorIndex) {
          const nowSec = performance.now() / 1000;
          const switchDelta = nowSec - game.lastSwitchAt;
          const perfect = switchDelta >= 0 && switchDelta <= game.perfectWindow;
          const comboBonus = Math.min(5, Math.floor(game.combo / 5));
          const mult = game.doubleTimer > 0 ? 2 : 1;
          const points = (1 + (perfect ? 1 : 0) + comboBonus) * mult;

          game.score = Math.min(MAX_SCORE, game.score + points);
          game.combo += 1;
          game.maxCombo = Math.max(game.maxCombo, game.combo);
          wall.glow = 1;

          if (game.nextMilestone && game.score >= game.nextMilestone) {
            addPopup("MILESTONE " + game.nextMilestone + "!", "#ffffff", W / 2, H * 0.32, 30);
            playTone(880, 0.1, "sine", 0.04);
            const idx = MILESTONES.indexOf(game.nextMilestone);
            game.nextMilestone = MILESTONES[idx + 1] || 0;
          }

          if (perfect) {
            game.runPerfects += 1;
            profile.perfects = Math.min(MAX_COUNTER, profile.perfects + 1);
            game.hitStop = game.settings.fx ? 0.045 : 0.02;
            game.bgFlash = 0.16;
            game.bgFlashColor = COLORS[wall.colorIndex].hex;
            addShake(5);
            vibrate(15);
            addParticles(ball.x, ball.y, COLORS[wall.colorIndex].hex, 28, 1.2, 0.9);
            addPopup(`PERFECT +${points}`, "#ffffff", ball.x, ball.y - 72, 28);
            playPerfect();
          } else {
            addParticles(ball.x, ball.y, COLORS[wall.colorIndex].hex, 14, 0.8, 0.65);
            addPopup(`+${points}`, COLORS[wall.colorIndex].hex, ball.x, ball.y - 56, 22);
            playPass();
          }

          if (game.combo % 5 === 0) {
            addPopup(`COMBO ${game.combo}`, "#facc15", W / 2, H * 0.26, 30);
          }
        } else {
          if (game.shield > 0) {
            game.shield = 0;
            game.combo = 0;
            addPopup("SHIELD SAVED!", "#38bdf8", ball.x, ball.y - 72, 26);
            addParticles(ball.x, ball.y, "#38bdf8", 24, 1.2, 0.8);
            playTone(500, 0.09, "square", 0.03);
            addShake(6);
          } else if (!game.reviveUsed) {
            enterRevive();
            break;
          } else {
            gameOver();
            break;
          }
        }
      }
    }

    game.walls = game.walls.filter(w => w.y < H + 100);
  }

  function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#080812");
    bg.addColorStop(0.55, "#0b1020");
    bg.addColorStop(1, "#111827");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (game.settings.fx && !game.lowPerf) {
      for (const o of game.orbs) {
        const c = COLORS[o.colorIndex];
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius);
        g.addColorStop(0, hexToRgba(c.hex, o.alpha));
        g.addColorStop(1, hexToRgba(c.hex, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const s of game.stars) {
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    if (game.bgFlash > 0) {
      ctx.fillStyle = hexToRgba(game.bgFlashColor, game.bgFlash);
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawPanel(x, y, w, h, r = 24) {
    ctx.save();
    ctx.fillStyle = "rgba(7, 10, 18, 0.55)";
    roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.18)";
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of game.particles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, p.life));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawWallBeam(wall, alpha = 1, isMatch = false) {
    const c = COLORS[wall.colorIndex];
    const x = 18, w = W - 36, y = wall.y, h = wall.height;
    const pulse = isMatch ? 0.5 + Math.sin(performance.now() / 180) * 0.18 : 0;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = game.lowPerf ? 0 : 22 + wall.glow * 30 + pulse * 16;
    ctx.shadowColor = c.hex;
    ctx.fillStyle = hexToRgba(c.hex, 0.20 + wall.glow * 0.18 + pulse * 0.10);
    roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = hexToRgba(c.hex, 0.88);
    ctx.beginPath(); ctx.arc(x + 12, y + h / 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 12, y + h / 2, 7, 0, Math.PI * 2); ctx.fill();

    const beamW = Math.max(20, w - 40);
    const beamX = x + (w - beamW) / 2;
    ctx.fillStyle = hexToRgba(c.hex, 0.94);
    roundRect(beamX, y + h / 2 - 4, beamW, 8, 999);
    ctx.fill();

    const glossW = Math.max(10, w - 56);
    const glossX = x + (w - glossW) / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    roundRect(glossX, y + h / 2 - 2, glossW, 2, 999);
    ctx.fill();

    if (isMatch) {
      ctx.strokeStyle = hexToRgba("#ffffff", 0.25 + pulse * 0.2);
      ctx.lineWidth = 2;
      roundRect(x, y, w, h, 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWalls() {
    for (const wall of game.walls) {
      const isMatch = wall.colorIndex === ball.colorIndex && game.state === "playing";
      drawWallBeam(wall, 1, isMatch);
    }
  }

  function drawDemoWalls() {
    for (const wall of game.demoWalls) drawWallBeam(wall, 0.28, false);
  }

  function drawPowerups() {
    for (const p of game.powerups) {
      const x = p.x + Math.sin(p.spin) * 8;

      ctx.save();
      ctx.shadowBlur = game.lowPerf ? 0 : 22;
      ctx.shadowColor = p.type.color;
      ctx.fillStyle = hexToRgba(p.type.color, 0.92);
      ctx.beginPath();
      ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;

      if (p.type.id === "shield") {
        ctx.beginPath();
        ctx.arc(x, p.y, p.r * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type.id === "slow") {
        ctx.beginPath();
        ctx.moveTo(x, p.y);
        ctx.lineTo(x, p.y - p.r * 0.5);
        ctx.moveTo(x, p.y);
        ctx.lineTo(x + p.r * 0.4, p.y + p.r * 0.2);
        ctx.stroke();
      } else {
        ctx.font = "800 12px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("x2", x, p.y + 1);
      }
      ctx.restore();
    }
  }

  function drawBall() {
    if (game.state === "gameover" || game.state === "menu") return;

    const c = COLORS[ball.colorIndex];
    const nextColor = COLORS[(ball.colorIndex + 1) % COLORS.length];

    ctx.save();
    ctx.translate(ball.x, ball.y);
    const scale = 1 + ball.pulse * 0.22;
    ctx.scale(scale, scale);
    ctx.shadowBlur = 28 + ball.switchFlash * 22;
    ctx.shadowColor = c.hex;
    ctx.fillStyle = c.hex;
    ctx.beginPath(); ctx.arc(0, 0, ball.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath(); ctx.arc(-5, -6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.45 + ball.switchFlash * 0.25;
    ctx.strokeStyle = nextColor.hex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius + 10 + ball.pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (game.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawColorDots() {
    const total = COLORS.length;
    const spacing = 26;
    const startX = W / 2 - ((total - 1) * spacing) / 2;
    const y = H - safeBottom - 34;

    COLORS.forEach((c, i) => {
      const isCurrent = i === ball.colorIndex;
      ctx.save();
      ctx.globalAlpha = isCurrent ? 1 : 0.35;
      if (isCurrent) { ctx.shadowBlur = 16; ctx.shadowColor = c.hex; }
      ctx.fillStyle = c.hex;
      ctx.beginPath();
      ctx.arc(startX + i * spacing, y, isCurrent ? 8 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawText(text, x, y, size, color, weight = "800", alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "JetBrains Mono", ui-monospace, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function fitSize(text, maxWidth, baseSize, weight = "600") {
    let size = baseSize;

    while (size > 9) {
      ctx.font = `${weight} ${size}px "JetBrains Mono", ui-monospace, Consolas, monospace`;

      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 1;
    }

    return size;
  }

  function drawHUD() {
    if (["playing", "paused", "ready", "revive"].includes(game.state)) {
      const scoreY = safeTop + Math.max(78, H * 0.12);
      drawText(String(game.score), W / 2, scoreY, Math.min(72, W * 0.14), "rgba(255,255,255,0.95)", "900");

      let ey = scoreY + Math.min(40, H * 0.055);
      if (game.combo > 1) {
        drawText(`COMBO ${game.combo}`, W / 2, ey, Math.min(24, W * 0.05), "rgba(250,204,21,0.88)", "800");
        ey += 22;
      }
      if (game.slowTimer > 0) {
        drawText(`SLOW ${game.slowTimer.toFixed(1)}`, W / 2, ey, 16, "#a78bfa", "800");
        ey += 18;
      }
      if (game.doubleTimer > 0) {
        drawText(`X2 ${game.doubleTimer.toFixed(1)}`, W / 2, ey, 16, "#fb923c", "800");
      }
      drawColorDots();
    }
  }

  function drawPopups() {
    for (const p of game.popups) {
      drawText(p.text, p.x, p.y, p.size, p.color, "900", Math.max(0, p.life / p.maxLife));
    }
  }

  function drawReady() {
    const pulse = 0.7 + Math.sin(performance.now() / 120) * 0.3;
    drawText("GET READY", W / 2, H * 0.4, Math.min(44, W * 0.09), `rgba(255,255,255,${pulse})`, "900");
  }

  function getPanelLayout(desiredHeight, maxWidth = 440) {
    const panelW = Math.min(maxWidth, W - 28);
    const top = safeTop + 16;
    const bottom = H - safeBottom - 16;
    const availableH = Math.max(120, bottom - top);
    const panelH = Math.min(desiredHeight, availableH);
    const panelY = top + Math.max(0, (availableH - panelH) / 2);
    const panelX = (W - panelW) / 2;
    return { panelW, panelH, panelX, panelY };
  }

  function getButtons() {
    const buttons = [];
    const topY = safeTop + 32;
    const r = 20;
    buttons.push({ id: "sound", x: safeLeft + 34, y: topY, r, action: toggleSound });
    buttons.push({ id: "fx", x: safeLeft + 86, y: topY, r, action: toggleFx });
    if (game.state === "playing") {
      buttons.push({ id: "pause", x: W - safeRight - 34, y: topY, r, action: pauseGame });
    }
     if (game.state === "paused") {
      buttons.push({ id: "resume", x: W - safeRight - 34, y: topY, r, action: resumeGame });
    }
    if (
      (game.state === "menu" || game.state === "gameover") &&
      window.PlaygamaBridge &&
      window.PlaygamaBridge.hasLeaderboard
    ) {
      buttons.push({
        id: "board",
        x: W - safeRight - 34,
        y: topY,
        r,
        action: () => { if (window.PlaygamaBridge) window.PlaygamaBridge.showLeaderboard(); }
      });
    }
    return buttons;
  }

  function drawButtonIcon(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.lineCap = "round";

    if (b.id === "sound") {
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.beginPath();
      ctx.moveTo(-7, -3); ctx.lineTo(-3, -3); ctx.lineTo(2, -7);
      ctx.lineTo(2, 7); ctx.lineTo(-3, 3); ctx.lineTo(-7, 3);
      ctx.closePath(); ctx.fill();
      if (game.settings.sound) {
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(4, 0, 4, -0.7, 0.7); ctx.stroke();
        ctx.beginPath(); ctx.arc(4, 0, 7, -0.7, 0.7); ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(248,113,113,0.95)";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, 8); ctx.stroke();
      }
    }

    if (b.id === "fx") {
      ctx.strokeStyle = game.settings.fx ? "rgba(250,204,21,0.95)" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(0, 7);
      ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, -4); ctx.lineTo(4, 4);
      ctx.moveTo(4, -4); ctx.lineTo(-4, 4);
      ctx.stroke();
    }

    if (b.id === "pause") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(-6, -7, 4, 14);
      ctx.fillRect(2, -7, 4, 14);
    }

    if (b.id === "board") {
      ctx.fillStyle = "rgba(250,204,21,0.95)";
      ctx.fillRect(-8, -1, 4, 8);
      ctx.fillRect(-2, -7, 4, 14);
      ctx.fillRect(4, 1, 4, 6);
    }

    if (b.id === "resume") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.moveTo(-5, -8); ctx.lineTo(8, 0); ctx.lineTo(-5, 8);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawButtons() {
    for (const b of getButtons()) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.strokeStyle = "rgba(0,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      drawButtonIcon(b);
      ctx.restore();
    }
  }

  function drawRectButton(rect, label, color, pulse) {
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = color;
    ctx.fillStyle = hexToRgba(color, 0.22);
    roundRect(rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, pulse * 0.7);
    ctx.lineWidth = 2;
    roundRect(rect.x, rect.y, rect.w, rect.h, 14);
    ctx.stroke();
    ctx.restore();
    drawText(label, rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(20, rect.h * 0.45), `rgba(255,255,255,${pulse})`, "900");
  }

  function drawMenu() {
    const layout = getPanelLayout(Math.min(430, H * 0.66), 440);
    const { panelW, panelH, panelX, panelY } = layout;
    const centerX = W / 2;

    drawPanel(panelX, panelY, panelW, panelH, 28);

    const menuTime = Number.isFinite(game.time) ? game.time : performance.now() / 1000;
    const accentIndex = ((Math.floor(menuTime * 1.5) % COLORS.length) + COLORS.length) % COLORS.length;
    const accent = (COLORS[accentIndex] || COLORS[0]).hex;
    const textSize = Math.min(18, W * 0.042, panelW * 0.045);

    const pos = logoLoaded
      ? { i1: 0.46, i2: 0.55, i3: 0.64, best: 0.72, stats: 0.78, btn: 0.84 }
      : { i1: 0.34, i2: 0.43, i3: 0.52, best: 0.62, stats: 0.70, btn: 0.78 };

    if (logoLoaded) {
      const bx = panelX + 14, by = panelY + 14, bw = panelW - 28, bh = panelH * 0.30;
      ctx.save();
      roundRect(bx, by, bw, bh, 18);
      ctx.clip();
      const scale = Math.max(bw / logoImg.width, bh / logoImg.height);
      const dw = logoImg.width * scale, dh = logoImg.height * scale;
      ctx.drawImage(logoImg, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      const titleSize = fitSize("COLOR SWITCH BLAST", panelW - 24, Math.min(38, W * 0.085), "900");
      drawText("COLOR SWITCH BLAST", centerX + 2, panelY + panelH * 0.12 + 2, titleSize, hexToRgba(accent, 0.35), "900");
      drawText("COLOR SWITCH BLAST", centerX, panelY + panelH * 0.12, titleSize, "#ffffff", "900");
      const dotY = panelY + panelH * 0.21;
      COLORS.forEach((c, i) => {
        const active = i === accentIndex;
        ctx.save();
        ctx.globalAlpha = active ? 1 : 0.3;
        if (active) { ctx.shadowBlur = 18; ctx.shadowColor = c.hex; }
        ctx.fillStyle = c.hex;
        ctx.beginPath();
        ctx.arc(centerX + (i - 1.5) * 34, dotY, active ? 8 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    const lines = [
      "Tap / click / Space = switch color",
      "Match ball color with beam to pass",
      "Power-ups • last-moment = PERFECT"
    ];

    const maxTextW = panelW - 32;

    let instrSize = textSize;
    for (const line of lines) {
      instrSize = Math.min(instrSize, fitSize(line, maxTextW, textSize, "600"));
    }

    drawText(lines[0], centerX, panelY + panelH * pos.i1, instrSize, "rgba(255,255,255,0.78)", "600");
    drawText(lines[1], centerX, panelY + panelH * pos.i2, instrSize, "rgba(255,255,255,0.78)", "600");
    drawText(lines[2], centerX, panelY + panelH * pos.i3, instrSize, "rgba(255,255,255,0.78)", "600");

    const bestLine = `Best: ${game.best}`;
    drawText(bestLine, centerX, panelY + panelH * pos.best, fitSize(bestLine, maxTextW, textSize, "800"), "rgba(255,255,255,0.82)", "800");

    if (profile.games > 0) {
      const statsLine = `Games: ${profile.games} • Perfects: ${profile.perfects}`;
      drawText(statsLine, centerX, panelY + panelH * pos.stats, fitSize(statsLine, maxTextW, textSize * 0.85, "600"), "rgba(255,255,255,0.55)", "600");
    }

    const buttonW = panelW * 0.72;
    const buttonH = 46;
    const buttonY = panelY + panelH * pos.btn;
    const pulse = 0.72 + Math.sin(menuTime * 5) * 0.28;

    drawRectButton({ x: centerX - buttonW / 2, y: buttonY, w: buttonW, h: buttonH }, "TAP TO START", accent, pulse);

    const footerY = Math.min(H - safeBottom - 14, panelY + panelH + 20);
    drawText(`VRX GAMES  •  ${GAME_VERSION}`, centerX, footerY, Math.min(13, W * 0.032), "rgba(0,255,255,0.55)", "700");
  }

  function drawRevive() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, W, H);

    const layout = getPanelLayout(Math.min(280, H * 0.42), 380);
    const { panelW, panelH, panelX, panelY } = layout;
    const centerX = W / 2;

    drawPanel(panelX, panelY, panelW, panelH, 26);

    drawText("CONTINUE?", centerX, panelY + panelH * 0.16, Math.min(38, W * 0.08), "#ffffff", "900");
    drawText(`Score: ${game.score}`, centerX, panelY + panelH * 0.32, Math.min(22, W * 0.05), "rgba(255,255,255,0.85)", "800");

    const useAd = !!((window.PlaygamaBridge && window.PlaygamaBridge.adsAvailable) || (window.GamePixBridge && window.GamePixBridge.adsAvailable));
    const bw = panelW * 0.72;

    const adRect = { x: centerX - bw / 2, y: panelY + panelH * 0.46, w: bw, h: 46 };
    const noRect = { x: centerX - bw / 2, y: panelY + panelH * 0.46 + 56, w: bw, h: 34 };

    game.uiRects.reviveAd = adRect;
    game.uiRects.reviveNo = noRect;

    const pulse = 0.75 + Math.sin(performance.now() / 250) * 0.25;
    drawRectButton(adRect, useAd ? "REVIVE — WATCH AD" : "FREE REVIVE", "#4ade80", pulse);
    drawRectButton(noRect, "NO THANKS", "#94a3b8", 0.7);
  }

  function drawGameOver() {
    const layout = getPanelLayout(Math.min(440, H * 0.68), 420);
    const { panelW, panelH, panelX, panelY } = layout;
    const centerX = W / 2;

    drawPanel(panelX, panelY, panelW, panelH, 28);

    const titleSize = Math.min(44, W * 0.095, panelW * 0.12);
    const textSize = Math.min(24, W * 0.05, panelW * 0.055);

    drawText("GAME OVER", centerX, panelY + panelH * 0.12, titleSize, "#ffffff", "900");
    if (game.newBest) drawText("NEW BEST!", centerX, panelY + panelH * 0.22, textSize * 0.8, "#facc15", "900");
    drawText(`Score: ${game.score}`, centerX, panelY + panelH * 0.33, textSize, "rgba(255,255,255,0.92)", "800");
    drawText(`Perfects: ${game.runPerfects}`, centerX, panelY + panelH * 0.43, textSize * 0.8, "rgba(255,255,255,0.78)", "800");
    drawText(`Max Combo: ${game.maxCombo}`, centerX, panelY + panelH * 0.52, textSize * 0.8, "rgba(250,204,21,0.82)", "800");
    drawText(`Best: ${game.best}`, centerX, panelY + panelH * 0.61, textSize * 0.85, "rgba(255,255,255,0.75)", "700");

    const bw = panelW * 0.72;
    const restartRect = { x: centerX - bw / 2, y: panelY + panelH * 0.70, w: bw, h: 44 };
    const shareRect = { x: centerX - bw / 2, y: panelY + panelH * 0.70 + 52, w: bw, h: 34 };

    game.uiRects.shareOver = shareRect;

    const pulse = 0.72 + Math.sin(performance.now() / 300) * 0.28;
    drawRectButton(restartRect, "TAP TO RESTART", "#22d3ee", pulse);
    drawRectButton(shareRect, "SHARE SCORE", "#4ade80", 0.7);
  }

  function drawPaused() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, W, H);

    const layout = getPanelLayout(Math.min(220, H * 0.34), 360);
    const { panelW, panelH, panelX, panelY } = layout;

    drawPanel(panelX, panelY, panelW, panelH, 26);
    drawText("PAUSED", W / 2, panelY + panelH * 0.30, Math.min(46, W * 0.09), "#ffffff", "900");
    drawText("Tap to resume", W / 2, panelY + panelH * 0.55, Math.min(22, W * 0.045), "rgba(255,255,255,0.8)", "700");
    drawText("Press P to pause/unpause", W / 2, panelY + panelH * 0.72, Math.min(17, W * 0.035), "rgba(255,255,255,0.55)", "600");
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (game.shake > 0) {
      ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
    }

    drawBackground();

    if (game.state === "menu") drawDemoWalls();
    else drawWalls();

    drawPowerups();
    drawParticles();
    drawBall();
    drawHUD();
    drawPopups();

    if (game.state === "ready") drawReady();
    if (game.state === "menu") drawMenu();
    if (game.state === "revive") drawRevive();
    if (game.state === "gameover") drawGameOver();
    if (game.state === "paused") drawPaused();

    ctx.restore();

    drawButtons();
  }

  function frame(now) {
    const rawDt = (now - lastTime) / 1000;
    const dt = Math.min(rawDt, 0.033);
    lastTime = now;

    if (rawDt > 0 && rawDt < 0.25 && game.state === "playing") {
      const fps = 1 / rawDt;
      fpsAvg = fpsAvg === 0 ? fps : fpsAvg * 0.95 + fps * 0.05;
      if (!game.lowPerf && fpsAvg < 45) {
        lowPerfTimer += rawDt;
        if (lowPerfTimer > 2) game.lowPerf = true;
      } else lowPerfTimer = 0;
    }

    try {
      update(dt);
      draw();
    } catch (error) {
      console.error("Frame error:", error);
    }

    if (!loaderHidden && !loaderTimeoutSet) {
      loaderTimeoutSet = true;
      setTimeout(() => hideLoader(), 250);
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  window.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ensureAudio();

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const b of getButtons()) {
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= (b.r + 10) * (b.r + 10)) {
        b.action();
        return;
      }
    }

    if (game.state === "revive") {
      if (inRect(x, y, game.uiRects.reviveAd)) { tryRevive(); return; }
      if (inRect(x, y, game.uiRects.reviveNo)) { declineRevive(); return; }
      return;
    }

    if (game.state === "gameover" && inRect(x, y, game.uiRects.shareOver)) {
      shareGame("over");
      return;
    }

    action();
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") {
      e.preventDefault();
      ensureAudio();
      action();
    }
    if (e.code === "KeyP") togglePause();
    if (e.code === "KeyM") toggleSound();
    if (e.code === "KeyF") toggleFx();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === "playing") pauseGame();
  });

  window.addEventListener("blur", pauseGame);

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  window.ColorSwitchBlast = {
    pause: pauseGame,
    resume: resumeGame,
    restart: startGame,
    getState() {
      return {
        state: game.state,
        score: game.score,
        best: game.best,
        combo: game.combo,
        maxCombo: game.maxCombo,
        settings: game.settings
      };
    }
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const type = data.type || data.action;
    if (type === "pause" || type === "yt-playables:pause" || type === "playables:pause") pauseGame();
    if (type === "resume" || type === "yt-playables:resume" || type === "playables:resume") resumeGame();
    if (type === "restart" || type === "yt-playables:restart" || type === "playables:restart") startGame();
  });

  resize();
  requestAnimationFrame(frame);
})();