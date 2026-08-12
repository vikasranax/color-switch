(() => {
  const canvas = document.getElementById("game");

  if (!canvas) {
    return;
  }

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

    loaderLogo.addEventListener("error", () => {
      loaderLogo.remove();
    });
  }

  const logoImg = new Image();
  let logoLoaded = false;

  logoImg.onload = () => {
    logoLoaded = true;
  };

  logoImg.src = "logo.png";

  const COLORS = [
    { name: "cyan", hex: "#22d3ee" },
    { name: "pink", hex: "#f472b6" },
    { name: "yellow", hex: "#facc15" },
    { name: "green", hex: "#4ade80" }
  ];

  const MAX_SCORE = 9999;
  const MAX_COUNTER = 1000000;
  const SECRET = "csb-v3-integrity";
  const GAME_VERSION = "v2.0";

  const STORAGE_KEYS = {
    profile: "color-switch-blast-profile",
    settings: "color-switch-blast-settings",
    legacyBest: "color-switch-blast-best"
  };

  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Storage not available
      }
    }
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

    if (!raw) {
      return Object.assign({}, defaults);
    }

    const idx = raw.lastIndexOf(".");

    if (idx === -1) {
      return Object.assign({}, defaults);
    }

    const json = raw.slice(0, idx);
    const hash = raw.slice(idx + 1);

    if (hashString(json + SECRET) !== hash) {
      return Object.assign({}, defaults);
    }

    try {
      return Object.assign({}, defaults, JSON.parse(json));
    } catch {
      return Object.assign({}, defaults);
    }
  }

  function clampNum(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  const profile = loadSecure(STORAGE_KEYS.profile, {
    best: 0,
    games: 0,
    perfects: 0
  });

  profile.best = clampNum(profile.best, 0, MAX_SCORE, 0);
  profile.games = clampNum(profile.games, 0, MAX_COUNTER, 0);
  profile.perfects = clampNum(profile.perfects, 0, MAX_COUNTER, 0);

  const legacyBest = clampNum(
    Number(storage.get(STORAGE_KEYS.legacyBest) || 0),
    0,
    MAX_SCORE,
    0
  );

  if (legacyBest > profile.best) {
    profile.best = legacyBest;
  }

  const settings = loadSecure(STORAGE_KEYS.settings, {
    sound: true,
    fx: true
  });

  settings.sound = settings.sound !== false;
  settings.fx = settings.fx !== false;

  function saveProfile() {
    saveSecure(STORAGE_KEYS.profile, {
      best: profile.best,
      games: profile.games,
      perfects: profile.perfects
    });
  }

  function saveSettings() {
    saveSecure(STORAGE_KEYS.settings, settings);
  }

  let W = 0;
  let H = 0;
  let dpr = 1;
  let lastTime = performance.now();
  let audioCtx = null;
  let fpsAvg = 0;
  let lowPerfTimer = 0;

  let safeTop = 0;
  let safeRight = 0;
  let safeBottom = 0;
  let safeLeft = 0;

  let loaderHidden = false;
  let loaderTimeoutSet = false;

  const game = {
    state: "menu", // menu, ready, playing, paused, gameover
    time: 0,
    readyTimer: 0,
    score: 0,
    best: profile.best,
    speed: 185,
    spawnTimer: 0.55,
    spawnInterval: 1.08,
    walls: [],
    demoWalls: [],
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
    settings
  };

  const ball = {
    colorIndex: 0,
    radius: 17,
    pulse: 0,
    switchFlash: 0,
    get x() {
      return W / 2;
    },
    get y() {
      return H * 0.76;
    }
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
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 2 + 0.4,
      speed: Math.random() * 25 + 8,
      alpha: Math.random() * 0.35 + 0.08
    }));
  }

  function makeOrbs() {
    game.orbs = Array.from({ length: 7 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      radius: 30 + Math.random() * 95,
      speed: 5 + Math.random() * 16,
      drift: Math.random() * 20 - 10,
      alpha: 0.035 + Math.random() * 0.06,
      colorIndex: Math.floor(Math.random() * COLORS.length)
    }));
  }

  function hideLoader() {
    if (loader && !loaderHidden) {
      loaderHidden = true;
      loader.classList.add("hidden");

      setTimeout(() => {
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
      }, 500);

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

  function vibrate(pattern) {
    if (!game.settings.fx) return;

    try {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Haptics not available
    }
  }

  function ensureAudio() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
    } catch {
      // Audio not available
    }
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
    } catch {
      // Ignore audio errors
    }
  }

  function playTone(freq, duration = 0.08, type = "sine", volume = 0.03) {
    toneAt(freq, duration, type, volume, 0);
  }

  let musicTimer = null;
  let musicStep = 0;

  const MUSIC_SCALE = [220, 261.63, 293.66, 329.63, 392, 440];

  function startMusic() {
    if (musicTimer || !game.settings.sound) return;

    ensureAudio();

    musicTimer = setInterval(() => {
      if (!audioCtx || game.state === "paused") return;

      if (musicStep % 4 === 0) {
        toneAt(MUSIC_SCALE[0] / 2, 0.4, "sine", 0.015, 0);
      }

      const note =
        MUSIC_SCALE[(musicStep * 3 + (game.combo % 4)) % MUSIC_SCALE.length];

      toneAt(note, 0.18, "triangle", 0.012, 0);

      musicStep++;
    }, 240);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function playClick() {
    playTone(360, 0.05, "triangle", 0.025);
  }

  function playSwitch() {
    playTone(260 + ball.colorIndex * 75, 0.055, "triangle", 0.025);
  }

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

  function toggleSound() {
    game.settings.sound = !game.settings.sound;
    saveSettings();

    if (game.settings.sound) {
      ensureAudio();
      playClick();

      if (game.state === "playing") {
        startMusic();
      }
    } else {
      stopMusic();
    }
  }

  function toggleFx() {
    game.settings.fx = !game.settings.fx;
    saveSettings();
    playClick();
  }

  function addShake(amount) {
    if (!game.settings.fx) return;
    game.shake = Math.max(game.shake, amount);
  }

  function addParticles(x, y, color, count, spread = 1, life = 0.7) {
    if (game.lowPerf) {
      count = Math.ceil(count / 2);
    }

    if (!game.settings.fx) {
      count = Math.min(3, count);
      spread *= 0.4;
      life *= 0.5;
    }

    for (let i = 0; i < count; i++) {
      game.particles.push({
        x,
        y,
        color,
        vx: (Math.random() - 0.5) * 360 * spread,
        vy: (Math.random() - 0.8) * 360 * spread,
        life: Math.random() * life + 0.15,
        size: Math.random() * 3.5 + 1
      });
    }
  }

  function addPopup(text, color, x, y, size = 24) {
    game.popups.push({
      text,
      color,
      x,
      y,
      size,
      life: 0.95,
      maxLife: 0.95
    });
  }

  function pickWallOffset() {
    const same = Math.max(0.08, 0.20 - game.score * 0.001);
    const one = 0.46;
    const two = 0.32;
    const three = Math.min(0.24, 0.08 + game.score * 0.001);

    const total = same + one + two + three;
    let r = Math.random() * total;

    if ((r -= same) < 0) return 0;
    if ((r -= one) < 0) return 1;
    if ((r -= two) < 0) return 2;

    return 3;
  }

  function spawnWall() {
    const offset = pickWallOffset();
    const colorIndex = (ball.colorIndex + offset) % COLORS.length;

    game.walls.push({
      y: -80,
      height: 30,
      colorIndex,
      passed: false,
      glow: 0
    });
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

  function gameOver() {
    game.state = "gameover";
    game.gameOverAt = performance.now();

    stopMusic();
    addShake(18);
    vibrate([40, 60, 40]);

    game.bgFlash = 0.22;
    game.bgFlashColor = "#ef4444";

    game.newBest = game.score > profile.best;

    if (game.newBest) {
      profile.best = game.score;
      game.best = profile.best;
    }

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

  function action() {
    if (game.state === "menu") {
      startGame();
      return;
    }

    if (game.state === "ready") {
      switchColor();
      return;
    }

    if (game.state === "paused") {
      resumeGame();
      return;
    }

    if (game.state === "playing") {
      switchColor();
      return;
    }

    if (game.state === "gameover" && performance.now() - game.gameOverAt > 500) {
      startGame();
    }
  }

  function pauseGame() {
    if (game.state === "playing") {
      game.state = "paused";
    }
  }

  function resumeGame() {
    if (game.state === "paused") {
      game.state = "playing";
      lastTime = performance.now();
    }
  }

  function togglePause() {
    if (game.state === "playing") {
      pauseGame();
    } else if (game.state === "paused") {
      resumeGame();
    }
  }

  function updateStars(dt) {
    const multiplier = game.state === "playing" ? 1.8 : 0.5;

    for (const star of game.stars) {
      star.y += star.speed * multiplier * dt;

      if (star.y > H + 10) {
        star.y = -10;
        star.x = Math.random() * W;
      }
    }
  }

  function updateOrbs(dt) {
    for (const orb of game.orbs) {
      orb.y -= orb.speed * dt;
      orb.x += Math.sin(game.time * 0.25 + orb.drift) * 6 * dt;

      if (orb.y < -orb.radius * 2) {
        orb.y = H + orb.radius * 2;
        orb.x = Math.random() * W;
        orb.colorIndex = Math.floor(Math.random() * COLORS.length);
      }
    }
  }

  function updateParticles(dt) {
    for (const p of game.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
      p.life -= dt;
    }

    game.particles = game.particles.filter(p => p.life > 0);
  }

  function updatePopups(dt) {
    for (const p of game.popups) {
      p.y -= 48 * dt;
      p.life -= dt;
    }

    game.popups = game.popups.filter(p => p.life > 0);
  }

  function updateDemoWalls(dt) {
    game.demoSpawnTimer -= dt;

    if (game.demoSpawnTimer <= 0) {
      game.demoSpawnTimer = 1.2;

      game.demoWalls.push({
        y: -80,
        height: 26,
        colorIndex: Math.floor(Math.random() * COLORS.length),
        glow: 0
      });
    }

    for (const wall of game.demoWalls) {
      wall.y += 70 * dt;
    }

    game.demoWalls = game.demoWalls.filter(wall => wall.y < H + 100);
  }

  function update(dt) {
    if (game.state === "paused") {
      return;
    }

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

    if (game.state === "menu") {
      updateDemoWalls(dt);
      return;
    }

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

    if (game.state !== "playing") {
      return;
    }

    game.trailTimer -= dt;

    if (game.trailTimer <= 0) {
      game.trailTimer = 0.035;

      if (game.settings.fx) {
        addParticles(
          ball.x,
          ball.y + ball.radius * 0.6,
          COLORS[ball.colorIndex].hex,
          1,
          0.03,
          0.22
        );
      }
    }

    game.spawnTimer -= dt;

    if (game.spawnTimer <= 0) {
      spawnWall();
      game.spawnInterval = Math.max(0.44, 1.08 - game.score * 0.0045);
      game.spawnTimer = game.spawnInterval;
    }

    game.speed = Math.min(
      560,
      185 + game.score * 4.2 + Math.floor(game.score / 10) * 12
    );

    for (const wall of game.walls) {
      wall.y += game.speed * dt;
      wall.glow = Math.max(0, wall.glow - 3 * dt);

      if (!wall.passed && wall.y + wall.height >= ball.y - ball.radius) {
        wall.passed = true;

        if (wall.colorIndex === ball.colorIndex) {
          const nowSec = performance.now() / 1000;
          const switchDelta = nowSec - game.lastSwitchAt;
          const perfect = switchDelta >= 0 && switchDelta <= game.perfectWindow;

          const comboBonus = Math.min(5, Math.floor(game.combo / 5));
          const points = 1 + (perfect ? 1 : 0) + comboBonus;

          game.score = Math.min(MAX_SCORE, game.score + points);
          game.combo += 1;
          game.maxCombo = Math.max(game.maxCombo, game.combo);

          wall.glow = 1;

          if (perfect) {
            game.runPerfects += 1;
            profile.perfects = Math.min(MAX_COUNTER, profile.perfects + 1);

            game.hitStop = game.settings.fx ? 0.045 : 0.02;
            game.bgFlash = 0.16;
            game.bgFlashColor = COLORS[wall.colorIndex].hex;

            addShake(5);
            vibrate(15);

            addParticles(
              ball.x,
              ball.y,
              COLORS[wall.colorIndex].hex,
              28,
              1.2,
              0.9
            );

            addPopup(
              `PERFECT +${points}`,
              "#ffffff",
              ball.x,
              ball.y - 72,
              28
            );

            playPerfect();
          } else {
            addParticles(
              ball.x,
              ball.y,
              COLORS[wall.colorIndex].hex,
              14,
              0.8,
              0.65
            );

            addPopup(
              `+${points}`,
              COLORS[wall.colorIndex].hex,
              ball.x,
              ball.y - 56,
              22
            );

            playPass();
          }

          if (game.combo % 5 === 0) {
            addPopup(
              `COMBO ${game.combo}`,
              "#facc15",
              W / 2,
              H * 0.26,
              30
            );
          }
        } else {
          gameOver();
          break;
        }
      }
    }

    game.walls = game.walls.filter(wall => wall.y < H + 100);
  }

  function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#080812");
    bg.addColorStop(0.55, "#0b1020");
    bg.addColorStop(1, "#111827");

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (game.settings.fx && !game.lowPerf) {
      for (const orb of game.orbs) {
        const c = COLORS[orb.colorIndex];

        const gradient = ctx.createRadialGradient(
          orb.x,
          orb.y,
          0,
          orb.x,
          orb.y,
          orb.radius
        );

        gradient.addColorStop(0, hexToRgba(c.hex, orb.alpha));
        gradient.addColorStop(1, hexToRgba(c.hex, 0));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const star of game.stars) {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
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

    ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
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

    const x = 18;
    const w = W - 36;
    const y = wall.y;
    const h = wall.height;

    const pulse = isMatch ? 0.5 + Math.sin(performance.now() / 180) * 0.18 : 0;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.shadowBlur = game.lowPerf
      ? 0
      : 22 + wall.glow * 30 + pulse * 16;
    ctx.shadowColor = c.hex;

    ctx.fillStyle = hexToRgba(c.hex, 0.20 + wall.glow * 0.18 + pulse * 0.10);
    roundRect(x, y, w, h, 16);
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = hexToRgba(c.hex, 0.88);
    ctx.beginPath();
    ctx.arc(x + 12, y + h / 2, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + w - 12, y + h / 2, 7, 0, Math.PI * 2);
    ctx.fill();

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
    for (const wall of game.demoWalls) {
      drawWallBeam(wall, 0.28, false);
    }
  }

  function drawBall() {
    if (game.state === "gameover" || game.state === "menu") {
      return;
    }

    const c = COLORS[ball.colorIndex];
    const nextColor = COLORS[(ball.colorIndex + 1) % COLORS.length];

    ctx.save();

    ctx.translate(ball.x, ball.y);

    const scale = 1 + ball.pulse * 0.22;
    ctx.scale(scale, scale);

    ctx.shadowBlur = 28 + ball.switchFlash * 22;
    ctx.shadowColor = c.hex;

    ctx.fillStyle = c.hex;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(-5, -6, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.45 + ball.switchFlash * 0.25;
    ctx.strokeStyle = nextColor.hex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      ball.x,
      ball.y,
      ball.radius + 10 + ball.pulse * 8,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
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

      if (isCurrent) {
        ctx.shadowBlur = 16;
        ctx.shadowColor = c.hex;
      }

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
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawHUD() {
    if (
      game.state === "playing" ||
      game.state === "paused" ||
      game.state === "ready"
    ) {
      const scoreY = safeTop + Math.max(78, H * 0.12);

      drawText(
        String(game.score),
        W / 2,
        scoreY,
        Math.min(72, W * 0.14),
        "rgba(255,255,255,0.95)",
        "900"
      );

      if (game.combo > 1) {
        drawText(
          `COMBO ${game.combo}`,
          W / 2,
          scoreY + Math.min(40, H * 0.055),
          Math.min(24, W * 0.05),
          "rgba(250,204,21,0.88)",
          "800"
        );
      }

      drawColorDots();
    }
  }

  function drawPopups() {
    for (const p of game.popups) {
      drawText(
        p.text,
        p.x,
        p.y,
        p.size,
        p.color,
        "900",
        Math.max(0, p.life / p.maxLife)
      );
    }
  }

  function drawReady() {
    const pulse = 0.7 + Math.sin(performance.now() / 120) * 0.3;

    drawText(
      "GET READY",
      W / 2,
      H * 0.4,
      Math.min(44, W * 0.09),
      `rgba(255,255,255,${pulse})`,
      "900"
    );
  }

  function getPanelLayout(desiredHeight, maxWidth = 440) {
    const panelW = Math.min(maxWidth, W - 28);
    const top = safeTop + 16;
    const bottom = H - safeBottom - 16;
    const availableH = Math.max(120, bottom - top);
    const panelH = Math.min(desiredHeight, availableH);
    const panelY = top + Math.max(0, (availableH - panelH) / 2);
    const panelX = (W - panelW) / 2;

    return {
      panelW,
      panelH,
      panelX,
      panelY
    };
  }

  function getButtons() {
    const buttons = [];
    const topY = safeTop + 32;
    const r = 20;

    buttons.push({
      id: "sound",
      x: safeLeft + 34,
      y: topY,
      r,
      action: toggleSound
    });

    buttons.push({
      id: "fx",
      x: safeLeft + 86,
      y: topY,
      r,
      action: toggleFx
    });

    if (game.state === "playing") {
      buttons.push({
        id: "pause",
        x: W - safeRight - 34,
        y: topY,
        r,
        action: pauseGame
      });
    }

    if (game.state === "paused") {
      buttons.push({
        id: "resume",
        x: W - safeRight - 34,
        y: topY,
        r,
        action: resumeGame
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
      ctx.moveTo(-7, -3);
      ctx.lineTo(-3, -3);
      ctx.lineTo(2, -7);
      ctx.lineTo(2, 7);
      ctx.lineTo(-3, 3);
      ctx.lineTo(-7, 3);
      ctx.closePath();
      ctx.fill();

      if (game.settings.sound) {
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(4, 0, 4, -0.7, 0.7);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(4, 0, 7, -0.7, 0.7);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(248,113,113,0.95)";
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.moveTo(-9, -8);
        ctx.lineTo(9, 8);
        ctx.stroke();
      }
    }

    if (b.id === "fx") {
      const active = game.settings.fx;

      ctx.strokeStyle = active
        ? "rgba(250,204,21,0.95)"
        : "rgba(255,255,255,0.35)";

      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(0, 7);
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(4, 4);
      ctx.moveTo(4, -4);
      ctx.lineTo(-4, 4);
      ctx.stroke();
    }

    if (b.id === "pause") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(-6, -7, 4, 14);
      ctx.fillRect(2, -7, 4, 14);
    }

    if (b.id === "resume") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";

      ctx.beginPath();
      ctx.moveTo(-5, -8);
      ctx.lineTo(8, 0);
      ctx.lineTo(-5, 8);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawButtons() {
    const buttons = getButtons();

    for (const b of buttons) {
      ctx.save();

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      drawButtonIcon(b);

      ctx.restore();
    }
  }

  function drawMenu() {
    const layout = getPanelLayout(Math.min(430, H * 0.66), 440);

    const panelW = layout.panelW;
    const panelH = layout.panelH;
    const panelX = layout.panelX;
    const panelY = layout.panelY;
    const centerX = W / 2;

    drawPanel(panelX, panelY, panelW, panelH, 28);

    const menuTime = Number.isFinite(game.time)
      ? game.time
      : performance.now() / 1000;

    const accentIndex =
      ((Math.floor(menuTime * 1.5) % COLORS.length) + COLORS.length) %
      COLORS.length;

    const accent = (COLORS[accentIndex] || COLORS[0]).hex;

    const textSize = Math.min(18, W * 0.042, panelW * 0.045);

    const pos = logoLoaded
      ? { i1: 0.46, i2: 0.55, i3: 0.64, best: 0.72, stats: 0.78, btn: 0.84 }
      : { i1: 0.34, i2: 0.43, i3: 0.52, best: 0.62, stats: 0.70, btn: 0.78 };

    if (logoLoaded) {
      const bannerX = panelX + 14;
      const bannerY = panelY + 14;
      const bannerW = panelW - 28;
      const bannerH = panelH * 0.30;

      ctx.save();
      roundRect(bannerX, bannerY, bannerW, bannerH, 18);
      ctx.clip();

      const scale = Math.max(
        bannerW / logoImg.width,
        bannerH / logoImg.height
      );

      const dw = logoImg.width * scale;
      const dh = logoImg.height * scale;

      ctx.drawImage(
        logoImg,
        bannerX + (bannerW - dw) / 2,
        bannerY + (bannerH - dh) / 2,
        dw,
        dh
      );

      ctx.restore();
    } else {
      const titleSize = Math.min(38, W * 0.085, panelW * 0.11);

      drawText(
        "COLOR SWITCH BLAST",
        centerX + 2,
        panelY + panelH * 0.12 + 2,
        titleSize,
        hexToRgba(accent, 0.35),
        "900"
      );

      drawText(
        "COLOR SWITCH BLAST",
        centerX,
        panelY + panelH * 0.12,
        titleSize,
        "#ffffff",
        "900"
      );

      const dotY = panelY + panelH * 0.21;

      COLORS.forEach((c, i) => {
        const active = i === accentIndex;

        ctx.save();
        ctx.globalAlpha = active ? 1 : 0.3;

        if (active) {
          ctx.shadowBlur = 18;
          ctx.shadowColor = c.hex;
        }

        ctx.fillStyle = c.hex;
        ctx.beginPath();
        ctx.arc(centerX + (i - 1.5) * 34, dotY, active ? 8 : 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });
    }

    drawText(
      "Tap, click, or press Space to switch color",
      centerX,
      panelY + panelH * pos.i1,
      textSize,
      "rgba(255,255,255,0.78)",
      "600"
    );

    drawText(
      "Match your ball color with the beam to pass",
      centerX,
      panelY + panelH * pos.i2,
      textSize,
      "rgba(255,255,255,0.78)",
      "600"
    );

    drawText(
      "Switch at the last moment for PERFECT bonus",
      centerX,
      panelY + panelH * pos.i3,
      textSize,
      "rgba(255,255,255,0.78)",
      "600"
    );

    drawText(
      `Best: ${game.best}`,
      centerX,
      panelY + panelH * pos.best,
      textSize,
      "rgba(255,255,255,0.82)",
      "800"
    );

    if (profile.games > 0) {
      drawText(
        `Games: ${profile.games}  •  Perfects: ${profile.perfects}`,
        centerX,
        panelY + panelH * pos.stats,
        textSize * 0.85,
        "rgba(255,255,255,0.55)",
        "600"
      );
    }

    const buttonW = panelW * 0.72;
    const buttonH = 46;
    const buttonX = centerX - buttonW / 2;
    const buttonY = panelY + panelH * pos.btn;

    const pulse = 0.72 + Math.sin(menuTime * 5) * 0.28;

    ctx.save();

    ctx.shadowBlur = 18;
    ctx.shadowColor = accent;

    ctx.fillStyle = hexToRgba(accent, 0.22);
    roundRect(buttonX, buttonY, buttonW, buttonH, 16);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(accent, pulse * 0.65);
    ctx.lineWidth = 2;
    roundRect(buttonX, buttonY, buttonW, buttonH, 16);
    ctx.stroke();

    ctx.restore();

    drawText(
      "TAP TO START",
      centerX,
      buttonY + buttonH / 2,
      Math.min(24, W * 0.055),
      `rgba(255,255,255,${pulse})`,
      "900"
    );

    const footerY = Math.min(H - safeBottom - 14, panelY + panelH + 20);

    drawText(
      `VRX GAMES  •  ${GAME_VERSION}`,
      centerX,
      footerY,
      Math.min(13, W * 0.032),
      "rgba(255,255,255,0.45)",
      "700"
    );
  }

  function drawGameOver() {
    const layout = getPanelLayout(Math.min(420, H * 0.64), 420);

    const panelW = layout.panelW;
    const panelH = layout.panelH;
    const panelX = layout.panelX;
    const panelY = layout.panelY;
    const centerX = W / 2;

    drawPanel(panelX, panelY, panelW, panelH, 28);

    const titleSize = Math.min(44, W * 0.095, panelW * 0.12);
    const textSize = Math.min(24, W * 0.05, panelW * 0.055);

    drawText(
      "GAME OVER",
      centerX,
      panelY + panelH * 0.13,
      titleSize,
      "#ffffff",
      "900"
    );

    if (game.newBest) {
      drawText(
        "NEW BEST!",
        centerX,
        panelY + panelH * 0.24,
        textSize * 0.8,
        "#facc15",
        "900"
      );
    }

    drawText(
      `Score: ${game.score}`,
      centerX,
      panelY + panelH * 0.35,
      textSize,
      "rgba(255,255,255,0.92)",
      "800"
    );

    drawText(
      `Perfects: ${game.runPerfects}`,
      centerX,
      panelY + panelH * 0.46,
      textSize * 0.8,
      "rgba(255,255,255,0.78)",
      "800"
    );

    drawText(
      `Max Combo: ${game.maxCombo}`,
      centerX,
      panelY + panelH * 0.55,
      textSize * 0.8,
      "rgba(250,204,21,0.82)",
      "800"
    );

    drawText(
      `Best: ${game.best}`,
      centerX,
      panelY + panelH * 0.64,
      textSize * 0.85,
      "rgba(255,255,255,0.75)",
      "700"
    );

    const buttonW = panelW * 0.72;
    const buttonH = 46;
    const buttonX = centerX - buttonW / 2;
    const buttonY = panelY + panelH * 0.80;

    const pulse = 0.72 + Math.sin(performance.now() / 300) * 0.28;

    ctx.save();

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(buttonX, buttonY, buttonW, buttonH, 16);
    ctx.fill();

    ctx.strokeStyle = `rgba(255,255,255,${pulse * 0.5})`;
    ctx.lineWidth = 2;
    roundRect(buttonX, buttonY, buttonW, buttonH, 16);
    ctx.stroke();

    ctx.restore();

    drawText(
      "TAP TO RESTART",
      centerX,
      buttonY + buttonH / 2,
      Math.min(24, W * 0.055),
      `rgba(255,255,255,${pulse})`,
      "900"
    );
  }

  function drawPaused() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, W, H);

    const layout = getPanelLayout(Math.min(220, H * 0.34), 360);

    const panelW = layout.panelW;
    const panelH = layout.panelH;
    const panelX = layout.panelX;
    const panelY = layout.panelY;

    drawPanel(panelX, panelY, panelW, panelH, 26);

    drawText(
      "PAUSED",
      W / 2,
      panelY + panelH * 0.30,
      Math.min(46, W * 0.09),
      "#ffffff",
      "900"
    );

    drawText(
      "Tap to resume",
      W / 2,
      panelY + panelH * 0.55,
      Math.min(22, W * 0.045),
      "rgba(255,255,255,0.8)",
      "700"
    );

    drawText(
      "Press P to pause/unpause",
      W / 2,
      panelY + panelH * 0.72,
      Math.min(17, W * 0.035),
      "rgba(255,255,255,0.55)",
      "600"
    );
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();

    if (game.shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * game.shake,
        (Math.random() - 0.5) * game.shake
      );
    }

    drawBackground();

    if (game.state === "menu") {
      drawDemoWalls();
    } else {
      drawWalls();
    }

    drawParticles();
    drawBall();
    drawHUD();
    drawPopups();

    if (game.state === "ready") {
      drawReady();
    }

    if (game.state === "menu") {
      drawMenu();
    }

    if (game.state === "gameover") {
      drawGameOver();
    }

    if (game.state === "paused") {
      drawPaused();
    }

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

        if (lowPerfTimer > 2) {
          game.lowPerf = true;
        }
      } else {
        lowPerfTimer = 0;
      }
    }

    try {
      update(dt);
      draw();
    } catch (error) {
      console.error("Frame error:", error);
    }

    if (!loaderHidden && !loaderTimeoutSet) {
      loaderTimeoutSet = true;

      setTimeout(() => {
        hideLoader();
      }, 250);
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

    const buttons = getButtons();

    for (const b of buttons) {
      const dx = x - b.x;
      const dy = y - b.y;

      if (dx * dx + dy * dy <= (b.r + 10) * (b.r + 10)) {
        b.action();
        return;
      }
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

    if (e.code === "KeyP") {
      togglePause();
    }

    if (e.code === "KeyM") {
      toggleSound();
    }

    if (e.code === "KeyF") {
      toggleFx();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === "playing") {
      pauseGame();
    }
  });

  window.addEventListener("blur", () => {
    pauseGame();
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

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

    if (
      type === "pause" ||
      type === "yt-playables:pause" ||
      type === "playables:pause"
    ) {
      pauseGame();
    }

    if (
      type === "resume" ||
      type === "yt-playables:resume" ||
      type === "playables:resume"
    ) {
      resumeGame();
    }

    if (
      type === "restart" ||
      type === "yt-playables:restart" ||
      type === "playables:restart"
    ) {
      startGame();
    }
  });

  resize();
  requestAnimationFrame(frame);
})();