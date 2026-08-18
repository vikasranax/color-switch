(() => {
  const canvas = document.getElementById("game");
  if (!canvas) return;
  canvas.setAttribute("tabindex", "0");
  canvas.style.outline = "none";
  const ctx = canvas.getContext("2d");
  const loader = document.getElementById("loader");

  window.addEventListener("error", (e) => {
    const t = document.getElementById("loaderTitle");
    if (t && loader && document.body.contains(loader)) t.textContent = "ERROR: " + (e.message || "unknown");
  });

  const loaderLogo = document.getElementById("loaderLogo");
  if (loaderLogo) {
    loaderLogo.addEventListener("load", () => { const t = document.getElementById("loaderTitle"); if (t) t.style.display = "none"; });
    loaderLogo.addEventListener("error", () => loaderLogo.remove());
  }

  const logoImg = new Image();
  let logoLoaded = false;
  logoImg.onload = () => { logoLoaded = true; };
  logoImg.src = "logo.png?v=4.2";
  try { if (document.fonts && document.fonts.load) { document.fonts.load('800 20px "JetBrains Mono"'); document.fonts.load('600 14px "JetBrains Mono"'); } } catch {}

  const COLORS = [
    { name: "cyan", hex: "#22d3ee" }, { name: "pink", hex: "#f472b6" },
    { name: "yellow", hex: "#facc15" }, { name: "green", hex: "#4ade80" }
  ];
  const SYMBOLS = ["▲", "●", "■", "◆"];
  const MODES = [
    { id: "classic", name: "CLASSIC", desc: "ENDLESS • REVIVE • POWER-UPS", color: "#22d3ee" },
    { id: "time", name: "TIME ATTACK", desc: "60s • MISS = -3s", color: "#facc15" },
    { id: "zen", name: "ZEN", desc: "NO DEATH • PURE FLOW", color: "#4ade80" },
    { id: "hardcore", name: "HARDCORE", desc: "FAST • NO SAVES • X2", color: "#f472b6" }
  ];
  const POWERUPS = [
    { id: "shield", color: "#38bdf8", label: "SHIELD" },
    { id: "slow", color: "#a78bfa", label: "SLOW-MO" },
    { id: "double", color: "#fb923c", label: "DOUBLE POINTS" }
  ];
  const ACHIEVEMENTS = [
    { id: "first_run", name: "FIRST CONTACT", desc: "Play your first run", icon: "▶" },
    { id: "score_25", name: "WARMING UP", desc: "Score 25 in one run", icon: "★" },
    { id: "score_50", name: "HALF CENTURY", desc: "Score 50 in one run", icon: "★" },
    { id: "score_100", name: "CENTURION", desc: "Score 100 in one run", icon: "♛" },
    { id: "perfect_10", name: "PERFECTIONIST", desc: "10 total perfects", icon: "◆" },
    { id: "combo_10", name: "CHAIN REACTION", desc: "Reach 10 combo", icon: "⚡" },
    { id: "all_modes", name: "EXPLORER", desc: "Play all 4 modes", icon: "◈" },
    { id: "shield_save", name: "GUARDIAN", desc: "Save yourself with a shield", icon: "▣" },
    { id: "revive_used", name: "SECOND WIND", desc: "Use a revive", icon: "✚" },
    { id: "time_50", name: "CLOCK MASTER", desc: "Score 50 in Time Attack", icon: "⏱" },
    { id: "zen_50", name: "INNER PEACE", desc: "Score 50 in Zen", icon: "☯" },
    { id: "hard_50", name: "NO MERCY", desc: "Score 50 in Hardcore", icon: "☠" }
  ];
  const SETTINGS_ROWS = [
    { id: "colorblind", label: "COLORBLIND SYMBOLS" },
    { id: "sound", label: "SOUND" },
    { id: "fx", label: "FX / PARTICLES" },
    { id: "reducedMotion", label: "REDUCED MOTION" }
  ];
  const SHOP_ITEMS = [
    { name: "NEON TRAIL", icon: "✦" }, { name: "GOLD BALL", icon: "●" }, { name: "STAR FIELD", icon: "★" }
  ];
  const MILESTONES = [25, 50, 100, 150, 200, 300];
  const MAX_SCORE = 9999, MAX_COUNTER = 1000000;
  const SECRET = "csb-v4-integrity";
  const GAME_VERSION = "v4.2";
  const STORAGE_KEYS = { profile: "color-switch-blast-profile", settings: "color-switch-blast-settings", legacyBest: "color-switch-blast-best" };

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };
  function hashString(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function saveSecure(k, o) { const j = JSON.stringify(o); storage.set(k, j + "." + hashString(j + SECRET)); }
  function loadSecure(k, d) { const r = storage.get(k); if (!r) return Object.assign({}, d); const i = r.lastIndexOf("."); if (i === -1) return Object.assign({}, d); const j = r.slice(0, i), h = r.slice(i + 1); if (hashString(j + SECRET) !== h) return Object.assign({}, d); try { return Object.assign({}, d, JSON.parse(j)); } catch { return Object.assign({}, d); } }
  function clampNum(v, a, b, f) { if (!Number.isFinite(v)) return f; return Math.min(b, Math.max(a, v)); }

  const profile = loadSecure(STORAGE_KEYS.profile, { best: 0, games: 0, perfects: 0, bests: {}, achievements: {}, modesPlayed: {} });
  profile.best = clampNum(profile.best, 0, MAX_SCORE, 0);
  profile.games = clampNum(profile.games, 0, MAX_COUNTER, 0);
  profile.perfects = clampNum(profile.perfects, 0, MAX_COUNTER, 0);
  profile.bests = profile.bests && typeof profile.bests === "object" ? profile.bests : {};
  profile.achievements = profile.achievements && typeof profile.achievements === "object" ? profile.achievements : {};
  profile.modesPlayed = profile.modesPlayed && typeof profile.modesPlayed === "object" ? profile.modesPlayed : {};
  MODES.forEach((m) => { profile.bests[m.id] = clampNum(profile.bests[m.id], 0, MAX_SCORE, 0); });
  const legacyBest = clampNum(Number(storage.get(STORAGE_KEYS.legacyBest) || 0), 0, MAX_SCORE, 0);
  if (legacyBest > profile.best) profile.best = legacyBest;
  if (!profile.bests.classic && profile.best) profile.bests.classic = profile.best;

  const settings = loadSecure(STORAGE_KEYS.settings, { sound: true, fx: true, colorblind: false, reducedMotion: false });
  settings.sound = settings.sound !== false; settings.fx = settings.fx !== false;
  settings.colorblind = settings.colorblind === true; settings.reducedMotion = settings.reducedMotion === true;

  function getBest(m) { return clampNum(profile.bests[m], 0, MAX_SCORE, 0); }
  function saveProfile() { saveSecure(STORAGE_KEYS.profile, { best: profile.best, games: profile.games, perfects: profile.perfects, bests: profile.bests, achievements: profile.achievements, modesPlayed: profile.modesPlayed }); }
  function saveSettings() { saveSecure(STORAGE_KEYS.settings, settings); }

  let W = 0, H = 0, dpr = 1, lastTime = performance.now(), audioCtx = null, fpsAvg = 0, lowPerfTimer = 0;
  let safeTop = 0, safeRight = 0, safeBottom = 0, safeLeft = 0, loaderHidden = false, loaderTimeoutSet = false;

  const game = {
    state: "menu", hub: "home", selectedMode: "classic", mode: "classic",
    time: 0, readyTimer: 0, timeLeft: 60, score: 0, best: profile.best,
    speed: 185, spawnTimer: 0.55, spawnInterval: 1.08,
    walls: [], demoWalls: [], powerups: [], powerTimer: 6,
    shield: 0, slowTimer: 0, doubleTimer: 0, reviveUsed: false, nextMilestone: 0,
    particles: [], popups: [], stars: [], orbs: [],
    shake: 0, hitStop: 0, bgFlash: 0, bgFlashColor: "#ffffff",
    gameOverAt: 0, newBest: false, combo: 0, maxCombo: 0, runPerfects: 0,
    lastSwitchAt: -10, perfectWindow: 0.18, demoSpawnTimer: 0, trailTimer: 0,
    lowPerf: false, uiRects: {}, achPage: 0, settings
  };
  const ball = { colorIndex: 0, radius: 17, pulse: 0, switchFlash: 0, get x() { return W / 2; }, get y() { return H * 0.76; } };

  function updateSafeArea() { const s = getComputedStyle(document.documentElement); safeTop = parseFloat(s.getPropertyValue("--sat")) || 0; safeRight = parseFloat(s.getPropertyValue("--sar")) || 0; safeBottom = parseFloat(s.getPropertyValue("--sab")) || 0; safeLeft = parseFloat(s.getPropertyValue("--sal")) || 0; }
  function resize() { updateSafeArea(); W = window.innerWidth; H = window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr); canvas.style.width = W + "px"; canvas.style.height = H + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); makeStars(); makeOrbs(); }
  function makeStars() { game.stars = Array.from({ length: 85 }, () => ({ x: Math.random() * W, y: Math.random() * H, size: Math.random() * 2 + 0.4, speed: Math.random() * 25 + 8, alpha: Math.random() * 0.35 + 0.08 })); }
  function makeOrbs() { game.orbs = Array.from({ length: 7 }, () => ({ x: Math.random() * W, y: Math.random() * H, radius: 30 + Math.random() * 95, speed: 5 + Math.random() * 16, drift: Math.random() * 20 - 10, alpha: 0.035 + Math.random() * 0.06, colorIndex: Math.floor(Math.random() * COLORS.length) })); }
  function hideLoader() { if (loader && !loaderHidden) { loaderHidden = true; loader.classList.add("hidden"); setTimeout(() => { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 500); window.dispatchEvent(new Event("color-switch-blast:ready")); } }
  function hexToRgba(hex, a) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; }
  function roundRect(x, y, w, h, r) { const rad = Math.min(r, Math.max(0, w / 2), Math.max(0, h / 2)); ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); }
  function inRect(x, y, r) { return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function vibrate(p) { if (!game.settings.fx) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch {} }
  function ensureAudio() { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch {} }
  function toneAt(f, d, t, v, when) { if (!game.settings.sound) return; try { ensureAudio(); if (!audioCtx) return; const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = when || audioCtx.currentTime; o.type = t; o.frequency.value = f; g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + d + 0.02); } catch {} }
  function playTone(f, d = 0.08, t = "sine", v = 0.03) { toneAt(f, d, t, v, 0); }

  let musicTimer = null, musicStep = 0;
  const MUSIC_SCALE = [220, 261.63, 293.66, 329.63, 392, 440];
  function startMusic() { if (musicTimer || !game.settings.sound) return; ensureAudio(); musicTimer = setInterval(() => { if (!audioCtx || game.state === "paused") return; if (musicStep % 4 === 0) toneAt(MUSIC_SCALE[0] / 2, 0.4, "sine", 0.015, 0); toneAt(MUSIC_SCALE[(musicStep * 3 + (game.combo % 4)) % MUSIC_SCALE.length], 0.18, "triangle", 0.012, 0); musicStep++; }, 240); }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function playClick() { playTone(360, 0.05, "triangle", 0.025); }
  function playSwitch() { playTone(260 + ball.colorIndex * 75, 0.055, "triangle", 0.025); }
  function playPass() { const b = 480 + Math.min(48, game.combo * 6); playTone(b, 0.07, "sine", 0.035); playTone(b * 1.5, 0.05, "triangle", 0.02); }
  function playPerfect() { playTone(720, 0.07, "triangle", 0.04); playTone(1040, 0.1, "sine", 0.035); playTone(1440, 0.12, "sine", 0.02); }
  function playGameOver() { playTone(220, 0.12, "sawtooth", 0.04); playTone(110, 0.3, "sawtooth", 0.05); }
  function playPowerup() { playTone(660, 0.08, "triangle", 0.04); playTone(990, 0.1, "sine", 0.03); }

  function toggleSound() { game.settings.sound = !game.settings.sound; saveSettings(); if (game.settings.sound) { ensureAudio(); playClick(); if (game.state === "playing") startMusic(); } else stopMusic(); }
  function toggleFx() { game.settings.fx = !game.settings.fx; saveSettings(); playClick(); }
  function toggleSetting(id) { game.settings[id] = !game.settings[id]; saveSettings(); playClick(); }
  function addShake(a) { if (game.settings.fx && !game.settings.reducedMotion) game.shake = Math.max(game.shake, a); }
  function addParticles(x, y, c, n, s = 1, l = 0.7) { if (game.lowPerf) n = Math.ceil(n / 2); if (!game.settings.fx) { n = Math.min(3, n); s *= 0.4; l *= 0.5; } for (let i = 0; i < n; i++) game.particles.push({ x, y, color: c, vx: (Math.random() - 0.5) * 360 * s, vy: (Math.random() - 0.8) * 360 * s, life: Math.random() * l + 0.15, size: Math.random() * 3.5 + 1 }); }
  function addPopup(t, c, x, y, s = 24) { game.popups.push({ text: t, color: c, x, y, size: s, life: 0.95, maxLife: 0.95 }); }

  function unlock(id) { if (profile.achievements[id]) return; profile.achievements[id] = true; const a = ACHIEVEMENTS.find(x => x.id === id); addPopup("★ " + (a ? a.name : id), "#facc15", W / 2, H * 0.3, 22); playTone(990, 0.1, "sine", 0.04); saveProfile(); }
  function checkRunAchievements() { if (game.score >= 25) unlock("score_25"); if (game.score >= 50) unlock("score_50"); if (game.score >= 100) unlock("score_100"); if (game.maxCombo >= 10) unlock("combo_10"); if (profile.perfects >= 10) unlock("perfect_10"); if (game.mode === "time" && game.score >= 50) unlock("time_50"); if (game.mode === "zen" && game.score >= 50) unlock("zen_50"); if (game.mode === "hardcore" && game.score >= 50) unlock("hard_50"); }

  function pickWallOffset() { const same = Math.max(0.08, 0.2 - game.score * 0.001), one = 0.46, two = 0.32, three = Math.min(0.24, 0.08 + game.score * 0.001); const t = same + one + two + three; let r = Math.random() * t; if ((r -= same) < 0) return 0; if ((r -= one) < 0) return 1; if ((r -= two) < 0) return 2; return 3; }
  function spawnWall() { game.walls.push({ y: -80, height: 30, colorIndex: (ball.colorIndex + pickWallOffset()) % COLORS.length, passed: false, glow: 0 }); }
  function spawnPowerup() { game.powerups.push({ y: -60, x: ball.x, r: 16, spin: Math.random() * 6, type: POWERUPS[Math.floor(Math.random() * POWERUPS.length)] }); }

  function cycleMode(d) { const i = MODES.findIndex(m => m.id === game.selectedMode); game.selectedMode = MODES[(i + d + MODES.length) % MODES.length].id; playClick(); }

  function startGame(mode) {
    game.mode = MODES.some(m => m.id === mode) ? mode : "classic";
    game.selectedMode = game.mode;
    profile.modesPlayed[game.mode] = true;
    if (Object.keys(profile.modesPlayed).length >= 4) unlock("all_modes");
    game.state = "ready"; game.readyTimer = 0.9; game.timeLeft = 60;
    game.score = 0; game.speed = 185; game.spawnTimer = 0.55; game.spawnInterval = 1.08;
    game.walls = []; game.demoWalls = []; game.powerups = []; game.powerTimer = 6;
    game.shield = 0; game.slowTimer = 0; game.doubleTimer = 0; game.reviveUsed = false;
    game.nextMilestone = MILESTONES[0]; game.particles = []; game.popups = [];
    game.shake = 0; game.hitStop = 0; game.bgFlash = 0; game.bgFlashColor = "#ffffff";
    game.newBest = false; game.combo = 0; game.maxCombo = 0; game.runPerfects = 0;
    game.lastSwitchAt = -10; game.trailTimer = 0; game.best = getBest(game.mode);
    ball.colorIndex = 0; ball.pulse = 0; ball.switchFlash = 0;
  }
  function goHome() { stopMusic(); game.state = "menu"; game.hub = "home"; }
  function enterRevive() { game.state = "revive"; stopMusic(); vibrate(30); }
  function doRevive() { game.reviveUsed = true; unlock("revive_used"); game.walls = []; game.powerups = []; game.combo = 0; game.state = "ready"; game.readyTimer = 1.0; startMusic(); }
  function declineRevive() { gameOver(); }
  function tryRevive() { const b = (window.PlaygamaBridge && window.PlaygamaBridge.adsAvailable) ? window.PlaygamaBridge : window.GamePixBridge; if (b && b.adsAvailable) b.showRewardAd().then(ok => { if (ok) doRevive(); else declineRevive(); }); else doRevive(); }

  function gameOver() {
    game.state = "gameover"; game.gameOverAt = performance.now();
    stopMusic(); addShake(18); vibrate([40, 60, 40]);
    game.bgFlash = 0.22; game.bgFlashColor = "#ef4444";
    const mb = getBest(game.mode); game.newBest = game.score > mb;
    if (game.newBest) { profile.bests[game.mode] = game.score; if (game.score > profile.best) profile.best = game.score; game.best = game.score; }
    checkRunAchievements(); saveProfile();
    addParticles(ball.x, ball.y, COLORS[ball.colorIndex].hex, 46, 1.6, 1.1); playGameOver();
  }

  function switchColor() { ball.colorIndex = (ball.colorIndex + 1) % COLORS.length; ball.pulse = 1; ball.switchFlash = 1; game.lastSwitchAt = performance.now() / 1000; addParticles(ball.x, ball.y, COLORS[ball.colorIndex].hex, 10, 0.5, 0.45); playSwitch(); }
  function shareGame() { const text = "I scored " + game.score + " in Color Switch Blast by VRX Games! Can you beat me?"; const url = location.href; try { if (navigator.share) { navigator.share({ title: "Color Switch Blast", text, url }).catch(() => {}); return; } } catch {} try { navigator.clipboard.writeText(text + " " + url).then(() => addPopup("COPIED!", "#4ade80", W / 2, H * 0.5, 24)); } catch {} }
  function action() { if (game.state === "ready") { switchColor(); return; } if (game.state === "paused") { resumeGame(); return; } if (game.state === "playing") { switchColor(); return; } if (game.state === "gameover" && performance.now() - game.gameOverAt > 500) startGame(game.mode); }
  function pauseGame() { if (game.state === "playing") game.state = "paused"; }
  function resumeGame() { if (game.state === "paused") { game.state = "playing"; lastTime = performance.now(); } }
  function togglePause() { if (game.state === "playing") pauseGame(); else if (game.state === "paused") resumeGame(); }

  function updateStars(dt) { const m = game.state === "playing" ? 1.8 : 0.5; for (const s of game.stars) { s.y += s.speed * m * dt; if (s.y > H + 10) { s.y = -10; s.x = Math.random() * W; } } }
  function updateOrbs(dt) { for (const o of game.orbs) { o.y -= o.speed * dt; o.x += Math.sin(game.time * 0.25 + o.drift) * 6 * dt; if (o.y < -o.radius * 2) { o.y = H + o.radius * 2; o.x = Math.random() * W; o.colorIndex = Math.floor(Math.random() * COLORS.length); } } }
  function updateParticles(dt) { for (const p of game.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt; p.life -= dt; } game.particles = game.particles.filter(p => p.life > 0); }
  function updatePopups(dt) { for (const p of game.popups) { p.y -= 48 * dt; p.life -= dt; } game.popups = game.popups.filter(p => p.life > 0); }
  function updateDemoWalls(dt) { game.demoSpawnTimer -= dt; if (game.demoSpawnTimer <= 0) { game.demoSpawnTimer = 1.2; game.demoWalls.push({ y: -80, height: 26, colorIndex: Math.floor(Math.random() * COLORS.length), glow: 0 }); } for (const w of game.demoWalls) w.y += 70 * dt; game.demoWalls = game.demoWalls.filter(w => w.y < H + 100); }
  function collectPowerup(p) { if (p.type.id === "shield") game.shield = 1; if (p.type.id === "slow") game.slowTimer = 4; if (p.type.id === "double") game.doubleTimer = 6; addPopup(p.type.label, p.type.color, ball.x, ball.y - 72, 24); addParticles(ball.x, ball.y, p.type.color, 20, 1, 0.8); playPowerup(); vibrate(12); }

  function update(dt) {
    if (game.state === "paused") return;
    game.time += dt;
    game.bgFlash = Math.max(0, game.bgFlash - 1.8 * dt); game.shake = Math.max(0, game.shake - 40 * dt);
    ball.pulse = Math.max(0, ball.pulse - 4 * dt); ball.switchFlash = Math.max(0, ball.switchFlash - 5 * dt);
    if (game.hitStop > 0) { game.hitStop -= dt; updateParticles(dt * 0.35); updatePopups(dt * 0.35); return; }
    updateStars(dt); updateOrbs(dt); updateParticles(dt); updatePopups(dt);
    if (game.state === "menu") { updateDemoWalls(dt); return; }
    if (game.state === "ready") { game.readyTimer -= dt; if (game.readyTimer <= 0) { game.state = "playing"; profile.games = Math.min(MAX_COUNTER, profile.games + 1); unlock("first_run"); startMusic(); vibrate(10); } return; }
    if (game.state !== "playing") return;

    game.slowTimer = Math.max(0, game.slowTimer - dt); game.doubleTimer = Math.max(0, game.doubleTimer - dt);
    const speedMul = game.slowTimer > 0 ? 0.6 : 1;
    if (game.mode === "time") { game.timeLeft -= dt; if (game.timeLeft <= 0) { game.timeLeft = 0; gameOver(); return; } }
    game.trailTimer -= dt; if (game.trailTimer <= 0) { game.trailTimer = 0.035; if (game.settings.fx) addParticles(ball.x, ball.y + ball.radius * 0.6, COLORS[ball.colorIndex].hex, 1, 0.03, 0.22); }
    game.spawnTimer -= dt; if (game.spawnTimer <= 0) { spawnWall(); game.spawnInterval = Math.max(0.44, 1.08 - game.score * 0.0045); game.spawnTimer = game.spawnInterval; }
    game.powerTimer -= dt; if (game.powerTimer <= 0 && game.score >= 5 && (game.mode === "classic" || game.mode === "time")) { game.powerTimer = 6 + Math.random() * 5; spawnPowerup(); }
    const base = game.mode === "hardcore" ? 240 : game.mode === "time" ? 200 : game.mode === "zen" ? 170 : 185;
    const ramp = game.mode === "hardcore" ? 6 : 4.2;
    game.speed = Math.min(620, base + game.score * ramp + Math.floor(game.score / 10) * 12);

    for (const p of game.powerups) { p.y += game.speed * 0.8 * speedMul * dt; p.spin += dt * 3; }
    game.powerups = game.powerups.filter(p => { if (p.y + p.r >= ball.y - ball.radius && p.y - p.r <= ball.y + ball.radius) { collectPowerup(p); return false; } return p.y < H + 80; });

    for (const wall of game.walls) {
      wall.y += game.speed * speedMul * dt; wall.glow = Math.max(0, wall.glow - 3 * dt);
      if (!wall.passed && wall.y + wall.height >= ball.y - ball.radius) {
        wall.passed = true;
        if (wall.colorIndex === ball.colorIndex) {
          const nowSec = performance.now() / 1000, sd = nowSec - game.lastSwitchAt;
          const perfect = sd >= 0 && sd <= game.perfectWindow;
          const comboBonus = Math.min(5, Math.floor(game.combo / 5));
          let mult = game.doubleTimer > 0 ? 2 : 1; if (game.mode === "hardcore") mult *= 2;
          const points = (1 + (perfect ? 1 : 0) + comboBonus) * mult;
          game.score = Math.min(MAX_SCORE, game.score + points);
          game.combo += 1; game.maxCombo = Math.max(game.maxCombo, game.combo); wall.glow = 1;
          if (game.nextMilestone && game.score >= game.nextMilestone) { addPopup("MILESTONE " + game.nextMilestone + "!", "#ffffff", W / 2, H * 0.32, 30); playTone(880, 0.1, "sine", 0.04); game.nextMilestone = MILESTONES[MILESTONES.indexOf(game.nextMilestone) + 1] || 0; }
          if (perfect) { game.runPerfects += 1; profile.perfects = Math.min(MAX_COUNTER, profile.perfects + 1); game.hitStop = (game.settings.fx && !game.settings.reducedMotion) ? 0.045 : 0; game.bgFlash = 0.16; game.bgFlashColor = COLORS[wall.colorIndex].hex; addShake(5); vibrate(15); addParticles(ball.x, ball.y, COLORS[wall.colorIndex].hex, 28, 1.2, 0.9); addPopup("PERFECT +" + points, "#ffffff", ball.x, ball.y - 72, 28); playPerfect(); }
          else { addParticles(ball.x, ball.y, COLORS[wall.colorIndex].hex, 14, 0.8, 0.65); addPopup("+" + points, COLORS[wall.colorIndex].hex, ball.x, ball.y - 56, 22); playPass(); }
          if (game.combo % 5 === 0) addPopup("COMBO " + game.combo, "#facc15", W / 2, H * 0.26, 30);
        } else {
          if (game.mode === "zen") { game.combo = 0; addPopup("FLOW RESET", "#4ade80", ball.x, ball.y - 72, 24); addShake(4); playTone(300, 0.08, "sine", 0.03); }
          else if (game.mode === "time") { game.combo = 0; game.timeLeft = Math.max(0, game.timeLeft - 3); addPopup("-3s", "#facc15", ball.x, ball.y - 72, 26); addShake(6); playTone(300, 0.08, "square", 0.03); }
          else if (game.shield > 0) { game.shield = 0; game.combo = 0; unlock("shield_save"); addPopup("SHIELD SAVED!", "#38bdf8", ball.x, ball.y - 72, 26); addParticles(ball.x, ball.y, "#38bdf8", 24, 1.2, 0.8); playTone(500, 0.09, "square", 0.03); addShake(6); }
          else if (game.mode === "classic" && !game.reviveUsed) { enterRevive(); break; }
          else { gameOver(); break; }
        }
      }
    }
    game.walls = game.walls.filter(w => w.y < H + 100);
  }

  function drawBackground() { const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#080812"); bg.addColorStop(0.55, "#0b1020"); bg.addColorStop(1, "#111827"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); if (game.settings.fx && !game.lowPerf && !game.settings.reducedMotion) { for (const o of game.orbs) { const c = COLORS[o.colorIndex]; const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius); g.addColorStop(0, hexToRgba(c.hex, o.alpha)); g.addColorStop(1, hexToRgba(c.hex, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill(); } } for (const s of game.stars) { ctx.fillStyle = `rgba(255,255,255,${s.alpha})`; ctx.fillRect(s.x, s.y, s.size, s.size); } if (game.bgFlash > 0) { ctx.fillStyle = hexToRgba(game.bgFlashColor, game.bgFlash); ctx.fillRect(0, 0, W, H); } }
  function drawPanel(x, y, w, h, r = 24) { ctx.save(); ctx.fillStyle = "rgba(7,10,18,0.55)"; roundRect(x, y, w, h, r); ctx.fill(); ctx.strokeStyle = "rgba(0,255,156,0.18)"; ctx.lineWidth = 2; roundRect(x, y, w, h, r); ctx.stroke(); ctx.restore(); }
  function drawParticles() { for (const p of game.particles) { ctx.save(); ctx.globalAlpha = Math.min(1, Math.max(0, p.life)); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } }

  function drawWallBeam(wall, alpha = 1, isMatch = false) {
    const c = COLORS[wall.colorIndex], x = 18, w = W - 36, y = wall.y, h = wall.height;
    const pulse = isMatch ? 0.5 + Math.sin(performance.now() / 180) * 0.18 : 0;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.shadowBlur = game.lowPerf ? 0 : 22 + wall.glow * 30 + pulse * 16; ctx.shadowColor = c.hex;
    ctx.fillStyle = hexToRgba(c.hex, 0.2 + wall.glow * 0.18 + pulse * 0.1); roundRect(x, y, w, h, 16); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = hexToRgba(c.hex, 0.88); ctx.beginPath(); ctx.arc(x + 12, y + h / 2, 7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + w - 12, y + h / 2, 7, 0, Math.PI * 2); ctx.fill();
    const bw = Math.max(20, w - 40), bx = x + (w - bw) / 2; ctx.fillStyle = hexToRgba(c.hex, 0.94); roundRect(bx, y + h / 2 - 4, bw, 8, 999); ctx.fill();
    const gw = Math.max(10, w - 56), gx = x + (w - gw) / 2; ctx.fillStyle = "rgba(255,255,255,0.28)"; roundRect(gx, y + h / 2 - 2, gw, 2, 999); ctx.fill();
    if (game.settings.colorblind) { ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.font = "800 " + Math.max(14, h * 0.6) + 'px "JetBrains Mono", monospace'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(SYMBOLS[wall.colorIndex], x + 44, y + h / 2 + 1); }
    if (isMatch) { ctx.strokeStyle = hexToRgba("#ffffff", 0.25 + pulse * 0.2); ctx.lineWidth = 2; roundRect(x, y, w, h, 16); ctx.stroke(); }
    ctx.restore();
  }
  function drawWalls() { for (const w of game.walls) drawWallBeam(w, 1, w.colorIndex === ball.colorIndex && game.state === "playing"); }
  function drawDemoWalls() { for (const w of game.demoWalls) drawWallBeam(w, 0.28, false); }
  function drawPowerups() { for (const p of game.powerups) { const x = p.x + Math.sin(p.spin) * 8; ctx.save(); ctx.shadowBlur = game.lowPerf ? 0 : 22; ctx.shadowColor = p.type.color; ctx.fillStyle = hexToRgba(p.type.color, 0.92); ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 2; if (p.type.id === "shield") { ctx.beginPath(); ctx.arc(x, p.y, p.r * 0.45, 0, Math.PI * 2); ctx.stroke(); } else if (p.type.id === "slow") { ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y - p.r * 0.5); ctx.moveTo(x, p.y); ctx.lineTo(x + p.r * 0.4, p.y + p.r * 0.2); ctx.stroke(); } else { ctx.font = "800 12px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("x2", x, p.y + 1); } ctx.restore(); } }

  function drawBall() {
    if (game.state === "gameover" || game.state === "menu") return;
    const c = COLORS[ball.colorIndex], nc = COLORS[(ball.colorIndex + 1) % COLORS.length];
    ctx.save(); ctx.translate(ball.x, ball.y); const sc = 1 + ball.pulse * 0.22; ctx.scale(sc, sc);
    ctx.shadowBlur = 28 + ball.switchFlash * 22; ctx.shadowColor = c.hex; ctx.fillStyle = c.hex;
    ctx.beginPath(); ctx.arc(0, 0, ball.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(-5, -6, 4, 0, Math.PI * 2); ctx.fill();
    if (game.settings.colorblind) { ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.font = "800 14px \"JetBrains Mono\", monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(SYMBOLS[ball.colorIndex], 0, 2); }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.45 + ball.switchFlash * 0.25; ctx.strokeStyle = nc.hex; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius + 10 + ball.pulse * 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    if (game.shield > 0) { ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius + 18, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }

  function drawColorDots() { const sp = 26, sx = W / 2 - ((COLORS.length - 1) * sp) / 2, y = H - safeBottom - 34; COLORS.forEach((c, i) => { const cur = i === ball.colorIndex; ctx.save(); ctx.globalAlpha = cur ? 1 : 0.35; if (cur) { ctx.shadowBlur = 16; ctx.shadowColor = c.hex; } ctx.fillStyle = c.hex; ctx.beginPath(); ctx.arc(sx + i * sp, y, cur ? 8 : 5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }); }
  function drawText(t, x, y, s, c, w = "800", a = 1) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = c; ctx.font = w + " " + s + 'px "JetBrains Mono", ui-monospace, Consolas, monospace'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, x, y); ctx.restore(); }
  function fitSize(t, mw, bs, w = "600") { let s = bs; while (s > 9) { ctx.font = w + " " + s + 'px "JetBrains Mono", monospace'; if (ctx.measureText(t).width <= mw) break; s -= 1; } return s; }

  function drawHUD() { if (["playing", "paused", "ready", "revive"].includes(game.state)) { const sy = safeTop + Math.max(78, H * 0.12); drawText(String(game.score), W / 2, sy, Math.min(72, W * 0.14), "rgba(255,255,255,0.95)", "900"); let ey = sy + Math.min(40, H * 0.055); if (game.combo > 1) { drawText("COMBO " + game.combo, W / 2, ey, Math.min(24, W * 0.05), "rgba(250,204,21,0.88)", "800"); ey += 22; } if (game.mode === "time") { drawText("TIME " + game.timeLeft.toFixed(1), W / 2, ey, 18, "#facc15", "800"); ey += 20; } if (game.mode === "zen") { drawText("ZEN • NO DEATH", W / 2, ey, 14, "rgba(74,222,128,0.8)", "700"); ey += 18; } if (game.slowTimer > 0) { drawText("SLOW " + game.slowTimer.toFixed(1), W / 2, ey, 16, "#a78bfa", "800"); ey += 18; } if (game.doubleTimer > 0) { drawText("X2 " + game.doubleTimer.toFixed(1), W / 2, ey, 16, "#fb923c", "800"); } drawColorDots(); } }
  function drawPopups() { for (const p of game.popups) drawText(p.text, p.x, p.y, p.size, p.color, "900", Math.max(0, p.life / p.maxLife)); }
  function drawReady() { const p = 0.7 + Math.sin(performance.now() / 120) * 0.3; drawText("GET READY", W / 2, H * 0.4, Math.min(44, W * 0.09), `rgba(255,255,255,${p})`, "900"); }
  function getPanelLayout(dh, mw = 440) { const pw = Math.min(mw, W - 28), top = safeTop + 16, bot = H - safeBottom - 16, ah = Math.max(120, bot - top), ph = Math.min(dh, ah), py = top + Math.max(0, (ah - ph) / 2), px = (W - pw) / 2; return { panelW: pw, panelH: ph, panelX: px, panelY: py }; }

  function getButtons() { const b = [], ty = safeTop + 32, r = 20; b.push({ id: "sound", x: safeLeft + 34, y: ty, r, action: toggleSound }); b.push({ id: "fx", x: safeLeft + 86, y: ty, r, action: toggleFx }); if (game.state === "playing") b.push({ id: "pause", x: W - safeRight - 34, y: ty, r, action: pauseGame }); if (game.state === "paused") b.push({ id: "resume", x: W - safeRight - 34, y: ty, r, action: resumeGame }); if ((game.state === "menu" || game.state === "gameover") && window.PlaygamaBridge && window.PlaygamaBridge.hasLeaderboard) b.push({ id: "board", x: W - safeRight - 34, y: ty, r, action: () => { if (window.PlaygamaBridge) window.PlaygamaBridge.showLeaderboard(); } }); return b; }
  function drawButtonIcon(b) { ctx.save(); ctx.translate(b.x, b.y); ctx.lineCap = "round"; if (b.id === "sound") { ctx.fillStyle = "rgba(255,255,255,0.88)"; ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(-3, -3); ctx.lineTo(2, -7); ctx.lineTo(2, 7); ctx.lineTo(-3, 3); ctx.lineTo(-7, 3); ctx.closePath(); ctx.fill(); if (game.settings.sound) { ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(4, 0, 4, -0.7, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(4, 0, 7, -0.7, 0.7); ctx.stroke(); } else { ctx.strokeStyle = "rgba(248,113,113,0.95)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, 8); ctx.stroke(); } } if (b.id === "fx") { ctx.strokeStyle = game.settings.fx ? "rgba(250,204,21,0.95)" : "rgba(255,255,255,0.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); ctx.stroke(); } if (b.id === "board") { ctx.fillStyle = "rgba(250,204,21,0.95)"; ctx.fillRect(-8, -1, 4, 8); ctx.fillRect(-2, -7, 4, 14); ctx.fillRect(4, 1, 4, 6); } if (b.id === "pause") { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(-6, -7, 4, 14); ctx.fillRect(2, -7, 4, 14); } if (b.id === "resume") { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(8, 0); ctx.lineTo(-5, 8); ctx.closePath(); ctx.fill(); } ctx.restore(); }
  function drawButtons() { for (const b of getButtons()) { ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.strokeStyle = "rgba(0,255,156,0.25)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); drawButtonIcon(b); ctx.restore(); } }
  function drawRectButton(r, label, color, pulse) { ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = color; ctx.fillStyle = hexToRgba(color, 0.22); roundRect(r.x, r.y, r.w, r.h, 14); ctx.fill(); ctx.strokeStyle = hexToRgba(color, pulse * 0.7); ctx.lineWidth = 2; roundRect(r.x, r.y, r.w, r.h, 14); ctx.stroke(); ctx.restore(); drawText(label, r.x + r.w / 2, r.y + r.h / 2, Math.min(20, r.h * 0.45), `rgba(255,255,255,${pulse})`, "900"); }

  function drawLogoBanner(L, hFrac) { const bx = L.panelX + 14, by = L.panelY + 12, bw = L.panelW - 28, bh = L.panelH * hFrac; if (logoLoaded) { ctx.save(); roundRect(bx, by, bw, bh, 18); ctx.clip(); const s = Math.max(bw / logoImg.width, bh / logoImg.height); ctx.drawImage(logoImg, bx + (bw - logoImg.width * s) / 2, by + (bh - logoImg.height * s) / 2, logoImg.width * s, logoImg.height * s); ctx.restore(); } else { drawText("COLOR SWITCH BLAST", W / 2, by + bh / 2, fitSize("COLOR SWITCH BLAST", bw, 30, "900"), "#ffffff", "900"); } }

  function drawFooter(L) {
    const cx = W / 2;
    const fy = Math.min(H - safeBottom - 12, L.panelY + L.panelH + 18);
    const t = "VRX GAMES  •  " + GAME_VERSION;
    drawText(t, cx, fy, fitSize(t, W - 24, 13), "rgba(0,255,156,0.55)", "700");
  }

  function drawHubHome(L) {
    const { panelW, panelH, panelX, panelY } = L, cx = W / 2;
    drawPanel(panelX, panelY, panelW, panelH, 28);
    drawLogoBanner(L, 0.20);
    const m = MODES.find(x => x.id === game.selectedMode);
    const card = { x: panelX + panelW * 0.22, y: panelY + panelH * 0.26, w: panelW * 0.56, h: panelH * 0.17 };
    const prev = { x: panelX + panelW * 0.06, y: card.y + card.h * 0.25, w: panelW * 0.11, h: card.h * 0.5 };
    const next = { x: panelX + panelW * 0.83, y: card.y + card.h * 0.25, w: panelW * 0.11, h: card.h * 0.5 };
    game.uiRects.hub_prev = prev; game.uiRects.hub_next = next;
    ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = m.color; ctx.fillStyle = hexToRgba(m.color, 0.16); roundRect(card.x, card.y, card.w, card.h, 14); ctx.fill(); ctx.strokeStyle = hexToRgba(m.color, 0.65); ctx.lineWidth = 2; roundRect(card.x, card.y, card.w, card.h, 14); ctx.stroke(); ctx.restore();
    drawText(m.name, cx, card.y + card.h * 0.32, fitSize(m.name, card.w - 16, 17), "#ffffff", "800");
    drawText(m.desc + " • BEST " + getBest(m.id), cx, card.y + card.h * 0.72, fitSize(m.desc + " • BEST " + getBest(m.id), card.w - 12, 10), hexToRgba(m.color, 0.95), "600");
    drawRectButton(prev, "◀", "#00ff9c", 0.8); drawRectButton(next, "▶", "#00ff9c", 0.8);
    const play = { x: cx - panelW * 0.30, y: panelY + panelH * 0.48, w: panelW * 0.60, h: panelH * 0.10 };
    game.uiRects.hub_play = play;
    drawRectButton(play, "▶ PLAY", m.color, 0.72 + Math.sin(game.time * 5) * 0.28);
    const nw = panelW * 0.17, nh = panelH * 0.12, ny = panelY + panelH * 0.64, gap = panelW * 0.045, total = nw * 4 + gap * 3, nx0 = cx - total / 2;
    const navs = [["hub_ach", "★", "AWARDS"], ["hub_shop", "▣", "SHOP"], ["hub_set", "⚙", "CONFIG"], ["hub_board", "♛", "RANK"]];
    navs.forEach((n, i) => { const r = { x: nx0 + i * (nw + gap), y: ny, w: nw, h: nh }; game.uiRects[n[0]] = r; ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.strokeStyle = "rgba(0,255,156,0.3)"; ctx.lineWidth = 1.5; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill(); ctx.stroke(); ctx.restore(); drawText(n[1], r.x + r.w / 2, r.y + r.h * 0.35, Math.min(16, r.h * 0.3), "#00ff9c", "800"); drawText(n[2], r.x + r.w / 2, r.y + r.h * 0.72, fitSize(n[2], r.w - 6, 9), "rgba(255,255,255,0.6)", "600"); });
    const unlocked = ACHIEVEMENTS.filter(a => profile.achievements[a.id]).length;
    const stats = "GAMES " + profile.games + " • AWARDS " + unlocked + "/" + ACHIEVEMENTS.length;
    drawText(stats, cx, panelY + panelH * 0.84, fitSize(stats, panelW - 24, 11), "rgba(255,255,255,0.5)", "600");
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      const hint = "1-4 = MODE • SPACE = PLAY";
      drawText(hint, cx, panelY + panelH * 0.91, fitSize(hint, panelW - 24, 12), "rgba(0,255,156,0.5)", "600");
    }
    drawFooter(L);
  }

  function drawHubBack(L, title) { const cx = W / 2; if (title) drawText(title, cx, L.panelY + L.panelH * 0.08, Math.min(22, L.panelW * 0.05), "#00ff9c", "800"); const b = { x: cx - L.panelW * 0.3, y: L.panelY + L.panelH * 0.88, w: L.panelW * 0.6, h: L.panelH * 0.07 }; game.uiRects.hub_back = b; drawRectButton(b, "◀ BACK", "#94a3b8", 0.8); }

  function drawHubAchievements(L) {
    const { panelW, panelH, panelX, panelY } = L, cx = W / 2;
    drawPanel(panelX, panelY, panelW, panelH, 28);
    const unlocked = ACHIEVEMENTS.filter(a => profile.achievements[a.id]).length;
    drawText("★ AWARDS", cx, panelY + panelH * 0.06, fitSize("★ AWARDS", panelW - 24, 20), "#00ff9c", "800");
    const pb = { x: panelX + panelW * 0.10, y: panelY + panelH * 0.10, w: panelW * 0.80, h: 10 };
    ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.08)"; roundRect(pb.x, pb.y, pb.w, pb.h, 5); ctx.fill();
    const frac = ACHIEVEMENTS.length ? unlocked / ACHIEVEMENTS.length : 0;
    ctx.fillStyle = "#facc15"; roundRect(pb.x, pb.y, Math.max(6, pb.w * frac), pb.h, 5); ctx.fill(); ctx.restore();
    drawText(unlocked + " / " + ACHIEVEMENTS.length + " UNLOCKED", cx, panelY + panelH * 0.10 + 20, 10, "rgba(255,255,255,0.6)", "600");
    const tw = panelW * 0.19, th = panelH * 0.10, ty = panelY + panelH * 0.17, tg = panelW * 0.026, tt = tw * 4 + tg * 3, tx0 = cx - tt / 2;
    MODES.forEach((m, i) => { const r = { x: tx0 + i * (tw + tg), y: ty, w: tw, h: th }; ctx.save(); ctx.fillStyle = hexToRgba(m.color, 0.12); ctx.strokeStyle = hexToRgba(m.color, 0.5); ctx.lineWidth = 1.5; roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.stroke(); ctx.restore(); drawText("♛", r.x + r.w / 2, r.y + r.h * 0.30, Math.min(12, r.h * 0.3), hexToRgba(m.color, 0.95), "800"); drawText(String(getBest(m.id)), r.x + r.w / 2, r.y + r.h * 0.72, fitSize(String(getBest(m.id)), r.w - 6, 11), "#ffffff", "800"); });
    const PER = 3, pages = Math.ceil(ACHIEVEMENTS.length / PER);
    if (game.achPage >= pages) game.achPage = 0; if (game.achPage < 0) game.achPage = pages - 1;
    const start = game.achPage * PER;
    for (let i = 0; i < PER; i++) { const a = ACHIEVEMENTS[start + i]; if (!a) break;
      const r = { x: panelX + panelW * 0.08, y: panelY + panelH * 0.315 + i * panelH * 0.155, w: panelW * 0.84, h: panelH * 0.135 };
      const got = !!profile.achievements[a.id];
      ctx.save(); ctx.fillStyle = got ? "rgba(250,204,21,0.10)" : "rgba(255,255,255,0.04)"; ctx.strokeStyle = got ? "rgba(250,204,21,0.6)" : "rgba(255,255,255,0.12)"; ctx.lineWidth = 1.5; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill(); ctx.stroke(); ctx.restore();
      const ib = { x: r.x + r.h * 0.15, y: r.y + r.h * 0.18, w: r.h * 0.64, h: r.h * 0.64 };
      ctx.save(); ctx.fillStyle = got ? hexToRgba("#facc15", 0.2) : "rgba(255,255,255,0.06)"; roundRect(ib.x, ib.y, ib.w, ib.h, 8); ctx.fill(); ctx.restore();
      drawText(a.icon, ib.x + ib.w / 2, ib.y + ib.h / 2, Math.min(16, ib.h * 0.5), got ? "#facc15" : "rgba(255,255,255,0.35)", "800");
      const tx = r.x + r.h * 0.95, avail = r.w - r.h * 1.1 - r.w * 0.12;
      drawText(a.name, tx + avail / 2, r.y + r.h * 0.32, fitSize(a.name, avail, 12), got ? "#ffffff" : "rgba(255,255,255,0.5)", "800");
      drawText(a.desc, tx + avail / 2, r.y + r.h * 0.68, fitSize(a.desc, avail, 9), got ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)", "600");
      drawText(got ? "✔" : "🔒", r.x + r.w - r.w * 0.07, r.y + r.h / 2, Math.min(13, r.h * 0.3), got ? "#4ade80" : "rgba(255,255,255,0.3)", "800");
    }
    const pr = { x: panelX + panelW * 0.10, y: panelY + panelH * 0.80, w: panelW * 0.12, h: panelH * 0.06 };
    const nr = { x: panelX + panelW * 0.78, y: panelY + panelH * 0.80, w: panelW * 0.12, h: panelH * 0.06 };
    game.uiRects.ach_prev = pr; game.uiRects.ach_next = nr;
    drawRectButton(pr, "◀", "#94a3b8", 0.8); drawRectButton(nr, "▶", "#94a3b8", 0.8);
    drawText((game.achPage + 1) + " / " + pages, cx, panelY + panelH * 0.83, 11, "rgba(255,255,255,0.6)", "700");
    drawHubBack(L, "");
  }

  function drawHubRank(L) {
    const { panelW, panelH, panelX, panelY } = L, cx = W / 2;
    drawPanel(panelX, panelY, panelW, panelH, 28);
    drawText("♛ RANK", cx, panelY + panelH * 0.07, fitSize("♛ RANK", panelW - 24, 20), "#00ff9c", "800");
    drawText("LOCAL TROPHIES", cx, panelY + panelH * 0.13, 10, "rgba(255,255,255,0.55)", "600");
    const sorted = [...MODES].sort((a, b) => getBest(b.id) - getBest(a.id));
    const medals = ["🥇", "", "", "•"];
    sorted.forEach((m, i) => { const r = { x: panelX + panelW * 0.10, y: panelY + panelH * 0.19 + i * panelH * 0.15, w: panelW * 0.80, h: panelH * 0.13 };
      ctx.save(); ctx.fillStyle = hexToRgba(m.color, 0.10); ctx.strokeStyle = hexToRgba(m.color, 0.5); ctx.lineWidth = 1.5; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill(); ctx.stroke(); ctx.restore();
      drawText(medals[i], r.x + r.w * 0.08, r.y + r.h / 2, Math.min(16, r.h * 0.4), "#ffffff", "800");
      drawText(m.name, r.x + r.w * 0.40, r.y + r.h / 2, fitSize(m.name, r.w * 0.4, 12), "#ffffff", "800");
      drawText("BEST " + getBest(m.id), r.x + r.w * 0.82, r.y + r.h / 2, fitSize("BEST " + getBest(m.id), r.w * 0.3, 11), hexToRgba(m.color, 0.95), "800");
    });
    drawText("OVERALL BEST " + profile.best, cx, panelY + panelH * 0.83, fitSize("OVERALL BEST " + profile.best, panelW - 24, 12), "#facc15", "800");
    drawHubBack(L, "");
  }

  function drawHubSettings(L) { const { panelW, panelH, panelX, panelY } = L, cx = W / 2; drawPanel(panelX, panelY, panelW, panelH, 28); SETTINGS_ROWS.forEach((row, i) => { const r = { x: panelX + panelW * 0.10, y: panelY + panelH * 0.14 + i * panelH * 0.14, w: panelW * 0.80, h: panelH * 0.11 }; game.uiRects["set_" + row.id] = r; const on = !!game.settings[row.id]; ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.strokeStyle = on ? "rgba(0,255,156,0.5)" : "rgba(255,255,255,0.15)"; ctx.lineWidth = 1.5; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill(); ctx.stroke(); ctx.restore(); drawText(row.label, r.x + r.w * 0.30, r.y + r.h / 2, fitSize(row.label, r.w * 0.55, 11), "#ffffff", "700"); drawText(on ? "ON" : "OFF", r.x + r.w * 0.82, r.y + r.h / 2, Math.min(12, r.h * 0.34), on ? "#00ff9c" : "rgba(255,255,255,0.4)", "800"); }); drawHubBack(L, "CONFIG"); }

  function drawHubShop(L) { const { panelW, panelH, panelX, panelY } = L, cx = W / 2; drawPanel(panelX, panelY, panelW, panelH, 28); drawText("SHOP — COMING SOON", cx, panelY + panelH * 0.10, fitSize("SHOP — COMING SOON", panelW - 24, 18), "#00ff9c", "800"); SHOP_ITEMS.forEach((it, i) => { const r = { x: panelX + panelW * 0.10, y: panelY + panelH * 0.18 + i * panelH * 0.18, w: panelW * 0.80, h: panelH * 0.15 }; ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1.5; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill(); ctx.stroke(); ctx.restore(); drawText(it.icon, r.x + r.w * 0.12, r.y + r.h / 2, Math.min(18, r.h * 0.4), "rgba(255,255,255,0.5)", "800"); drawText(it.name, r.x + r.w * 0.42, r.y + r.h / 2, fitSize(it.name, r.w * 0.4, 12), "#ffffff", "700"); drawText("🔒 SOON", r.x + r.w * 0.82, r.y + r.h / 2, Math.min(10, r.h * 0.22), "rgba(255,255,255,0.45)", "700"); }); drawHubBack(L, ""); }

  function drawMenu() { const L = getPanelLayout(Math.min(600, H * 0.86), 440); if (game.hub === "achievements") drawHubAchievements(L); else if (game.hub === "settings") drawHubSettings(L); else if (game.hub === "shop") drawHubShop(L); else if (game.hub === "rank") drawHubRank(L); else drawHubHome(L); }

  function drawRevive() { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, W, H); const L = getPanelLayout(Math.min(280, H * 0.42), 380); const { panelW, panelH, panelX, panelY } = L, cx = W / 2; drawPanel(panelX, panelY, panelW, panelH, 26); drawText("CONTINUE?", cx, panelY + panelH * 0.16, Math.min(38, W * 0.08), "#ffffff", "900"); drawText("Score: " + game.score, cx, panelY + panelH * 0.32, Math.min(22, W * 0.05), "rgba(255,255,255,0.85)", "800"); const useAd = !!((window.PlaygamaBridge && window.PlaygamaBridge.adsAvailable) || (window.GamePixBridge && window.GamePixBridge.adsAvailable)); const bw = panelW * 0.72; const ad = { x: cx - bw / 2, y: panelY + panelH * 0.46, w: bw, h: 46 }; const no = { x: cx - bw / 2, y: panelY + panelH * 0.46 + 56, w: bw, h: 34 }; game.uiRects.reviveAd = ad; game.uiRects.reviveNo = no; drawRectButton(ad, useAd ? "REVIVE — WATCH AD" : "FREE REVIVE", "#4ade80", 0.75 + Math.sin(performance.now() / 250) * 0.25); drawRectButton(no, "NO THANKS", "#94a3b8", 0.7); }

  function drawGameOver() { const L = getPanelLayout(Math.min(480, H * 0.72), 420); const { panelW, panelH, panelX, panelY } = L, cx = W / 2; drawPanel(panelX, panelY, panelW, panelH, 28); const ts = Math.min(44, W * 0.095, panelW * 0.12), tx = Math.min(24, W * 0.05, panelW * 0.055); drawText("GAME OVER", cx, panelY + panelH * 0.10, ts, "#ffffff", "900"); drawText(game.mode.toUpperCase(), cx, panelY + panelH * 0.18, tx * 0.6, "rgba(0,255,156,0.7)", "700"); if (game.newBest) drawText("NEW BEST!", cx, panelY + panelH * 0.25, tx * 0.8, "#facc15", "900"); drawText("Score: " + game.score, cx, panelY + panelH * 0.33, tx, "rgba(255,255,255,0.92)", "800"); const sub = "Perfects: " + game.runPerfects + "  •  Combo: " + game.maxCombo; drawText(sub, cx, panelY + panelH * 0.41, fitSize(sub, panelW - 24, tx * 0.7), "rgba(255,255,255,0.75)", "700"); drawText("Best: " + game.best, cx, panelY + panelH * 0.48, tx * 0.8, "rgba(255,255,255,0.75)", "700"); const bw = panelW * 0.72; const restart = { x: cx - bw / 2, y: panelY + panelH * 0.56, w: bw, h: 42 }; const home = { x: cx - bw / 2, y: panelY + panelH * 0.56 + 48, w: bw, h: 34 }; const share = { x: cx - bw / 2, y: panelY + panelH * 0.56 + 86, w: bw, h: 34 }; game.uiRects.restartOver = restart; game.uiRects.homeOver = home; game.uiRects.shareOver = share; drawRectButton(restart, "↻ RESTART", "#22d3ee", 0.72 + Math.sin(performance.now() / 300) * 0.28); drawRectButton(home, "⌂ HOME", "#00ff9c", 0.8); drawRectButton(share, "SHARE SCORE", "#4ade80", 0.7); }

  function drawPaused() { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H); const L = getPanelLayout(Math.min(280, H * 0.42), 360); const { panelW, panelH, panelX, panelY } = L; drawPanel(panelX, panelY, panelW, panelH, 26); drawText("PAUSED", W / 2, panelY + panelH * 0.20, Math.min(46, W * 0.09), "#ffffff", "900"); drawText("Tap to resume", W / 2, panelY + panelH * 0.42, Math.min(22, W * 0.045), "rgba(255,255,255,0.8)", "700"); const q = { x: W / 2 - panelW * 0.3, y: panelY + panelH * 0.62, w: panelW * 0.6, h: 34 }; game.uiRects.homePause = q; drawRectButton(q, "⌂ QUIT TO HOME", "#f87171", 0.8); if (game.mode === "zen") { const e = { x: W / 2 - panelW * 0.3, y: panelY + panelH * 0.80, w: panelW * 0.6, h: 32 }; game.uiRects.endRun = e; drawRectButton(e, "END RUN", "#f87171", 0.8); } else game.uiRects.endRun = null; }

  function draw() { ctx.clearRect(0, 0, W, H); ctx.save(); if (game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake); drawBackground(); if (game.state === "menu") drawDemoWalls(); else drawWalls(); drawPowerups(); drawParticles(); drawBall(); drawHUD(); drawPopups(); if (game.state === "ready") drawReady(); if (game.state === "menu") drawMenu(); if (game.state === "revive") drawRevive(); if (game.state === "gameover") drawGameOver(); if (game.state === "paused") drawPaused(); ctx.restore(); drawButtons(); }

  function frame(now) { const raw = (now - lastTime) / 1000, dt = Math.min(raw, 0.033); lastTime = now; if (raw > 0 && raw < 0.25 && game.state === "playing") { const f = 1 / raw; fpsAvg = fpsAvg === 0 ? f : fpsAvg * 0.95 + f * 0.05; if (!game.lowPerf && fpsAvg < 45) { lowPerfTimer += raw; if (lowPerfTimer > 2) game.lowPerf = true; } else lowPerfTimer = 0; } try { update(dt); draw(); } catch (e) { console.error("Frame error:", e); } if (!loaderHidden && !loaderTimeoutSet) { loaderTimeoutSet = true; setTimeout(hideLoader, 250); } requestAnimationFrame(frame); }

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  window.addEventListener("pointerdown", (e) => {
    e.preventDefault(); ensureAudio();
    try { canvas.focus(); window.focus(); } catch {}
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const b of getButtons()) { const dx = x - b.x, dy = y - b.y; if (dx * dx + dy * dy <= (b.r + 10) * (b.r + 10)) { b.action(); return; } }
    const u = game.uiRects;
    if (game.state === "menu") {
      if (game.hub === "home") {
        if (inRect(x, y, u.hub_prev)) { cycleMode(-1); return; }
        if (inRect(x, y, u.hub_next)) { cycleMode(1); return; }
        if (inRect(x, y, u.hub_play)) { playClick(); startGame(game.selectedMode); return; }
        if (inRect(x, y, u.hub_ach)) { game.hub = "achievements"; playClick(); return; }
        if (inRect(x, y, u.hub_shop)) { game.hub = "shop"; playClick(); return; }
        if (inRect(x, y, u.hub_set)) { game.hub = "settings"; playClick(); return; }
        if (inRect(x, y, u.hub_board)) { if (window.PlaygamaBridge && window.PlaygamaBridge.hasLeaderboard) window.PlaygamaBridge.showLeaderboard(); else { game.hub = "rank"; playClick(); } return; }
      } else {
        if (inRect(x, y, u.ach_prev)) { game.achPage--; playClick(); return; }
        if (inRect(x, y, u.ach_next)) { game.achPage++; playClick(); return; }
        if (inRect(x, y, u.hub_back)) { game.hub = "home"; playClick(); return; }
        if (game.hub === "settings") for (const row of SETTINGS_ROWS) if (inRect(x, y, u["set_" + row.id])) { toggleSetting(row.id); return; }
      }
      return;
    }
    if (game.state === "paused") { if (inRect(x, y, u.homePause)) { goHome(); return; } if (inRect(x, y, u.endRun)) { gameOver(); return; } }
    if (game.state === "revive") { if (inRect(x, y, u.reviveAd)) { tryRevive(); return; } if (inRect(x, y, u.reviveNo)) { declineRevive(); return; } return; }
    if (game.state === "gameover") { if (inRect(x, y, u.shareOver)) { shareGame(); return; } if (inRect(x, y, u.homeOver)) { goHome(); return; } if (inRect(x, y, u.restartOver) && performance.now() - game.gameOverAt > 300) { startGame(game.mode); return; } return; }
    action();
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (game.state === "menu" && game.hub === "home") { const i = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(e.code); if (i >= 0) { playClick(); startGame(MODES[i].id); return; } if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); playClick(); startGame(game.selectedMode); return; } }
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") { e.preventDefault(); ensureAudio(); action(); }
    if (e.code === "KeyP") togglePause();
    if (e.code === "KeyM") toggleSound();
    if (e.code === "KeyF") toggleFx();
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden && game.state === "playing") pauseGame(); });
  window.addEventListener("blur", pauseGame);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  window.ColorSwitchBlast = { pause: pauseGame, resume: resumeGame, restart: startGame, setMuted(m) { const v = !!m; if (v && game.settings.sound) toggleSound(); if (!v && !game.settings.sound) toggleSound(); }, getState() { return { state: game.state, score: game.score, best: game.best, combo: game.combo, maxCombo: game.maxCombo, settings: game.settings }; } };

  window.addEventListener("message", (ev) => { const d = ev.data; if (!d || typeof d !== "object") return; const t = d.type || d.action; if (t === "pause" || t === "yt-playables:pause" || t === "playables:pause") pauseGame(); if (t === "resume" || t === "yt-playables:resume" || t === "playables:resume") resumeGame(); if (t === "restart" || t === "yt-playables:restart" || t === "playables:restart") startGame(); });

  resize();
  requestAnimationFrame(frame);
})();