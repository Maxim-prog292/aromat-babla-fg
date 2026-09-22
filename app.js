const fallbackConfig = {
  appTitle: "Собери аромат денег",
  startText: "Выберите три ингредиента и узнайте, какой финансовый аромат подходит именно вам.",
  startButton: "Старт",
  selectTitle: "Выберите 3 ингредиента",
  mixingTitle: "Смешиваем ваш финансовый аромат...",
  mixingText: "Частицы соединяются, цвета перетекают, формула становится точнее.",
  idleTimeout: 30000,
  mixingDuration: 8200,
  maxSelectedIngredients: 3,
  visual: {
    particleCountMultiplier: 20,
    dragParticleCount: 260,
    droppedIngredientParticleCount: 3400,
    particleSizeScale: 0.033,
    showOrbitLines: false,
    dropZoneDiameter: 800,
    idleCloudRadius: 600,
    baseParticleSize: 13,
    mixParticleSize: 16,
    baseGlowSize: 46,
    mixGlowSize: 68,
    livingCloud: {
      enabled: true,
      shapeChangeInterval: 5200,
      morphDuration: 2600,
      shapeRadius: 430,
      waveAmplitude: 118,
      waveSpeed: .78,
      driftRadius: 86,
      settleDelay: 1800,
      settleDuration: 2200,
      settleDamping: .90,
      joinExistingShapeDelay: 250,
      joinExistingShapeSpread: 72,
      attraction: .012,
      turbulence: .018,
      glowBoost: 2.05,
      glowRenderRatio: .45,
      spriteBucketSize: 2,
      rayChance: 0
    },
    dragGravity: 1.2,
    dragOrbitRadius: 50,
    dragOrbitSpread: 18,
    mixing: {
      orbitBaseRadius: 120,
      orbitRadiusStep: 105,
      orbitTiltSpread: 1.25,
      speedStart: 0.55,
      speedPeak: 7.8,
      collapseStart: 0.72,
      clusterRadius: 48
    },
    finalWind: {
      enabled: true,
      strength: 0.42,
      waveAmplitude: 58,
      waveFrequency: 0.011,
      flowSpeed: 0.08,
      spreadRadius: 460
    }
  },
  priority: ["stability", "capital", "freedom"],
  ingredients: [
    { id: "lemon", title: "Лимон", description: "Искра цели и свежего решения.", color: "#ffcf3f", scores: { stability: 0, capital: 0, freedom: 3 } },
    { id: "orange", title: "Апельсин", description: "Солнечная энергия возможностей.", color: "#ff8a24", scores: { stability: 0, capital: 0, freedom: 3 } },
    { id: "apple", title: "Яблоко", description: "Зеленый импульс роста.", color: "#69d861", scores: { stability: 0, capital: 0, freedom: 3 } },
    { id: "vanilla", title: "Ваниль", description: "Мягкость желаний и личного комфорта.", color: "#f7d88d", scores: { stability: 0, capital: 0, freedom: 3 } },
    { id: "tobacco", title: "Табак", description: "Теплая выдержка и спокойная сила.", color: "#b87938", scores: { stability: 3, capital: 0, freedom: 0 } },
    { id: "leather", title: "Кожа", description: "Статус, уверенность и плотная база.", color: "#8d2232", scores: { stability: 3, capital: 0, freedom: 0 } },
    { id: "wood", title: "Древесина", description: "Основа, структура и долгий горизонт.", color: "#a86b3a", scores: { stability: 1, capital: 1, freedom: 0 } },
    { id: "paper", title: "Бумага", description: "Шорох купюр, документов и сделок.", color: "#e8d9b8", scores: { stability: 0, capital: 3, freedom: 0 } },
    { id: "rubber", title: "Резина", description: "Плотный индустриальный акцент капитала.", color: "#4b4f58", scores: { stability: 0, capital: 3, freedom: 0 } },
    { id: "musk", title: "Мускус", description: "Шлейф влияния и притяжения.", color: "#c99a74", scores: { stability: 0, capital: 2, freedom: 1 } }
  ],
  results: [
    { id: "stability", number: 1, title: "Финансовая стабильность", description: "Аромат уверенности, накоплений и спокойного отношения к деньгам.", color: "#2E7D32", bottleNumber: 1 },
    { id: "capital", number: 2, title: "Аромат капитала", description: "Аромат денег, банков, купюр и крупных активов.", color: "#D4A017", bottleNumber: 2 },
    { id: "freedom", number: 3, title: "Финансовая свобода", description: "Аромат возможностей, желаний и целей.", color: "#2196F3", bottleNumber: 3 }
  ]
};

const $ = (selector) => document.querySelector(selector);
const canvas = $("#aromaCanvas");
let context = null;
let gpuCanvas = null;
let gpuRenderer = null;
let fallbackPerformanceProfile = false;
const screens = {
  start: $("#startScreen"),
  select: $("#selectScreen"),
  mixing: $("#mixingScreen"),
  result: $("#resultScreen")
};

let config = fallbackConfig;
let selected = [];
let particles = [];
let drag = null;
let finalMode = false;
let finalColor = "#f7d88d";
let finalColorRgb = hexToRgb(finalColor);
let currentResult = null;
let mixStartTime = 0;
let resultMode = false;
let resultStartTime = 0;
let resultTimer = 0;
let sceneRoll = 0;
let lastTime = performance.now();
let lastRenderTime = 0;
let renderAccumulatorMs = 0;
let auraVisible = false;
let width = 0;
let height = 0;
let pixelRatio = 0;
let nextGpuPruneTime = 0;
let fpsWindowStart = performance.now();
let fpsFrameCount = 0;
let measuredFps = 0;
let frameWorkMs = 0;

const center = vec3(0, 0, 0);
const spriteCache = new Map();
const livingCloud = {
  currentShape: "sphere",
  nextShape: "wave",
  transitionStart: 0,
  nextChange: 0,
  shapes: ["sphere", "ring", "wave", "spiral", "hourglass", "bloom"]
};

// The visible carrier and pointer response are adapted from ember-flow.
// Mixing itself still uses the original orbital/collapse choreography below.
const EMBER_FLOW = {
  maxPointers: 4,
  pointerRadius: 285,
  pointerStrength: .78,
  hoverStrength: .12,
  rippleDuration: 1.5,
  rippleSpeed: 520,
  rippleWidth: 82,
  followRate: 10.5,
  omega: { x: 2.8, y: 3.2, z: 6 },
  gamma: { x: 2.5, y: 2.8, z: 5 },
  rms: { x: 2.8, y: 2.3, z: 1.5 }
};

class EmberFlowInteraction {
  constructor() {
    this.time = 0;
    this.pointers = new Float32Array(EMBER_FLOW.maxPointers * 4);
    this.velocities = new Float32Array(EMBER_FLOW.maxPointers * 2);
    this.waves = new Float32Array(EMBER_FLOW.maxPointers * 4);
    this.slots = Array.from({ length: EMBER_FLOW.maxPointers }, () => ({
      id: null,
      kind: "touch",
      pressed: false,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      strength: 0,
      target: 0,
      vx: 0,
      vy: 0,
      dx: 0,
      dy: 0,
      moved: -10
    }));
    this.ripples = Array.from({ length: EMBER_FLOW.maxPointers }, () => ({
      x: 0,
      y: 0,
      born: -10,
      power: 0
    }));
    this.nextRipple = 0;
  }

  find(id) {
    return this.slots.find((slot) => slot.id === id);
  }

  acquire(id, point, kind) {
    let slot = this.find(id);
    if (slot) return slot;
    slot = this.slots
      .filter((candidate) => candidate.id === null)
      .sort((a, b) => a.strength - b.strength)[0];
    if (!slot) return null;
    Object.assign(slot, {
      id,
      kind,
      pressed: false,
      x: point.x,
      y: point.y,
      tx: point.x,
      ty: point.y,
      strength: 0,
      target: 0,
      vx: 0,
      vy: 0,
      dx: 0,
      dy: 0,
      moved: this.time
    });
    return slot;
  }

  down(id, point, kind = "touch", pressure = .5) {
    const slot = this.acquire(id, point, kind);
    if (!slot) return false;
    slot.pressed = true;
    slot.target = kind === "pen"
      ? .62 + .30 * clamp01(pressure)
      : EMBER_FLOW.pointerStrength;
    slot.tx = point.x;
    slot.ty = point.y;
    return true;
  }

  move(id, point, kind = "mouse", pressure = .5) {
    const slot = this.find(id) || (kind === "mouse" ? this.acquire(id, point, kind) : null);
    if (!slot) return false;
    const dt = Math.min(.08, Math.max(1 / 120, this.time - slot.moved));
    slot.dx = Math.max(-1800, Math.min(1800, (point.x - slot.tx) / dt));
    slot.dy = Math.max(-1800, Math.min(1800, (point.y - slot.ty) / dt));
    slot.tx = point.x;
    slot.ty = point.y;
    slot.moved = this.time;
    if (!slot.pressed) slot.target = EMBER_FLOW.hoverStrength;
    else if (kind === "pen") slot.target = .62 + .30 * clamp01(pressure);
    return true;
  }

  up(id, { hover = false, cancelled = false } = {}) {
    const slot = this.find(id);
    if (!slot) return;
    if (slot.pressed && !cancelled) {
      Object.assign(this.ripples[this.nextRipple++ % EMBER_FLOW.maxPointers], {
        x: slot.tx,
        y: slot.ty,
        born: this.time,
        power: .62 + .14 * Math.min(3, Math.hypot(slot.vx, slot.vy) / 420)
      });
    }
    slot.pressed = false;
    slot.target = hover && slot.kind === "mouse" && !cancelled ? EMBER_FLOW.hoverStrength : 0;
    slot.dx = 0;
    slot.dy = 0;
    if (!slot.target) slot.id = null;
  }

  clear(immediate = true) {
    this.slots.forEach((slot) => {
      slot.id = null;
      slot.pressed = false;
      slot.target = 0;
      slot.dx = 0;
      slot.dy = 0;
      if (immediate) {
        slot.strength = 0;
        slot.vx = 0;
        slot.vy = 0;
        slot.x = slot.tx;
        slot.y = slot.ty;
      }
    });
    if (immediate) {
      this.ripples.forEach((ripple) => { ripple.power = 0; });
      this.pointers.fill(0);
      this.velocities.fill(0);
      this.waves.fill(0);
    }
  }

  step(seconds) {
    const dt = Math.min(.08, Math.max(0, seconds));
    this.time += dt;
    this.slots.forEach((slot, index) => {
      const positionEase = 1 - Math.exp(-28 * dt);
      const strengthEase = 1 - Math.exp(-(slot.target > slot.strength ? 15 : 4.5) * dt);
      const velocityEase = 1 - Math.exp(-12 * dt);
      slot.x += (slot.tx - slot.x) * positionEase;
      slot.y += (slot.ty - slot.y) * positionEase;
      slot.strength += (slot.target - slot.strength) * strengthEase;
      if (Math.abs(slot.target - slot.strength) < .001) slot.strength = slot.target;
      if (this.time - slot.moved > .07) {
        slot.dx = 0;
        slot.dy = 0;
      }
      slot.vx += (slot.dx - slot.vx) * velocityEase;
      slot.vy += (slot.dy - slot.vy) * velocityEase;
      this.pointers.set([slot.x, slot.y, slot.strength, .92 + .50 * slot.strength], index * 4);
      this.velocities.set([slot.vx, slot.vy], index * 2);
      const ripple = this.ripples[index];
      const age = this.time - ripple.born;
      this.waves.set([ripple.x, ripple.y, age, age < EMBER_FLOW.rippleDuration ? ripple.power : 0], index * 4);
    });
  }
}

const emberInteraction = new EmberFlowInteraction();
let emberStep = 0;

boot();

function boot() {
  loadConfig()
    .then((loaded) => {
      config = normalizeConfig(loaded);
      initializeParticleRenderer();
      applyText();
      renderIngredients();
      bindControls();
      resetAll();
      screens.start.remove();
      window.ExhibitUI?.mount({ timeout: config.idleTimeout, reset: resetAll });
      resizeCanvas();
      requestAnimationFrame(animate);
    })
    .catch((error) => {
      console.error("Config error", error);
      config = normalizeConfig(fallbackConfig);
      initializeParticleRenderer();
      applyText();
      renderIngredients();
      bindControls();
      resetAll();
      screens.start.remove();
      window.ExhibitUI?.mount({ timeout: config.idleTimeout, reset: resetAll });
      resizeCanvas();
      requestAnimationFrame(animate);
    });
}

function loadConfig() {
  return fetch("config.json", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Cannot load config.json");
    return response.json();
  });
}

function initializeParticleRenderer() {
  const requestedProfile = new URLSearchParams(location.search).get("gpuProfile");
  const forceCanvas = requestedProfile === "canvas";
  const probe = !forceCanvas && window.AromaGpuParticles?.probe
    ? window.AromaGpuParticles.probe()
    : { supported: false, reason: forceCanvas ? "forced Canvas fallback" : "GPU renderer script unavailable" };

  if (probe.supported) {
    try {
      if (["balanced", "low", "safe"].includes(requestedProfile)) probe.forcedProfile = requestedProfile;
      gpuCanvas = document.createElement("canvas");
      gpuCanvas.className = "aroma-canvas aroma-gpu-canvas";
      gpuCanvas.setAttribute("aria-hidden", "true");
      canvas.after(gpuCanvas);
      gpuRenderer = new window.AromaGpuParticles(gpuCanvas, config, probe);
      gpuRenderer.onContextLost = () => activateCanvasFallback("WebGL context lost", true);
      gpuRenderer.onPerformanceFailure = (reason) => activateCanvasFallback(reason, true);
      gpuRenderer.onProfileChange = syncGpuParticles;
      canvas.hidden = true;
      document.documentElement.dataset.renderBackend = "webgl2";
      document.documentElement.dataset.gpuProfile = gpuRenderer.profile;
      console.info("Aroma particles:", gpuRenderer.getStats());
    } catch (error) {
      console.warn("Aroma GPU renderer failed, using Canvas fallback:", error);
      gpuCanvas?.remove();
      gpuCanvas = null;
      gpuRenderer = null;
    }
  }

  if (!gpuRenderer) activateCanvasFallback(probe.reason || "WebGL2 initialization failed");

  window.__AROMA_GPU_DIAGNOSTICS__ = () => {
    const gpu = gpuRenderer?.getStats();
    return {
      backend: gpu?.backend || "canvas2d",
      profile: gpu?.profile || "fallback",
      renderer: gpu?.renderer || probe.renderer || "not available",
      softwareRenderer: Boolean(probe.software),
      particleCount: particles.length,
      persistentCount: particles.filter((particle) => particle.flowU !== undefined).length,
      transientCount: particles.filter((particle) => particle.flowU === undefined).length,
      visualDrawCalls: gpu?.visualDrawCalls ?? (particles.length * 2),
      simulationPasses: gpu?.simulationPasses ?? 0,
      totalDrawCalls: gpu ? gpu.visualDrawCalls + gpu.simulationPasses : particles.length * 2,
      fpsCap: gpu?.targetFps || 30,
      measuredFps: Number(measuredFps.toFixed(1)),
      frameWorkMs: Number(frameWorkMs.toFixed(2)),
      renderDpr: gpu?.dpr || pixelRatio || 1,
      extensionsRequired: []
    };
  };
}

function activateCanvasFallback(reason = "WebGL2 unavailable", resetVisualState = false) {
  cancelActiveDrag();
  if (gpuRenderer) {
    gpuRenderer = null;
    gpuCanvas?.remove();
    gpuCanvas = null;
  }
  canvas.hidden = false;
  context = context || canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D fallback unavailable");
  fallbackPerformanceProfile = true;
  config.visual.dragParticleCount = Math.min(config.visual.dragParticleCount, 120);
  config.visual.droppedIngredientParticleCount = Math.min(config.visual.droppedIngredientParticleCount, 400);
  config.visual.particleCountMultiplier = Math.min(config.visual.particleCountMultiplier, 4);
  particles = thinParticlesForFallback(particles);
  width = 0;
  height = 0;
  pixelRatio = 0;
  document.documentElement.dataset.renderBackend = "canvas2d";
  document.documentElement.dataset.gpuProfile = "fallback";
  console.warn("Aroma particles: Canvas fallback enabled:", reason);
  if (resetVisualState) resetAll();
}

function thinParticlesForFallback(sourceParticles) {
  const perSource = new Map();
  return sourceParticles.filter((particle) => {
    if (particle.flowU === undefined) return true;
    const count = perSource.get(particle.source) || 0;
    if (count >= 400) return false;
    perSource.set(particle.source, count + 1);
    return true;
  });
}

function syncGpuParticles() {
  if (gpuRenderer) enforceGpuParticleBudgets();
  gpuRenderer?.setParticles(particles);
  updateParticleDataset();
}

function enforceGpuParticleBudgets() {
  if (!gpuRenderer) return;

  const persistentPerSource = gpuRenderer.profile === "safe"
    ? 1200
    : (gpuRenderer.profile === "low" ? 2000 : Infinity);
  if (Number.isFinite(persistentPerSource)) {
    const perSource = new Map();
    particles = particles.filter((particle) => {
      if (particle.flowU === undefined) return true;
      const count = perSource.get(particle.source) || 0;
      if (count >= persistentPerSource) return false;
      perSource.set(particle.source, count + 1);
      return true;
    });
  }

  const transientLimit = gpuRenderer.profile === "safe"
    ? 450
    : (gpuRenderer.profile === "low" ? 900 : 1800);
  const transient = particles.filter((particle) => particle.flowU === undefined);
  if (transient.length <= transientLimit) return;

  const activeDrag = new Set(drag?.particleIds || []);
  transient.sort((a, b) => {
    const dragPriority = Number(activeDrag.has(b)) - Number(activeDrag.has(a));
    if (dragPriority) return dragPriority;
    return Number(b.birthTime || 0) - Number(a.birthTime || 0);
  });
  const keep = new Set(transient.slice(0, transientLimit));
  particles = particles.filter((particle) => particle.flowU !== undefined || keep.has(particle));
  if (drag) drag.particleIds = drag.particleIds.filter((particle) => keep.has(particle));
}

function updateParticleDataset() {
  document.documentElement.dataset.particleCount = String(particles.length);
  document.documentElement.dataset.transientCount = String(particles.filter((particle) => particle.flowU === undefined).length);
}

function normalizeConfig(raw) {
  const visual = {
    ...fallbackConfig.visual,
    ...(raw.visual || {}),
    mixing: {
      ...fallbackConfig.visual.mixing,
      ...((raw.visual && raw.visual.mixing) || {})
    },
    finalWind: {
      ...fallbackConfig.visual.finalWind,
      ...((raw.visual && raw.visual.finalWind) || {})
    },
    livingCloud: {
      ...fallbackConfig.visual.livingCloud,
      ...((raw.visual && raw.visual.livingCloud) || {})
    }
  };
  return {
    ...fallbackConfig,
    ...raw,
    maxSelectedIngredients: Number(raw.maxSelectedIngredients || fallbackConfig.maxSelectedIngredients),
    idleTimeout: Number(raw.idleTimeout || fallbackConfig.idleTimeout),
    mixingDuration: Number(raw.mixingDuration || fallbackConfig.mixingDuration),
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients : fallbackConfig.ingredients,
    results: Array.isArray(raw.results) ? raw.results : fallbackConfig.results,
    priority: Array.isArray(raw.priority) ? raw.priority : fallbackConfig.priority,
    visual: {
      ...visual,
      particleCountMultiplier: Math.max(1, Number(visual.particleCountMultiplier || fallbackConfig.visual.particleCountMultiplier)),
      dragParticleCount: Math.max(1, Number(visual.dragParticleCount || fallbackConfig.visual.dragParticleCount)),
      droppedIngredientParticleCount: Math.max(1, Number(visual.droppedIngredientParticleCount || fallbackConfig.visual.droppedIngredientParticleCount)),
      particleSizeScale: Math.max(.001, Number(visual.particleSizeScale || fallbackConfig.visual.particleSizeScale)),
      dropZoneDiameter: Math.max(120, Number(visual.dropZoneDiameter || fallbackConfig.visual.dropZoneDiameter)),
      idleCloudRadius: Math.max(80, Number(visual.idleCloudRadius || fallbackConfig.visual.idleCloudRadius)),
      baseParticleSize: Math.max(.1, Number(visual.baseParticleSize || fallbackConfig.visual.baseParticleSize)),
      mixParticleSize: Math.max(.1, Number(visual.mixParticleSize || fallbackConfig.visual.mixParticleSize)),
      baseGlowSize: Math.max(.1, Number(visual.baseGlowSize || fallbackConfig.visual.baseGlowSize)),
      mixGlowSize: Math.max(.1, Number(visual.mixGlowSize || fallbackConfig.visual.mixGlowSize)),
      livingCloud: {
        ...visual.livingCloud,
        enabled: visual.livingCloud.enabled !== false,
        shapeChangeInterval: Math.max(900, Number(visual.livingCloud.shapeChangeInterval ?? fallbackConfig.visual.livingCloud.shapeChangeInterval)),
        morphDuration: Math.max(300, Number(visual.livingCloud.morphDuration ?? fallbackConfig.visual.livingCloud.morphDuration)),
        shapeRadius: Math.max(80, Number(visual.livingCloud.shapeRadius ?? fallbackConfig.visual.livingCloud.shapeRadius)),
        waveAmplitude: Math.max(0, Number(visual.livingCloud.waveAmplitude ?? fallbackConfig.visual.livingCloud.waveAmplitude)),
        waveSpeed: Math.max(.05, Number(visual.livingCloud.waveSpeed ?? fallbackConfig.visual.livingCloud.waveSpeed)),
        driftRadius: Math.max(0, Number(visual.livingCloud.driftRadius ?? fallbackConfig.visual.livingCloud.driftRadius)),
        settleDelay: Math.max(0, Number(visual.livingCloud.settleDelay ?? fallbackConfig.visual.livingCloud.settleDelay)),
        settleDuration: Math.max(100, Number(visual.livingCloud.settleDuration ?? fallbackConfig.visual.livingCloud.settleDuration)),
        settleDamping: Math.max(.4, Math.min(1, Number(visual.livingCloud.settleDamping ?? fallbackConfig.visual.livingCloud.settleDamping))),
        joinExistingShapeDelay: Math.max(0, Number(visual.livingCloud.joinExistingShapeDelay ?? fallbackConfig.visual.livingCloud.joinExistingShapeDelay)),
        joinExistingShapeSpread: Math.max(0, Number(visual.livingCloud.joinExistingShapeSpread ?? fallbackConfig.visual.livingCloud.joinExistingShapeSpread)),
        attraction: Math.max(.001, Number(visual.livingCloud.attraction ?? fallbackConfig.visual.livingCloud.attraction)),
        turbulence: Math.max(0, Number(visual.livingCloud.turbulence ?? fallbackConfig.visual.livingCloud.turbulence)),
        glowBoost: Math.max(.1, Number(visual.livingCloud.glowBoost ?? fallbackConfig.visual.livingCloud.glowBoost)),
        glowRenderRatio: Math.max(0, Math.min(1, Number(visual.livingCloud.glowRenderRatio ?? fallbackConfig.visual.livingCloud.glowRenderRatio))),
        spriteBucketSize: Math.max(1, Number(visual.livingCloud.spriteBucketSize ?? fallbackConfig.visual.livingCloud.spriteBucketSize)),
        rayChance: Math.max(0, Math.min(1, Number(visual.livingCloud.rayChance ?? fallbackConfig.visual.livingCloud.rayChance)))
      },
      dragGravity: Math.max(.05, Number(visual.dragGravity || fallbackConfig.visual.dragGravity)),
      dragOrbitRadius: Math.max(1, Number(visual.dragOrbitRadius || fallbackConfig.visual.dragOrbitRadius)),
      dragOrbitSpread: Math.max(0, Number(visual.dragOrbitSpread || fallbackConfig.visual.dragOrbitSpread)),
      mixing: {
        ...visual.mixing,
        orbitBaseRadius: Number(visual.mixing.orbitBaseRadius || fallbackConfig.visual.mixing.orbitBaseRadius),
        orbitRadiusStep: Number(visual.mixing.orbitRadiusStep || fallbackConfig.visual.mixing.orbitRadiusStep),
        orbitTiltSpread: Number(visual.mixing.orbitTiltSpread || fallbackConfig.visual.mixing.orbitTiltSpread),
        speedStart: Number(visual.mixing.speedStart || fallbackConfig.visual.mixing.speedStart),
        speedPeak: Number(visual.mixing.speedPeak || fallbackConfig.visual.mixing.speedPeak),
        collapseStart: Number(visual.mixing.collapseStart || fallbackConfig.visual.mixing.collapseStart),
        clusterRadius: Number(visual.mixing.clusterRadius || fallbackConfig.visual.mixing.clusterRadius)
      },
      finalWind: {
        ...visual.finalWind,
        strength: Number(visual.finalWind.strength || fallbackConfig.visual.finalWind.strength),
        waveAmplitude: Number(visual.finalWind.waveAmplitude || fallbackConfig.visual.finalWind.waveAmplitude),
        waveFrequency: Number(visual.finalWind.waveFrequency || fallbackConfig.visual.finalWind.waveFrequency),
        flowSpeed: Number(visual.finalWind.flowSpeed || fallbackConfig.visual.finalWind.flowSpeed),
        spreadRadius: Number(visual.finalWind.spreadRadius || fallbackConfig.visual.finalWind.spreadRadius)
      }
    }
  };
}

function applyText() {
  document.title = config.appTitle;
  $("#startTitle").textContent = config.appTitle;
  $("#startText").textContent = config.startText;
  $("#startButton").textContent = config.startButton;
  $("#selectTitle").textContent = config.selectTitle;
  $("#mixingTitle").textContent = config.mixingTitle;
  $("#mixingText").textContent = config.mixingText;
  document.documentElement.style.setProperty("--drop-zone-diameter", `${config.visual.dropZoneDiameter}px`);
}

function bindControls() {
  window.addEventListener("pointerdown", enterFullscreenOnce, { passive: false });
  $("#startButton").addEventListener("pointerup", () => showScreen("select"));
  $("#resetButton").addEventListener("pointerup", clearSelection);
  $("#mixButton").addEventListener("pointerup", startMixing);
  $("#restartButton").addEventListener("pointerup", resetAll);

  window.addEventListener("pointerdown", beginEmberInteraction, { passive: true });
  window.addEventListener("pointermove", moveEmberInteraction, { passive: true });
  window.addEventListener("pointerup", endEmberInteraction, { passive: true });
  window.addEventListener("pointercancel", cancelEmberInteraction, { passive: true });
  window.addEventListener("blur", () => {
    cancelActiveDrag();
    emberInteraction.clear(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelActiveDrag();
      emberInteraction.clear();
    }
  });

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("dragstart", (event) => event.preventDefault());
  window.addEventListener("selectstart", (event) => event.preventDefault());
  window.addEventListener("gesturestart", (event) => event.preventDefault());
  window.addEventListener("keydown", blockKioskKeys, true);
  history.pushState(null, "", location.href);
  window.addEventListener("popstate", () => history.pushState(null, "", location.href));
}

function canUseEmberInteraction(event) {
  if (drag || finalMode || (!screens.select.classList.contains("is-active") && !resultMode)) return false;
  return !(event.target instanceof Element && event.target.closest("button, .ingredient-card"));
}

function emberPointerPoint(event) {
  return screenToWorld(event.clientX, event.clientY);
}

function beginEmberInteraction(event) {
  if (!canUseEmberInteraction(event) || event.button !== 0) return;
  emberInteraction.down(event.pointerId, emberPointerPoint(event), event.pointerType, event.pressure);
}

function moveEmberInteraction(event) {
  if (drag || finalMode) return;
  if (!emberInteraction.find(event.pointerId) && event.pointerType !== "mouse") return;
  emberInteraction.move(event.pointerId, emberPointerPoint(event), event.pointerType, event.pressure);
}

function endEmberInteraction(event) {
  const inside = event.clientX >= 0 && event.clientX <= width && event.clientY >= 0 && event.clientY <= height;
  emberInteraction.up(event.pointerId, { hover: inside && event.pointerType === "mouse" });
}

function cancelEmberInteraction(event) {
  emberInteraction.up(event.pointerId, { cancelled: true });
}

function blockKioskKeys(event) {
  const blocked = ["F1", "F3", "F5", "F6", "F7", "F11", "F12", "PrintScreen", "Escape", "ContextMenu"];
  const combo = event.ctrlKey || event.metaKey || event.altKey;
  if (blocked.includes(event.key) || combo) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function enterFullscreenOnce() {
  // Полноэкранный режим задаёт музейная оболочка, а не первое касание посетителя.
}

function renderIngredients() {
  const grid = $("#ingredientGrid");
  grid.innerHTML = "";
  config.ingredients.forEach((ingredient) => {
    const card = document.createElement("article");
    card.className = "ingredient-card";
    card.dataset.id = ingredient.id;
    card.style.setProperty("--card-color", ingredient.color || "#f7d88d");
    card.innerHTML = `<strong>${escapeHtml(ingredient.title)}</strong><span>${escapeHtml(ingredient.description || "")}</span>`;
    card.addEventListener("pointerdown", (event) => beginDrag(event, ingredient, card));
    grid.appendChild(card);
  });
}

function beginDrag(event, ingredient, card) {
  if (drag || event.button !== 0) return;
  if (selected.some((item) => item.id === ingredient.id)) return;
  if (selected.length >= config.maxSelectedIngredients) return;

  event.preventDefault();
  drag = {
    ingredient,
    pointerId: event.pointerId,
    captureTarget: card,
    world: screenToWorld(event.clientX, event.clientY),
    particleIds: []
  };
  spawnDragCluster(ingredient, drag.world);
  card.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", cancelDrag);
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.world = screenToWorld(event.clientX, event.clientY);
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const finishedDrag = drag;
  const zone = $("#mixZone").getBoundingClientRect();
  const dx = event.clientX - (zone.left + zone.width / 2);
  const dy = event.clientY - (zone.top + zone.height / 2);
  const inside = Math.sqrt(dx * dx + dy * dy) <= config.visual.dropZoneDiameter / 2;
  if (inside) {
    removeDragCluster();
    addIngredient(drag.ingredient);
  } else {
    scatterDragCluster();
  }
  drag = null;
  detachDragListeners(finishedDrag);
}

function cancelDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  cancelActiveDrag();
}

function cancelActiveDrag() {
  if (!drag) return;
  const cancelledDrag = drag;
  removeDragCluster();
  drag = null;
  detachDragListeners(cancelledDrag);
}

function detachDragListeners(finishedDrag) {
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", cancelDrag);
  try {
    if (finishedDrag?.captureTarget?.hasPointerCapture?.(finishedDrag.pointerId)) {
      finishedDrag.captureTarget.releasePointerCapture(finishedDrag.pointerId);
    }
  } catch (_) {
    // Pointer capture may already be released by the browser.
  }
}

function addIngredient(ingredient) {
  selected.push(ingredient);
  document.querySelector(`[data-id="${ingredient.id}"]`)?.classList.add("is-selected");
  spawnCloud(ingredient);
  spawnBurst(ingredient.color, 72);
  syncGpuParticles();
  updateSelectionUi();
}

function spawnDragCluster(ingredient, worldPosition) {
  const baseColor = hexToRgb(ingredient.color || "#f7d88d");
  const gpuLimit = gpuRenderer?.profile === "safe" ? 360 : (gpuRenderer?.profile === "low" ? 720 : Infinity);
  const count = Math.min(Math.round(config.visual.dragParticleCount), gpuLimit);
  const now = performance.now();
  for (let i = 0; i < count; i += 1) {
    const radius = config.visual.dragOrbitRadius + (Math.random() - .5) * config.visual.dragOrbitSpread * 2;
    const offset = mul(randomUnitVector(), Math.max(1, radius));
    const particle = {
      source: `drag-${ingredient.id}`,
      isDragPreview: true,
      isScatter: false,
      position: add(worldPosition, offset),
      velocity: mul(randomUnitVector(), .3 + Math.random() * .7),
      baseColor,
      color: { ...baseColor },
      alpha: .62 + Math.random() * .34,
      size: 5 + Math.random() * 8,
      seed: Math.random() * 1000,
      phase: Math.random() * Math.PI * 2,
      birthTime: now,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitRadius: Math.max(1, radius),
      orbitSpeed: (.025 + Math.random() * .018) * (Math.random() > .5 ? 1 : -1),
      tilt: -.65 + Math.random() * 1.3,
      roll: Math.random() * Math.PI * 2
    };
    particles.push(particle);
    drag.particleIds.push(particle);
  }
  syncGpuParticles();
}

function removeDragCluster() {
  if (!drag) return;
  const dragSet = new Set(drag.particleIds);
  particles = particles.filter((particle) => !dragSet.has(particle));
  syncGpuParticles();
}

function scatterDragCluster() {
  if (!drag) return;
  const now = performance.now();
  drag.particleIds.forEach((particle) => {
    const orbit = projectOrbitAround(drag.world, particle.orbitAngle, particle.orbitRadius, particle.roll, particle.tilt);
    particle.isDragPreview = false;
    particle.isScatter = true;
    particle.position = orbit;
    particle.birthTime = now;
    particle.life = 70 + Math.random() * 45;
    addTo(particle.velocity, mul(randomUnitVector(), 2.2 + Math.random() * 3.2));
  });
  syncGpuParticles();
}

function updateSelectionUi() {
  $("#counter").textContent = `${selected.length}/${config.maxSelectedIngredients}`;
  $("#selectedList").innerHTML = "";
  $(".mix-label").classList.toggle("is-hidden", selected.length > 0);
  const isReady = selected.length === config.maxSelectedIngredients;
  $("#mixButton").disabled = !isReady;
  $("#mixButton").classList.toggle("is-visible", isReady);
}

function clearSelection() {
  cancelActiveDrag();
  selected = [];
  particles = [];
  syncGpuParticles();
  emberInteraction.clear();
  finalMode = false;
  resultMode = false;
  currentResult = null;
  resetLivingCloud();
  clearTimeout(resultTimer);
  setAuraVisible(false);
  document.querySelectorAll(".ingredient-card").forEach((card) => card.classList.remove("is-selected"));
  updateSelectionUi();
}

function startMixing() {
  if (selected.length !== config.maxSelectedIngredients) return;
  cancelActiveDrag();
  emberInteraction.clear();
  currentResult = calculateResult();
  finalColor = currentResult.color || mixColors(selected.map((item) => item.color));
  finalColorRgb = hexToRgb(finalColor);
  finalMode = true;
  resultMode = false;
  mixStartTime = performance.now();
  prepareOrbits();
  setAuraVisible(true);
  showScreen("mixing");
  clearTimeout(resultTimer);
  resultTimer = setTimeout(showResult, config.mixingDuration);
}

function showResult() {
  const result = currentResult || calculateResult();
  $("#resultNumber").textContent = `№${result.number}`;
  $("#resultTitle").textContent = result.title;
  $("#resultDescription").textContent = result.description;
  resultMode = true;
  resultStartTime = performance.now();
  finalMode = false;
  if (!gpuRenderer) prepareResultFlow(resultStartTime);
  setAuraVisible(false);
  showScreen("result");
}

function calculateResult() {
  const scores = {};
  config.results.forEach((result) => { scores[result.id] = 0; });
  selected.forEach((ingredient) => {
    Object.entries(ingredient.scores || {}).forEach(([id, value]) => {
      scores[id] = (scores[id] || 0) + Number(value || 0);
    });
  });

  const order = config.priority.length ? config.priority : config.results.map((item) => item.id);
  const winnerId = Object.keys(scores).sort((a, b) => {
    const delta = scores[b] - scores[a];
    if (delta !== 0) return delta;
    return order.indexOf(a) - order.indexOf(b);
  })[0];
  return config.results.find((result) => result.id === winnerId) || config.results[0];
}

function showScreen(next) {
  Object.entries(screens).forEach(([name, screen]) => {
    screen.classList.toggle("is-active", name === next);
  });
}

function resetAll() {
  cancelActiveDrag();
  selected = [];
  particles = [];
  syncGpuParticles();
  emberInteraction.clear();
  finalMode = false;
  resultMode = false;
  currentResult = null;
  resetLivingCloud();
  clearTimeout(resultTimer);
  setAuraVisible(false);
  document.querySelectorAll(".ingredient-card").forEach((card) => card.classList.remove("is-selected"));
  updateSelectionUi();
  showScreen("select");
}

function spawnCloud(ingredient) {
  const baseColor = hexToRgb(ingredient.color || "#f7d88d");
  const count = Math.round(config.visual.droppedIngredientParticleCount);
  const now = performance.now();
  const layerIndex = Math.max(0, selected.findIndex((item) => item.id === ingredient.id));
  const shouldJoinShape = selected.length > 1 && config.visual.livingCloud.enabled;
  if (shouldJoinShape) ensureLivingCloudStarted(now);
  for (let i = 0; i < count; i += 1) {
    const particle = createCloudParticle(ingredient.id, baseColor, now, i, count, layerIndex);
    if (shouldJoinShape) {
      const target = emberSheetTarget(particle, now * .001);
      particle.position = add(target, randomInCloud(8, config.visual.livingCloud.joinExistingShapeSpread));
      particle.velocity = vec3((Math.random() - .5) * .025, (Math.random() - .5) * .025, (Math.random() - .5) * .025);
      particle.birthTime = now - config.visual.livingCloud.settleDelay + config.visual.livingCloud.joinExistingShapeDelay;
    }
    particles.push(particle);
  }
}

function createCloudParticle(source, baseColor, now, index, count, layerIndex) {
  const spherical = randomInCloud(80, 300);
  const seed = Math.random() * 1000;
  const phase = Math.random() * Math.PI * 2;
  const columns = Math.max(2, Math.ceil(Math.sqrt(count * 1.55)));
  const rows = Math.max(2, Math.ceil(count / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const flowU = ((column + hashNoise(seed + 11.7)) / columns) * 2 - 1;
  const flowV = ((row + hashNoise(seed + 29.1)) / rows) * 2 - 1;
  return {
    source,
    position: add(center, spherical),
    velocity: vec3((Math.random() - .5) * .045, (Math.random() - .5) * .045, (Math.random() - .5) * .045),
    baseColor,
    color: { ...baseColor },
    alpha: .45 + Math.random() * .5,
    size: 6 + Math.random() * 9,
    seed,
    phase,
    birthTime: now,
    orbitAngle: Math.random() * Math.PI * 2,
    orbitRadius: 150 + Math.random() * 260,
    orbitSpeed: (.004 + Math.random() * .006) * (Math.random() > .5 ? 1 : -1),
    tilt: -.55 + Math.random() * 1.1,
    roll: Math.random() * Math.PI * 2,
    flowU,
    flowV,
    flowLayer: layerIndex,
    flowDisplacement: vec3(),
    flowVelocity: vec3()
  };
}

function spawnBurst(hex, count) {
  const baseColor = hexToRgb(hex || "#f7d88d");
  const gpuLimit = gpuRenderer?.profile === "safe" ? 160 : (gpuRenderer?.profile === "low" ? 300 : Infinity);
  const burstCount = Math.min(Math.round(count * Math.sqrt(config.visual.particleCountMultiplier)), gpuLimit);
  const now = performance.now();
  for (let i = 0; i < burstCount; i += 1) {
    const direction = randomUnitVector();
    particles.push({
      source: "burst",
      position: { ...center },
      velocity: mul(direction, .9 + Math.random() * 1.6),
      baseColor,
      color: { ...baseColor },
      alpha: .7,
      size: 7 + Math.random() * 10,
      life: 42 + Math.random() * 36,
      birthTime: now,
      seed: Math.random() * 1000,
      phase: Math.random() * Math.PI * 2,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitRadius: 130 + Math.random() * 260,
      orbitSpeed: (.005 + Math.random() * .006) * (Math.random() > .5 ? 1 : -1),
      tilt: -.7 + Math.random() * 1.4,
      roll: Math.random() * Math.PI * 2
    });
  }
}

function prepareOrbits() {
  // Drag previews and burst/scatter particles are short-lived. They must never
  // enter the mixing state: the old code cleared their life and made them immortal.
  // The remaining orbit attributes stay populated for drag compatibility; the
  // mixing animation itself now follows the alchemical three-stream flow.
  particles = particles.filter((particle) => particle.flowU !== undefined && !particle.isScatter && !particle.isDragPreview);
  sceneRoll = Math.random() * Math.PI * 2;
  const mix = config.visual.mixing;
  const rings = new Map(selected.map((item, index) => [item.id, mix.orbitBaseRadius + index * mix.orbitRadiusStep]));
  const tilts = selected.map((_, index) => (-.5 + index / Math.max(1, selected.length - 1)) * mix.orbitTiltSpread * 2);
  const rolls = selected.map((_, index) => sceneRoll + index * (Math.PI * 2 / Math.max(1, selected.length)) + Math.random() * .7);
  particles.forEach((particle) => {
    const selectedIndex = Math.max(0, selected.findIndex((item) => item.id === particle.source));
    const rel = sub(particle.position, center);
    particle.orbitAngle = Math.atan2(rel.y, rel.x) + Math.random() * Math.PI * 2;
    particle.orbitRadius = (rings.get(particle.source) || 250) + (Math.random() - .5) * 76;
    particle.orbitSpeed = (.006 + Math.random() * .004) * (selectedIndex % 2 === 0 ? 1 : -1);
    particle.tilt = (tilts[selectedIndex] ?? 0) + (Math.random() - .5) * .35;
    particle.roll = (rolls[selectedIndex] ?? sceneRoll) + (Math.random() - .5) * .3;
    particle.phase = Math.random() * Math.PI * 2;
    particle.flowExcitation = 0;
    particle.mixStartPosition = { ...particle.position };
  });
  syncGpuParticles();
}

function animate(now) {
  const elapsedMs = Math.min(64, Math.max(0, now - lastTime));
  const seconds = elapsedMs * .001;
  lastTime = now;
  renderAccumulatorMs += elapsedMs;
  emberInteraction.step(seconds);

  const fpsCap = gpuRenderer?.targetFps || 30;
  const frameInterval = 1000 / fpsCap;
  if (lastRenderTime && renderAccumulatorMs < frameInterval - .75) {
    requestAnimationFrame(animate);
    return;
  }

  const renderElapsedMs = Math.min(64, Math.max(0, lastRenderTime ? now - lastRenderTime : elapsedMs));
  const dt = renderElapsedMs / 16.67;
  const renderSeconds = renderElapsedMs * .001;
  const time = now * .001;
  lastRenderTime = now;
  renderAccumulatorMs = lastRenderTime ? Math.max(0, Math.min(frameInterval, renderAccumulatorMs - frameInterval)) : 0;
  const frameWorkStart = performance.now();

  resizeCanvas();
  if (gpuRenderer) pruneGpuTransients(now);
  else {
    updateParticles(dt, time, now, renderSeconds);
    updateParticleDataset();
  }
  drawScene(time, now, renderSeconds);
  gpuRenderer?.sampleFrame(renderElapsedMs);
  const currentWorkMs = performance.now() - frameWorkStart;
  frameWorkMs = frameWorkMs ? frameWorkMs * .92 + currentWorkMs * .08 : currentWorkMs;
  document.documentElement.dataset.frameWorkMs = frameWorkMs.toFixed(2);
  if (gpuRenderer) document.documentElement.dataset.gpuProfile = gpuRenderer.profile;
  fpsFrameCount += 1;
  if (now - fpsWindowStart >= 1000) {
    measuredFps = fpsFrameCount * 1000 / Math.max(1, now - fpsWindowStart);
    document.documentElement.dataset.renderFps = measuredFps.toFixed(1);
    fpsWindowStart = now;
    fpsFrameCount = 0;
  }
  requestAnimationFrame(animate);
}

function pruneGpuTransients(now) {
  if (now < nextGpuPruneTime || drag) return;
  nextGpuPruneTime = now + 500;
  const previousCount = particles.length;
  particles = particles.filter((particle) => {
    if (particle.flowU !== undefined) return true;
    if (particle.isDragPreview) return Boolean(drag);
    if (!Number.isFinite(particle.life)) return false;
    return now - (particle.birthTime || now) < particle.life * 16.67;
  });
  if (particles.length !== previousCount) syncGpuParticles();
}

function updateParticles(dt, time, now, seconds) {
  const mixProgress = finalMode ? Math.min(1, (now - mixStartTime) / Math.max(1, config.mixingDuration)) : 0;

  updateLivingCloud(time, now);
  emberStep += 1;

  particles = particles.filter((particle) => {
    let emberDriven = false;
    if (particle.isDragPreview) {
      moveDragParticle(particle, dt, time);
    } else if (finalMode) {
      moveMixingParticle(particle, mixProgress, dt);
      emberDriven = true;
    } else if (particle.flowU !== undefined && particle.life === undefined && !particle.isScatter) {
      moveEmberFlowParticle(particle, seconds, time, now, resultMode);
      emberDriven = true;
    } else if (resultMode && config.visual.finalWind.enabled) {
      moveWindParticle(particle, dt, time, now);
    } else {
      moveIdleParticle(particle, dt, time);
    }

    if (!emberDriven) {
      addScaledTo(particle.position, particle.velocity, dt);
      scaleTo(particle.velocity, finalMode ? .865 : (resultMode ? .94 : .965));
    }

    if (particle.life !== undefined) {
      particle.life -= dt;
      particle.alpha *= .988;
      if (particle.life <= 0) return false;
    }

    return true;
  });
}

function moveDragParticle(particle, dt, time) {
  if (!drag) return;
  particle.orbitAngle += particle.orbitSpeed * dt;
  const orbitTarget = projectOrbitAround(drag.world, particle.orbitAngle, particle.orbitRadius, particle.roll, particle.tilt);
  const rel = sub(orbitTarget, particle.position);
  const distance = Math.max(18, length(rel));
  const gravity = Math.min(3.6, config.visual.dragGravity * (72 / distance));
  const direction = normalize(rel);
  const tangent = normalize(vec3(-rel.y, rel.x, Math.sin(time * 2 + particle.seed) * 60));
  addScaledTo(particle.velocity, direction, gravity * dt);
  addScaledTo(particle.velocity, tangent, .028 * dt);
  scaleTo(particle.velocity, .972);
  lerpColor(particle.color, particle.baseColor, .04 * dt);
}

function moveIdleParticle(particle, dt, time) {
  if (selected.length > 0 && config.visual.livingCloud.enabled && !particle.life && !particle.isScatter) {
    const activation = getLivingActivation(particle);
    if (activation <= 0) {
      moveSettlingParticle(particle, dt, time);
    } else {
      moveLivingParticle(particle, dt, time, activation);
    }
    return;
  }

  const rel = sub(particle.position, center);
  const distance = Math.max(1, length(rel));
  const swirl = normalize(vec3(-rel.y, rel.x, Math.sin(time + particle.seed) * 70));
  addScaledTo(particle.velocity, swirl, .006 * dt);
  particle.velocity.x += Math.cos(time * .7 + particle.seed) * .003 * dt;
  particle.velocity.y += Math.sin(time * .62 + particle.seed) * .003 * dt;
  particle.velocity.z += Math.sin(time * .52 + particle.phase) * .004 * dt;

  const cloudRadius = config.visual.idleCloudRadius;
  if (distance > cloudRadius) {
    addScaledTo(particle.velocity, normalize(rel), -((distance - cloudRadius) / cloudRadius) * .8 * dt);
  }

  lerpColor(particle.color, particle.baseColor, .012 * dt);
}

function moveEmberFlowParticle(particle, seconds, time, now, isResult) {
  const h = Math.min(.032, Math.max(0, seconds));
  const displacement = particle.flowDisplacement;
  const velocity = particle.flowVelocity;
  const scale = Math.max(160, height * .46);
  const a = 2.2 * particle.flowU + .20 * time;
  const b = 2.7 * particle.flowV - .15 * time;
  const eddyX = .0025 * 2.7 * Math.sin(a) * Math.cos(b) * scale;
  const eddyY = -.0025 * 2.2 * Math.cos(a) * Math.sin(b) * scale;

  if (h > 0) {
    integrateEmberAxis(displacement, velocity, "x", EMBER_FLOW.omega.x, EMBER_FLOW.gamma.x, EMBER_FLOW.rms.x, h, eddyX, emberNoise(particle.seed, 0));
    integrateEmberAxis(displacement, velocity, "y", EMBER_FLOW.omega.y, EMBER_FLOW.gamma.y, EMBER_FLOW.rms.y, h, eddyY, emberNoise(particle.seed, 1));
    integrateEmberAxis(displacement, velocity, "z", EMBER_FLOW.omega.z, EMBER_FLOW.gamma.z, EMBER_FLOW.rms.z, h, 0, emberNoise(particle.seed, 2));
  }

  const carrier = emberSheetTarget(particle, time);
  carrier.x += displacement.x;
  carrier.y += displacement.y;
  carrier.z += displacement.z;
  const desired = applyEmberInteraction(carrier, particle);

  const oldPosition = { ...particle.position };
  const entryStart = isResult ? resultStartTime : (particle.birthTime || now);
  const delay = isResult ? 80 : config.visual.livingCloud.settleDelay;
  const duration = isResult ? 1750 : config.visual.livingCloud.settleDuration;
  const activation = smoothstep((now - entryStart - delay) / Math.max(100, duration));
  const follow = 1 - Math.exp(-(1.2 + EMBER_FLOW.followRate * activation) * h);
  particle.position.x += (desired.x - particle.position.x) * follow;
  particle.position.y += (desired.y - particle.position.y) * follow;
  particle.position.z += (desired.z - particle.position.z) * follow;

  const frameUnits = Math.max(.001, h * 60);
  particle.velocity.x = (particle.position.x - oldPosition.x) / frameUnits;
  particle.velocity.y = (particle.position.y - oldPosition.y) / frameUnits;
  particle.velocity.z = (particle.position.z - oldPosition.z) / frameUnits;
  const targetAlpha = .08 + .84 * (particle.flowOpacity ?? 1);
  const alphaEase = 1 - Math.exp(-5.2 * h);
  particle.alpha = Math.min(.98, Math.max(.025, particle.alpha + (targetAlpha - particle.alpha) * alphaEase + particle.flowExcitation * .006));
  lerpColor(particle.color, isResult ? finalColorRgb : particle.baseColor, isResult ? .045 : .018);
}

function integrateEmberAxis(displacement, velocity, axis, omega, gamma, rms, h, eddy, noise) {
  const spring = omega * omega;
  velocity[axis] -= .5 * h * spring * displacement[axis];
  displacement[axis] += .5 * h * velocity[axis];
  const damping = Math.exp(-gamma * h);
  velocity[axis] = damping * velocity[axis]
    + (1 - damping) * eddy
    + Math.sqrt(Math.max(0, 1 - damping * damping)) * omega * rms * noise;
  displacement[axis] += .5 * h * velocity[axis];
  velocity[axis] -= .5 * h * spring * displacement[axis];

  const bound = 4.5 * rms;
  if (displacement[axis] < -bound || displacement[axis] > bound) {
    displacement[axis] = Math.max(-bound, Math.min(bound, displacement[axis]));
    velocity[axis] *= -.82;
  }
}

function emberSheetTarget(particle, time) {
  const u = particle.flowU;
  const v = particle.flowV;
  const layer = (particle.flowLayer % 3) * .48;
  const s = layer * 2.34;
  const phase = 4.6 * u + 2.3 * Math.sin(4.4 * v + .34 * time + s) - .48 * time + s;
  const widthFactor = .67 + .18 * Math.sin(4.3 * v - .28 * time + s);
  let x = widthFactor * (u + .90 * Math.sin(phase)) + .35 * Math.sin(6.5 * v + .30 * time + s);
  let y = 1.85 * v + .30 * Math.sin(phase + 2.3 * v) + .42 * Math.sin(5.7 * v + 2.3 * u - .35 * time + s);
  let z = .62 * Math.cos(phase) + .35 * Math.sin(5.3 * v - 1.3 * u + .29 * time + s);
  x += .24 * Math.sin(8.4 * v - 1.5 * u + .23 * time + s);
  y += .18 * Math.sin(4.4 * v + 2.5 * u - .24 * time + s);
  z += .12 * Math.sin(7 * u + 5 * v + .19 * time + s);
  x += .012 * Math.sin(29 * u + 11 * v + .4 * time);
  y += .012 * Math.sin(17 * u - 23 * v - .3 * time);
  z += .012 * Math.sin(21 * u + 19 * v + .2 * time);

  const angle = .18 * Math.sin(.13 * time) + layer * .37;
  const rotatedX = x * Math.cos(angle) - z * Math.sin(angle);
  const rotatedZ = x * Math.sin(angle) + z * Math.cos(angle);
  x = rotatedX + layer * .28;
  // Keep the carrier centred on the viewport at every resolution. A fixed
  // negative Y offset is magnified by screenScale and visibly pushes the
  // whole cloud down on a 1920×1080 exhibit display.
  z = rotatedZ - layer * .38;

  const depth = Math.max(3.7, 5.1 - z);
  const screenScale = Math.max(150, height * .44) * 2.34 / depth;
  const breathing = 1 + Math.sin(time * .19 + particle.phase) * .018;
  const edgeX = 1 - smoothRange(.78, 1, Math.abs(u));
  const edgeY = 1 - smoothRange(.82, 1, Math.abs(v));
  const holes = .24 + .76 * smoothRange(-.72, .52,
    Math.sin(v * 6.8 + u * 4.2 + time * .15) + .35 * Math.sin(u * 11 - v * 3));
  particle.flowOpacity = edgeX * edgeY * holes;
  return vec3(
    x * screenScale * breathing,
    y * screenScale * breathing,
    z * screenScale * .72
  );
}

function applyEmberInteraction(carrier, particle) {
  let pullX = 0;
  let pullY = 0;
  let weightSum = 0;
  let rippleLight = 0;

  emberInteraction.slots.forEach((slot) => {
    if (slot.strength < .001) return;
    const dx = carrier.x - slot.x;
    const dy = carrier.y - slot.y;
    const radius = EMBER_FLOW.pointerRadius * (.92 + slot.strength * .46);
    const kernel = Math.exp(-(dx * dx + dy * dy) / (radius * radius));
    const weight = slot.strength * kernel;
    const speed = Math.max(1, Math.hypot(slot.vx, slot.vy));
    const velocityScale = Math.min(1, 1450 / speed);
    const vx = slot.vx * velocityScale;
    const vy = slot.vy * velocityScale;
    const turn = Math.max(-2, Math.min(2, (vx * dy - vy * dx) / Math.max(1, radius * radius)));
    pullX += weight * (-dx + .034 * vx - turn * dy * .075);
    pullY += weight * (-dy + .034 * vy + turn * dx * .075);
    weightSum += weight;
  });

  const divisor = Math.max(1, weightSum / .78);
  const result = vec3(carrier.x + pullX / divisor, carrier.y + pullY / divisor, carrier.z);

  emberInteraction.ripples.forEach((ripple) => {
    const age = emberInteraction.time - ripple.born;
    if (ripple.power <= 0 || age < 0 || age >= EMBER_FLOW.rippleDuration) return;
    const dx = result.x - ripple.x;
    const dy = result.y - ripple.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const front = (distance - 42 - age * EMBER_FLOW.rippleSpeed) / EMBER_FLOW.rippleWidth;
    const ring = Math.exp(-front * front) * Math.exp(-age * 2.7) * ripple.power;
    result.x += dx / distance * ring * 46;
    result.y += dy / distance * ring * 46;
    rippleLight += ring;
  });

  particle.flowExcitation = Math.min(1, weightSum * .42 + rippleLight * .55);
  result.z += particle.flowExcitation * 26 * Math.sin(particle.phase + emberInteraction.time * 2);
  return result;
}

function prepareResultFlow(now) {
  particles.forEach((particle, index) => {
    if (particle.flowU === undefined) return;
    particle.flowDisplacement = vec3();
    particle.flowVelocity = vec3();
    particle.flowLayer = index % Math.max(1, selected.length);
  });
}

function emberNoise(seed, axis) {
  return (hashNoise(seed * 1.371 + emberStep * (axis + 1) * .754877666) * 2 - 1) * 1.7320508;
}

function getLivingActivation(particle) {
  const settings = config.visual.livingCloud;
  const age = performance.now() - (particle.birthTime || 0);
  return smoothstep((age - settings.settleDelay) / settings.settleDuration);
}

function moveSettlingParticle(particle, dt, time) {
  const settings = config.visual.livingCloud;
  const rel = sub(particle.position, center);
  const distance = Math.max(1, length(rel));
  const drift = vec3(
    Math.sin(time * .42 + particle.seed) * .005,
    Math.cos(time * .36 + particle.phase) * .005,
    Math.sin(time * .31 + particle.seed) * .004
  );
  const swirl = normalize(vec3(-rel.y, rel.x, Math.sin(time + particle.phase) * 42));

  addScaledTo(particle.velocity, drift, dt);
  addScaledTo(particle.velocity, swirl, .0025 * dt);

  const cloudRadius = config.visual.idleCloudRadius * .82;
  if (distance > cloudRadius) {
    addScaledTo(particle.velocity, normalize(rel), -((distance - cloudRadius) / cloudRadius) * .42 * dt);
  }

  scaleTo(particle.velocity, settings.settleDamping);
  const breathe = .5 + .5 * Math.sin(time * 1.2 + particle.phase);
  particle.alpha = Math.min(.94, Math.max(.40, particle.alpha + (breathe - .5) * .003 * dt));
  lerpColor(particle.color, particle.baseColor, .018 * dt);
}

function updateLivingCloud(time, now) {
  if (!selected.length || finalMode || resultMode || !config.visual.livingCloud.enabled) return;
  ensureLivingCloudStarted(now);
  if (now >= livingCloud.nextChange) {
    const settings = config.visual.livingCloud;
    livingCloud.currentShape = livingCloud.nextShape;
    livingCloud.nextShape = randomLivingShape(livingCloud.currentShape);
    livingCloud.transitionStart = now;
    livingCloud.nextChange = now + settings.shapeChangeInterval + Math.random() * settings.shapeChangeInterval * .35;
  }
}

function ensureLivingCloudStarted(now) {
  const settings = config.visual.livingCloud;
  if (!livingCloud.nextChange) {
    livingCloud.transitionStart = now;
    livingCloud.nextChange = now + settings.shapeChangeInterval;
    livingCloud.currentShape = randomLivingShape();
    livingCloud.nextShape = randomLivingShape(livingCloud.currentShape);
  }
}

function moveLivingParticle(particle, dt, time, activation = 1) {
  const settings = config.visual.livingCloud;
  const target = livingParticleTarget(particle, time);

  const rel = sub(particle.position, center);
  const distance = Math.max(1, length(rel));
  const toTarget = sub(target, particle.position);
  const swirl = normalize(vec3(
    -rel.y + Math.sin(time * 1.7 + particle.seed) * settings.waveAmplitude,
    rel.x + Math.cos(time * 1.3 + particle.phase) * settings.waveAmplitude * .7,
    Math.sin(time * 2 + particle.phase) * 80
  ));

  addScaledTo(particle.velocity, toTarget, settings.attraction * activation * dt);
  addScaledTo(particle.velocity, swirl, settings.turbulence * activation * dt);
  particle.velocity.x += Math.sin(time * settings.waveSpeed + particle.seed) * .010 * activation * dt;
  particle.velocity.y += Math.cos(time * settings.waveSpeed * .8 + particle.phase) * .010 * activation * dt;
  particle.velocity.z += Math.sin(time * settings.waveSpeed * 1.4 + particle.seed) * .012 * activation * dt;

  const cloudRadius = config.visual.idleCloudRadius;
  if (distance > cloudRadius) {
    addScaledTo(particle.velocity, normalize(rel), -((distance - cloudRadius) / cloudRadius) * 1.18 * dt);
  }

  const breathe = .5 + .5 * Math.sin(time * 1.8 + particle.phase);
  particle.alpha = Math.min(.98, Math.max(.42, particle.alpha + (breathe - .48) * .006 * dt));
  lerpColor(particle.color, particle.baseColor, .026 * dt);
}

function livingParticleTarget(particle, time) {
  const settings = config.visual.livingCloud;
  const now = performance.now();
  const morphProgress = smoothstep((now - livingCloud.transitionStart) / settings.morphDuration);
  const targetA = livingShapeTarget(livingCloud.currentShape, particle, time, settings);
  const targetB = livingShapeTarget(livingCloud.nextShape, particle, time, settings);
  const target = mixVec(targetA, targetB, morphProgress);
  addTo(target, livingDrift(time));
  return target;
}

function moveWindParticle(particle, dt, time, now) {
  const wind = config.visual.finalWind;
  const age = Math.max(0, (now - resultStartTime) * .001);
  const rel = sub(particle.position, center);
  const distance = Math.max(1, length(rel));
  const wave = Math.sin(rel.x * wind.waveFrequency + age * 2.7 + particle.phase);
  const crossWave = Math.cos(rel.z * wind.waveFrequency * 1.35 + age * 2.1 + particle.seed);
  const gust = (.45 + .55 * Math.sin(age * 1.2 + particle.seed) ** 2) * wind.strength;
  const swirl = vec3(-rel.y * .0018, rel.x * .0018, Math.sin(age * 1.5 + particle.phase) * .12);
  const windPush = vec3(
    wind.flowSpeed * gust * Math.sin(age * .8 + particle.seed),
    wave * wind.waveAmplitude * .0019,
    crossWave * wind.waveAmplitude * .0024
  );
  addScaledTo(particle.velocity, windPush, dt);
  addScaledTo(particle.velocity, swirl, dt);

  const ribbonY = center.y + wave * wind.waveAmplitude * .55 + Math.sin(age * 1.4 + particle.seed) * 22;
  particle.velocity.y += (ribbonY - particle.position.y) * .0016 * dt;
  particle.velocity.z += (Math.sin(age * 1.8 + particle.phase) * 150 - particle.position.z) * .0008 * dt;

  const spread = Math.max(120, wind.spreadRadius);
  if (distance > spread) {
    addScaledTo(particle.velocity, normalize(rel), -((distance - spread) / spread) * .48 * dt);
  }

  lerpColor(particle.color, finalColorRgb, .035 * dt);
  particle.alpha = Math.min(.95, Math.max(.32, particle.alpha + Math.sin(age * 2 + particle.seed) * .002));
}

function alchemyDropletTarget(particle) {
  const vertical = Math.max(-.98, Math.min(.98, particle.flowV));
  const randomRadius = (particle.seed * .754877666 + particle.phase * .159154943) % 1;
  const randomAngle = (particle.seed * .569840296 + particle.phase * .438289) % 1;
  const radius = Math.max(42, config.visual.mixing.clusterRadius);
  const shell = Math.sqrt(Math.max(0, 1 - vertical * vertical));
  const fill = Math.sqrt(randomRadius);
  const taper = 1.08 + (.78 - 1.08) * smoothstep(vertical * .5 + .5);
  const crossRadius = radius * shell * fill * taper;
  const angle = Math.PI * 2 * randomAngle + particle.flowU * .72;
  return vec3(
    Math.cos(angle) * crossRadius,
    vertical * radius * 1.38,
    Math.sin(angle) * crossRadius * .72
  );
}

function alchemyMixTarget(particle, progress) {
  const mix = config.visual.mixing;
  const elapsed = progress * config.mixingDuration * .001;
  const layer = Math.floor(((particle.flowLayer % 3) + 3) % 3 + .5);
  const groupAngle = sceneRoll + layer * Math.PI * 2 / 3;
  const along = Math.max(0, Math.min(1, particle.flowV * .5 + .5));
  const scale = Math.max(220, Math.min(width, height) * .45);

  const entryEnergy = smoothRange(.04, .27, progress);
  const entrySpin = elapsed * (.18 + .72 * entryEnergy);
  const sinAlong = Math.sin(along * Math.PI);
  const entryAngle = groupAngle + entrySpin + .62 * sinAlong;
  const entryRadius = (scale * 1.12 + (scale * .24 - scale * 1.12) * along)
    * (1 + (.82 - 1) * entryEnergy);
  const ribbonWidth = particle.flowU * scale * .082 * (.58 + .42 * sinAlong);
  const directionX = Math.cos(entryAngle);
  const directionY = Math.sin(entryAngle);
  const entry = vec3(
    directionX * entryRadius - directionY * ribbonWidth,
    (directionY * entryRadius + directionX * ribbonWidth) * .76,
    (particle.flowU * .40 + Math.sin(along * Math.PI * 2 + groupAngle) * .22) * scale * .58
  );

  const braidEnergy = smoothRange(.18, .72, progress);
  const peakRate = Math.max(1.55, Math.min(2.65, mix.speedPeak * .32));
  const spinRate = Math.max(.38, mix.speedStart)
    + (peakRate - Math.max(.38, mix.speedStart)) * smoothstep(braidEnergy);
  const spin = elapsed * spinRate + braidEnergy * braidEnergy * .34;
  const exchange = smoothRange(.56, .79, progress);
  const strandPhase = groupAngle + particle.flowV * 2.55 + spin;
  const strandRadius = scale * (.46 + (.27 - .46) * exchange);
  const strandWidth = particle.flowU * scale * .072
    * (.76 + .24 * Math.cos(strandPhase * 2 + particle.phase));
  const axial = particle.flowV * scale * .55 * (1 - exchange * .34);
  const strandCos = Math.cos(strandPhase);
  const strandSin = Math.sin(strandPhase);
  let braidX = strandCos * (strandRadius + strandWidth);
  let braidY = axial + strandSin * strandRadius * .38 + strandCos * strandWidth * .44;
  let braidZ = strandSin * (strandRadius * .78 + strandWidth)
    + strandCos * particle.flowU * scale * .034;
  const roll = .16 * Math.sin(sceneRoll);
  const rotatedX = braidX * Math.cos(roll) - braidY * Math.sin(roll);
  const rotatedY = braidX * Math.sin(roll) + braidY * Math.cos(roll);
  braidX = rotatedX;
  braidY = rotatedY;
  const gyreA = braidY / scale * 3.2 + spin * .34;
  const gyreB = braidX / scale * 2.7 - spin * .21;
  braidX += Math.sin(gyreA) * Math.cos(gyreB) * exchange * scale * .11;
  braidY += -Math.cos(gyreA) * Math.sin(gyreB) * exchange * scale * .11;
  braidZ += exchange * Math.sin((braidX + braidY) / scale * 4 + spin) * scale * .075;
  const braid = vec3(braidX, braidY, braidZ);

  let choreography = mixVec(entry, braid, smoothRange(.18, .36, progress));
  const collapseStart = Math.max(.64, Math.min(.82, mix.collapseStart));
  const collapse = smoothRange(collapseStart, .94, progress);
  const breathPhase = smoothRange(.90, 1, progress);
  const breath = 1 + Math.sin(breathPhase * Math.PI) * .10;
  const droplet = mul(alchemyDropletTarget(particle), breath);
  choreography = mixVec(choreography, droplet, collapse);
  return mixVec(particle.mixStartPosition || particle.position, choreography, smoothRange(.01, .14, progress));
}

function moveMixingParticle(particle, progress, dt) {
  const target = alchemyMixTarget(particle, progress);
  const follow = progress > .965
    ? 1
    : 1 - Math.exp(-(5 + progress * 8) * Math.min(.05, Math.max(0, dt / 60)));
  particle.position = mixVec(particle.position, target, follow);
  particle.velocity = vec3();
  const colorMix = smoothRange(.54, .92, progress);
  particle.color.r = particle.baseColor.r + (finalColorRgb.r - particle.baseColor.r) * colorMix;
  particle.color.g = particle.baseColor.g + (finalColorRgb.g - particle.baseColor.g) * colorMix;
  particle.color.b = particle.baseColor.b + (finalColorRgb.b - particle.baseColor.b) * colorMix;
  particle.alpha = Math.min(1, particle.alpha + .006 * dt);
}

function resetLivingCloud() {
  livingCloud.currentShape = "sphere";
  livingCloud.nextShape = "wave";
  livingCloud.transitionStart = 0;
  livingCloud.nextChange = 0;
}

function randomLivingShape(except) {
  const options = livingCloud.shapes.filter((shape) => shape !== except);
  return options[Math.floor(Math.random() * options.length)] || "sphere";
}

function livingDrift(time) {
  const settings = config.visual.livingCloud;
  const radius = settings.driftRadius;
  return vec3(
    Math.sin(time * .17 + sceneRoll) * radius,
    Math.cos(time * .13 + sceneRoll * .7) * radius * .55,
    Math.sin(time * .11 + sceneRoll * 1.3) * radius * .45
  );
}

function livingShapeTarget(shape, particle, time, settings) {
  const radius = Math.min(settings.shapeRadius, config.visual.idleCloudRadius * .86);
  const angle = particle.seed * 12.9898 + particle.phase + time * settings.waveSpeed * .45;
  const lane = Math.sin(particle.seed * 78.233);
  const depth = Math.cos(particle.seed * 37.719);
  const wave = Math.sin(time * settings.waveSpeed * 2.2 + particle.phase + lane * 4);

  if (shape === "ring") {
    const ringRadius = radius * (.42 + Math.abs(lane) * .42);
    return add(center, vec3(
      Math.cos(angle) * ringRadius,
      Math.sin(angle) * ringRadius * .42 + wave * settings.waveAmplitude * .34,
      depth * radius * .34 + Math.sin(angle * 2 + time) * 46
    ));
  }

  if (shape === "wave") {
    const x = lane * radius * 1.08;
    const z = depth * radius * .48;
    return add(center, vec3(
      x,
      Math.sin(x * .018 + time * settings.waveSpeed * 2.5 + particle.phase) * settings.waveAmplitude,
      z + Math.cos(time * 1.4 + particle.seed) * 58
    ));
  }

  if (shape === "spiral") {
    const spiralRadius = radius * (.12 + Math.abs(lane) * .78);
    const spiralAngle = angle + Math.abs(lane) * Math.PI * 3 + time * settings.waveSpeed;
    return add(center, vec3(
      Math.cos(spiralAngle) * spiralRadius,
      lane * radius * .48 + Math.sin(time * 2 + particle.phase) * 34,
      Math.sin(spiralAngle) * spiralRadius * .62
    ));
  }

  if (shape === "hourglass") {
    const y = lane * radius * .76;
    const waist = .18 + Math.abs(y / radius) * .76;
    const hourAngle = angle + time * settings.waveSpeed * .7;
    return add(center, vec3(
      Math.cos(hourAngle) * radius * waist * .56,
      y + wave * settings.waveAmplitude * .18,
      Math.sin(hourAngle) * radius * waist * .40
    ));
  }

  if (shape === "bloom") {
    const petals = 5 + Math.floor(Math.abs(depth) * 4);
    const petal = .58 + .42 * Math.sin(angle * petals + time * settings.waveSpeed * 2);
    const bloomRadius = radius * (.18 + Math.abs(lane) * .82) * petal;
    return add(center, vec3(
      Math.cos(angle) * bloomRadius,
      Math.sin(angle) * bloomRadius * .58 + wave * settings.waveAmplitude * .25,
      depth * radius * .32 + Math.sin(angle * petals) * 42
    ));
  }

  const sphereRadius = radius * (.20 + Math.abs(lane) * .72);
  const theta = angle;
  const phi = Math.acos(Math.max(-1, Math.min(1, depth)));
  return add(center, vec3(
    Math.cos(theta) * Math.sin(phi) * sphereRadius,
    Math.sin(theta) * Math.sin(phi) * sphereRadius * .70 + wave * settings.waveAmplitude * .20,
    Math.cos(phi) * sphereRadius * .58
  ));
}

function drawScene(time, now, deltaSeconds = 0) {
  if (gpuRenderer) {
    const mixProgress = finalMode
      ? Math.min(1, (now - mixStartTime) / Math.max(1, config.mixingDuration))
      : (resultMode ? 1 : 0);
    const living = selected.length > 0 && !finalMode && !resultMode && config.visual.livingCloud.enabled;
    gpuRenderer.draw({
      width,
      height,
      time,
      nowSeconds: now * .001,
      deltaSeconds,
      mode: finalMode ? 1 : (resultMode ? 2 : 0),
      mixProgress,
      mixElapsed: finalMode ? Math.max(0, (now - mixStartTime) * .001) : config.mixingDuration * .001,
      mixDuration: config.mixingDuration * .001,
      resultAge: resultMode ? Math.max(0, (now - resultStartTime) * .001) : 0,
      finalColor: finalColorRgb,
      mix: config.visual.mixing,
      sceneRoll,
      hasDrag: Boolean(drag),
      dragPoint: drag?.world || center,
      pointers: emberInteraction.pointers,
      velocities: emberInteraction.velocities,
      waves: emberInteraction.waves,
      auraVisible,
      visual: {
        particleSizeScale: config.visual.particleSizeScale,
        baseGlowSize: config.visual.baseGlowSize,
        mixGlowSize: config.visual.mixGlowSize,
        brightness: drag ? Math.max(1.45, config.visual.livingCloud.glowBoost) : (living ? config.visual.livingCloud.glowBoost : 1)
      }
    });
    return;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";

  if (auraVisible || resultMode) drawAura(time, now);
  if (config.visual.showOrbitLines && finalMode) drawOrbitHints(time, now);

  context.globalCompositeOperation = "lighter";
  drawParticles(time, true);
  drawParticles(time, false);
  context.globalCompositeOperation = "source-over";
}

function drawAura(time, now) {
  const progress = finalMode ? Math.min(1, (now - mixStartTime) / Math.max(1, config.mixingDuration)) : 1;
  const resultT = resultMode ? Math.min(1, Math.max(0, (now - resultStartTime) / 1750)) : 0;
  const resultFade = smoothstep(resultT);
  const phaseStrength = finalMode
    ? .38 + progress * .52
    : (resultMode ? .90 + (.34 - .90) * resultFade : .34);
  const auraStrength = phaseStrength * (.42 + .05 * Math.sin(time * 1.6));
  const point = worldToScreen(center);
  const radius = 230 + progress * 180 + Math.sin(time * 3.1) * 18;
  const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  gradient.addColorStop(0, rgba(finalColorRgb, Math.min(.38, auraStrength * .88)));
  gradient.addColorStop(.32, rgba(finalColorRgb, Math.min(.16, auraStrength * .31)));
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.globalCompositeOperation = "lighter";
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawOrbitHints(time, now) {
  if (!selected.length) return;
  const progress = finalMode ? Math.min(1, (now - mixStartTime) / Math.max(1, config.mixingDuration)) : 0;
  selected.forEach((ingredient, index) => {
    const radius = config.visual.mixing.orbitBaseRadius + index * config.visual.mixing.orbitRadiusStep;
    const color = hexToRgb(ingredient.color || "#f7d88d");
    context.strokeStyle = rgba(color, .12 + progress * .16);
    context.lineWidth = 1;
    context.save();
    const point = worldToScreen(center);
    context.translate(point.x, point.y);
    context.rotate(sceneRoll + index * 1.8 + time * .12);
    context.scale(1, .42 + index * .1);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  });
}

function drawParticles(time, glowPass) {
  const scale = config.visual.particleSizeScale;
  const baseCore = (finalMode ? config.visual.mixParticleSize : config.visual.baseParticleSize) * scale;
  const baseGlow = (finalMode || resultMode ? config.visual.mixGlowSize : config.visual.baseGlowSize) * scale;
  const living = selected.length > 0 && !finalMode && !resultMode && config.visual.livingCloud.enabled;
  const brightness = finalMode || resultMode ? 1.55 : (drag ? Math.max(1.45, config.visual.livingCloud.glowBoost) : (living ? config.visual.livingCloud.glowBoost : 1));

  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    if (glowPass && living && (particle.seed % 1) > config.visual.livingCloud.glowRenderRatio) continue;
    const projected = worldToScreen(particle.position);
    if (projected.x < -80 || projected.x > width + 80 || projected.y < -80 || projected.y > height + 80) continue;

    const depth = Math.max(.62, Math.min(1.42, 1 + particle.position.z * .0008));
    const excitation = particle.flowExcitation || 0;
    const pulse = (living ? 1 + Math.sin(time * 2 + particle.phase) * .24 : 1) * (1 + excitation * .28);
    const dustScale = living ? (glowPass ? .84 : .52) : 1;
    const radius = Math.max(glowPass ? .85 : .34, (glowPass ? baseGlow : baseCore) * depth * (particle.size / 10) * pulse * dustScale);
    const alpha = Math.max(0, Math.min(1, particle.alpha * (glowPass ? .20 : .98) * brightness * (1 + excitation * .38)));
    const color = particle.color;

    drawParticleSprite(projected.x, projected.y, radius, color, alpha, glowPass);
  }
}

function drawParticleSprite(x, y, radius, color, alpha, glowPass) {
  const sprite = getParticleSprite(color, radius, glowPass);
  context.globalAlpha = alpha;
  context.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
  context.globalAlpha = 1;
}

function getParticleSprite(color, radius, glowPass) {
  const bucket = Math.max(1, config.visual.livingCloud.spriteBucketSize || 2);
  const size = Math.max(2, Math.ceil(radius / bucket) * bucket);
  const key = `${glowPass ? "g" : "c"}-${Math.round(color.r)}-${Math.round(color.g)}-${Math.round(color.b)}-${size}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const padding = glowPass ? 2 : 1;
  const diameter = Math.max(2, Math.ceil(size * 2 + padding * 2));
  const sprite = document.createElement("canvas");
  sprite.width = diameter;
  sprite.height = diameter;
  const spriteContext = sprite.getContext("2d");
  const cx = diameter / 2;
  const gradient = spriteContext.createRadialGradient(cx, cx, 0, cx, cx, size);
  if (glowPass) {
    gradient.addColorStop(0, "rgba(255,255,255,.95)");
    gradient.addColorStop(.22, rgba(color, .88));
    gradient.addColorStop(.58, rgba(color, .24));
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(.32, rgba(color, .98));
    gradient.addColorStop(1, rgba(color, .08));
  }
  spriteContext.fillStyle = gradient;
  spriteContext.beginPath();
  spriteContext.arc(cx, cx, size, 0, Math.PI * 2);
  spriteContext.fill();

  spriteCache.set(key, sprite);
  if (spriteCache.size > 420) {
    const firstKey = spriteCache.keys().next().value;
    spriteCache.delete(firstKey);
  }
  return sprite;
}

function smoothstep(value) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

function smoothRange(edge0, edge1, value) {
  return smoothstep((value - edge0) / Math.max(.0001, edge1 - edge0));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function hashNoise(value) {
  const raw = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return raw - Math.floor(raw);
}

function projectOrbit(angle, radius, roll, tilt) {
  return projectOrbitAround(center, angle, radius, roll, tilt);
}

function projectOrbitAround(origin, angle, radius, roll, tilt) {
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius * Math.cos(tilt);
  const z = Math.sin(angle) * radius * Math.sin(tilt);
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  return vec3(
    origin.x + x * cos - y * sin,
    origin.y + x * sin * .72 + y * cos * .72 + z * .32,
    origin.z + z + Math.sin(angle + roll) * 18
  );
}

function setAuraVisible(visible) {
  auraVisible = visible;
}

function resizeCanvas() {
  const nextWidth = innerWidth;
  const nextHeight = innerHeight;
  const nextRatio = fallbackPerformanceProfile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  if (nextWidth === width && nextHeight === height && nextRatio === pixelRatio) return;
  width = nextWidth;
  height = nextHeight;
  pixelRatio = nextRatio;
  if (gpuRenderer) {
    gpuRenderer.resize(width, height);
    return;
  }
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function screenToWorld(clientX, clientY) {
  return vec3(clientX - width / 2, height / 2 - clientY, 0);
}

function worldToScreen(point) {
  const depth = 1 + point.z * .00016;
  return {
    x: width / 2 + point.x * depth,
    y: height / 2 - point.y * depth + point.z * .035
  };
}

function randomInCloud(minRadius, maxRadius) {
  const direction = randomUnitVector();
  const radius = minRadius + Math.random() * (maxRadius - minRadius);
  direction.x *= 1.18;
  direction.y *= .82;
  direction.z *= .72;
  return mul(direction, radius);
}

function randomUnitVector() {
  const theta = Math.random() * Math.PI * 2;
  const z = Math.random() * 2 - 1;
  const r = Math.sqrt(1 - z * z);
  return vec3(Math.cos(theta) * r, Math.sin(theta) * r, z);
}

function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

function add(a, b) {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a, b) {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mul(value, scalar) {
  return vec3(value.x * scalar, value.y * scalar, value.z * scalar);
}

function mixVec(a, b, amount) {
  const t = Math.min(1, Math.max(0, amount));
  return vec3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
}

function addTo(target, value) {
  target.x += value.x;
  target.y += value.y;
  target.z += value.z;
}

function addScaledTo(target, value, scalar) {
  target.x += value.x * scalar;
  target.y += value.y * scalar;
  target.z += value.z * scalar;
}

function scaleTo(target, scalar) {
  target.x *= scalar;
  target.y *= scalar;
  target.z *= scalar;
}

function length(value) {
  return Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
}

function normalize(value) {
  const size = Math.max(.0001, length(value));
  return vec3(value.x / size, value.y / size, value.z / size);
}

function lerpColor(color, target, amount) {
  const t = Math.min(1, Math.max(0, amount));
  color.r += (target.r - color.r) * t;
  color.g += (target.g - color.g) * t;
  color.b += (target.b - color.b) * t;
}

function hexToRgb(hex) {
  const clean = String(hex).replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbString(color) {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

function rgba(color, alpha) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

function mixColors(colors) {
  const mixed = colors.map(hexToRgb).reduce((acc, color) => ({
    r: acc.r + color.r,
    g: acc.g + color.g,
    b: acc.b + color.b
  }), { r: 0, g: 0, b: 0 });
  const total = Math.max(1, colors.length);
  return rgbToHex(Math.round(mixed.r / total), Math.round(mixed.g / total), Math.round(mixed.b / total));
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
