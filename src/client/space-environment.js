import { createSpaceParticles } from './space-particles.js';
import { createFlightDrift } from './flight-drift.js';
import { createSpaceBackground } from './space-background.js';

export const SPACE_STORAGE_KEY = 'dsc.space.environment.v1';
const DEFAULT_VIEW = Object.freeze({ yaw: 0, pitch: 0, distance: 1 });
const DEFAULT_STATE = Object.freeze({ mode: 'cruise', speed: 'slow', skyQuality: 'photo', ...DEFAULT_VIEW });
export const SPEED_MARKS = Object.freeze({ slow: 0.12, fast: 0.56, warp: 1 });
const SPEEDS = Object.freeze({
  slow: { label: '缓慢', velocity: 0.8, panoramaRate: 1, trail: 0, brightness: 1, warp:0 },
  fast: { label: '快速', velocity: 7, panoramaRate: 7, trail: 3.5, brightness: 1.15, warp:0 },
  warp: { label: '极快', velocity: 36, panoramaRate: 13, trail: 52, brightness: 1.8, warp:1 },
});
export function approachFlight(current,target,seconds) {
  const amount=1-Math.exp(-Math.max(0,seconds)/.8);
  return Object.fromEntries(['velocity','panoramaRate','trail','brightness','warp'].map(key=>[key,current[key]+(target[key]-current[key])*amount]));
}
const normalizeSpeed = speed => speed === 'fast' || speed === 'warp' ? speed : 'slow';
export const speedForThrottle = value => value >= .8 ? 'warp' : value >= 1 / 3 ? 'fast' : 'slow';
export function profileForThrottle(value) {
  const throttle = Math.max(0, Math.min(1, Number(value) || 0));
  const anchors = [[0, { ...SPEEDS.slow, velocity: .12, panoramaRate: .25 }],
    [SPEED_MARKS.slow, SPEEDS.slow], [SPEED_MARKS.fast, SPEEDS.fast],
    [.8, { ...SPEEDS.fast, velocity: 16, panoramaRate: 10, trail: 12 }], [1, SPEEDS.warp]];
  const upper = anchors.findIndex(([position]) => position >= throttle);
  if (upper <= 0) return { ...anchors[0][1] };
  const [start, a] = anchors[upper - 1], [end, b] = anchors[upper];
  const t = (throttle - start) / (end - start);
  return Object.fromEntries(['velocity', 'panoramaRate', 'trail', 'brightness', 'warp']
    .map(key => [key, a[key] + (b[key] - a[key]) * t]));
}
const PARKED = Object.freeze({velocity:0,panoramaRate:0,trail:0,brightness:1,warp:0});
const radians = degrees => degrees * Math.PI / 180;
const bounded = (value, fallback, min, max) => Number.isFinite(value)
  ? Math.max(min, Math.min(max, value)) : fallback;

export function clampView(view = {}, previous = DEFAULT_VIEW) {
  return {
    yaw: bounded(view?.yaw, previous.yaw, -60, 60),
    pitch: bounded(view?.pitch, previous.pitch, -60, 60),
    distance: bounded(view?.distance, previous.distance, 0.7, 1.6),
  };
}

export function readEnvironmentState(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(SPACE_STORAGE_KEY) ?? 'null');
    const throttle = bounded(saved?.throttle, SPEED_MARKS[normalizeSpeed(saved?.speed)], 0, 1);
    return { mode: saved?.mode === 'docked' ? 'docked' : 'cruise', speed: speedForThrottle(throttle), throttle,
      skyQuality: saved?.skyQuality === 'art' ? 'art' : 'photo',
      ...clampView(saved), ...(typeof saved?.sceneId === 'string' ? { sceneId: saved.sceneId } : {}) };
  } catch {
    return { ...DEFAULT_STATE, throttle: SPEED_MARKS.slow };
  }
}

export function writeEnvironmentState(storage, state) {
  try {
    storage?.setItem(SPACE_STORAGE_KEY, JSON.stringify({
      mode: state.mode === 'docked' ? 'docked' : 'cruise', speed: normalizeSpeed(state.speed),
      skyQuality: state.skyQuality === 'art' ? 'art' : 'photo',
      throttle: bounded(state.throttle, SPEED_MARKS[normalizeSpeed(state.speed)], 0, 1), ...clampView(state),
      ...(typeof state.sceneId === 'string' ? { sceneId: state.sceneId } : {}),
    }));
  } catch {
    // Storage can be disabled by the host, or full; camera controls still work.
  }
}

/** World-space perspective: +Y is up, +Z is forward, angles are degrees. */
export function projectPoint(point, view = DEFAULT_VIEW, width = 1, height = 1) {
  const camera = clampView(view);
  const yaw = radians(camera.yaw);
  const pitch = radians(camera.pitch);
  const z = point.z + (camera.distance - 1) * 8;
  const rotatedX = point.x * Math.cos(yaw) - z * Math.sin(yaw);
  const rotatedZ = point.x * Math.sin(yaw) + z * Math.cos(yaw);
  const rotatedY = point.y * Math.cos(pitch) - rotatedZ * Math.sin(pitch);
  const depth = point.y * Math.sin(pitch) + rotatedZ * Math.cos(pitch);
  if (depth <= 0.15) return null;
  const scale = height / (2 * Math.tan(radians(32.5))) / depth;
  return { x: width / 2 + rotatedX * scale, y: height / 2 - rotatedY * scale, depth, scale };
}

/** Four percent overscan contains the entire bounded drift without an extra zoom. */
export function getPanoramaTransform(drift = {}) {
  return {
    x: bounded(drift.x, 0, -3, 3), y: bounded(drift.y, 0, -3, 3), scale: 1,
  };
}

function randomSequence(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeStars() {
  const random = randomSequence(73204);
  return Array.from({ length: 600 }, () => {
    const angle = random() * Math.PI * 2;
    const y = random() * 2 - 1;
    const radius = 10 + random() * 95;
    const ring = Math.sqrt(1 - y * y);
    return {
      x: Math.sin(angle) * ring * radius,
      y: y * radius,
      z: Math.cos(angle) * ring * radius,
      radius: 0.018 + random() * 0.08,
      brightness: 0.3 + random() * 0.65,
      warm: random() > 0.8,
    };
  });
}

function makeWarpRays() {
  const random = randomSequence(105927);
  return Array.from({ length: 180 }, () => ({
    angle: random() * Math.PI * 2,
    spread: 4 + Math.pow(random(), 0.65) * 48,
    depth: random() * 114,
    length: 40 + random() * 38,
    strength: 0.45 + random() * 0.55,
  }));
}

function drawWarpRays(context, rays, view, width, height, travel,amount=1,project) {
  const aspect = Math.max(1, width / height);
  for (const ray of rays) {
    const depth = 6 + ((ray.depth - travel + 114) % 114 + 114) % 114;
    const position = { x: Math.cos(ray.angle) * ray.spread * aspect, y: Math.sin(ray.angle) * ray.spread, z: depth };
    const head = project ? project(position.x,position.y,depth) : projectPoint(position, view, width, height);
    const tail = project ? project(position.x,position.y,depth+ray.length) : projectPoint({ ...position, z: depth + ray.length }, view, width, height);
    if (!head || !tail || Math.max(head.x, tail.x) < 0 || Math.min(head.x, tail.x) > width
      || Math.max(head.y, tail.y) < 0 || Math.min(head.y, tail.y) > height) continue;
    // Fade each ray at its depth boundary before recycling, avoiding abrupt flashes.
    const alpha = ray.strength * Math.min(1, (depth - 6) / 9, (120 - depth) / 9);
    const light = context.createLinearGradient(tail.x, tail.y, head.x, head.y);
    light.addColorStop(0, 'rgba(69,132,255,0)');
    light.addColorStop(0.25, `rgba(80,152,255,${alpha * 0.25})`);
    light.addColorStop(0.75, `rgba(143,204,255,${alpha * 0.85})`);
    light.addColorStop(1, `rgba(229,248,255,${alpha})`);
    context.strokeStyle = light;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(tail.x, tail.y);
    context.lineTo(head.x, head.y);
    context.globalAlpha = 0.22*amount;
    context.lineWidth = 4 + ray.strength * 4;
    context.stroke();
    context.globalAlpha = amount;
    context.lineWidth = 0.9 + ray.strength * 1.3;
    context.stroke();
  }
  context.globalAlpha=1;
}

/** A single rAF animation clock, with camera input on a separate cheap presentation path. */
export function createSpaceEnvironment(container, {
  backgroundUrl = './resource/nebula.jpg', scenes = [], initialScene, storage, onChange, random = Math.random,
  preloadScene, renderer = 'auto', motionRandom = Math.random,
} = {}) {
  const document = container.ownerDocument, window = document.defaultView;
  if (storage === undefined) {
    try { storage = window.localStorage; } catch { storage = null; }
  }
  let state = readEnvironmentState(storage);
  const catalog = scenes.filter(scene => typeof scene?.id === 'string' && typeof scene?.url === 'string')
    .filter((scene, index, all) => all.findIndex(item => item.id === scene.id) === index);
  if (!catalog.length) catalog.push({ id: 'default', label: 'Deep Space', url: backgroundUrl });
  let sceneIndex = Math.max(0, catalog.findIndex(scene => scene.id === (initialScene || state.sceneId)));
  state.sceneId = catalog[sceneIndex].id;
  let flight = { ...(state.mode === 'cruise' ? profileForThrottle(state.throttle) : PARKED) };
  let disposed = false, frame = null, viewFrame = null, saveTimer = null;
  let lastFrame = null, travel = 0, width = 1, height = 1, pixelRatio = 1, focal = 1;
  const flightDrift = createFlightDrift({ random: motionRandom });
  let drift = { x: 0, y: 0 }, heading = { x: 0, y: 0 }, qualityRequest = 0, qualityPreparing = false, backgroundShown = false;
  let drag = null, pendingView = null, warpSeconds = 0, transition = null, awaitingScene = false;
  let sceneRequest = 0, activeLayer = sceneIndex, glow = null;
  const listeners = [], motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const stars = makeStars(), warpRays = makeWarpRays(), sceneLoads = new Map(), readyScenes = new Set();
  const node = (tag, className, text) => {
    const element = document.createElement(tag); element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const listen = (target, name, callback, options) => {
    target.addEventListener(name, callback, options);
    listeners.push(() => target.removeEventListener(name, callback, options));
  };
  const element = node('div', 'dsc-space-environment');
  element.setAttribute('aria-hidden', 'true');
  element.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0;background:#030810;';
  const panorama = node('div', 'dsc-space-panorama');
  panorama.style.cssText = 'position:absolute;inset:-4%;will-change:transform;';
  const sceneUrl = (scene, quality = state.skyQuality) => quality === 'art' && scene.artUrl ? scene.artUrl : scene.url;
  const sceneKey = (index, quality = state.skyQuality) => catalog[index].id + ':' + quality;
  // Keep decoded images cached, but only rasterize the active/incoming skies.
  // Four full-resolution hidden compositor surfaces otherwise compete with the
  // cockpit's raster tiles at 4K. URLs never change inside a warp animation frame.
  const layers = catalog.map((scene,index) => {
    const layer = node('div', 'dsc-space-nebula');
    const opacity=index===sceneIndex?'1':'0';
    layer.style.cssText = `position:absolute;inset:0;background-size:cover;background-repeat:no-repeat;background-position:50% 50%;opacity:${opacity};display:${index===sceneIndex?'block':'none'};will-change:opacity;`;
    layer.dataset.sceneId=scene.id;
    layer.style.backgroundImage=`url(${JSON.stringify(sceneUrl(scene))})`;
    layer.style.setProperty('--dsc-scene-opacity',opacity);
    panorama.append(layer); return layer;
  });
  const canvas = node('canvas', 'dsc-space-canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  const shade = node('div', 'dsc-space-shade');
  shade.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at 68% 38%,transparent 5%,rgba(2,7,14,.18) 70%,rgba(2,6,13,.48));';
  element.append(panorama, canvas, shade); container.append(element);
  const background = renderer === 'canvas' ? null : createSpaceBackground(document, {onUnavailable(){if(!disposed)draw();}});
  if(background) {
    element.insertBefore(background.canvas,canvas);
    // Pass source URLs once at initialization. Decode and pixel conversion happen
    // inside the worker, never synchronously in the frame that selects a scene.
    for(let index=0;index<catalog.length;index++)for(const quality of ['photo','art'])background.register(sceneKey(index,quality),sceneUrl(catalog[index],quality));
  }
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const setLayerOpacity=(layer,value)=>{layer.style.opacity=String(value);layer.style.setProperty('--dsc-scene-opacity',String(value));};
  const particles = renderer === 'canvas' ? null : createSpaceParticles(document, { stars, rays:warpRays, onAvailability(available) {
    if (disposed) return;
    canvas.hidden=available;element.dataset.renderer=available?'webgl2':'canvas2d';draw();
  } });
  if(particles){element.insertBefore(particles.canvas,shade);canvas.hidden=true;}
  element.dataset.renderer=particles?'webgl2':'canvas2d';

  const controls = node('section', 'dsc-space-controls');
  controls.setAttribute('aria-label', '太空环境控制');
  const modeGroup = node('div', 'dsc-space-mode');
  modeGroup.setAttribute('role', 'group'); modeGroup.setAttribute('aria-label', '航行模式');
  const docked = node('button', 'dsc-space-mode-button', '停泊');
  const cruise = node('button', 'dsc-space-mode-button', '巡航');
  docked.type = cruise.type = 'button'; docked.dataset.mode = 'docked'; cruise.dataset.mode = 'cruise';
  modeGroup.append(docked, cruise);
  const speedGroup = node('label', 'dsc-space-speeds');
  const speedCaption = node('span', 'dsc-speed-caption');
  const speedValue = node('output', 'dsc-speed-value');
  speedCaption.append(node('span', '', '航行速度'), speedValue);
  const throttle = node('input', 'dsc-speed-slider');
  throttle.type = 'range'; throttle.min = '0'; throttle.max = '1'; throttle.step = '0.001';
  throttle.setAttribute('aria-label', '航行速度');
  const speedMarks = node('span', 'dsc-speed-marks');
  for (const [speed, profile] of Object.entries(SPEEDS)) {
    const mark = node('span', '', profile.label); mark.dataset.speedMark = speed; speedMarks.append(mark);
  }
  speedGroup.append(speedCaption, throttle, speedMarks);
  const qualityLabel = node('label', 'dsc-sky-quality');
  qualityLabel.append(node('span', '', '舷窗影像'));
  const qualitySelect = node('select', 'dsc-sky-quality-select');
  qualitySelect.setAttribute('aria-label', '舷窗影像');
  for (const [value, text] of [['photo', '高清实景 · 天文原片'], ['art', '艺术全景 · 合成星域']]) {
    const option = node('option', '', text); option.value = value; qualitySelect.append(option);
  }
  qualityLabel.append(qualitySelect);
  qualityLabel.hidden = !catalog.some(scene => scene.artUrl);
  const viewTools = node('div', 'dsc-view-tools');
  const lookPad = node('button', 'dsc-look-pad', '转头');
  lookPad.type = 'button';
  lookPad.setAttribute('aria-label', '拖动观察整个船舱；滚轮调整观察距离，方向键转头，加减键调整距离，Home 键复位');
  lookPad.title = '按住拖动转头 · 滚轮拉近或拉远 · 方向键 / + − / Home';
  lookPad.style.touchAction = 'none';
  const readout = node('output', 'dsc-space-readout'); readout.setAttribute('aria-label', '当前视角');
  const distanceValue = node('output', 'dsc-distance-value'); distanceValue.setAttribute('aria-label', '观察距离');
  const distanceHint = node('span', 'dsc-distance-hint', '滚轮调整远近');
  distanceValue.title = '整个船舱的观察距离，包含驾驶台与舷窗';
  viewTools.append(lookPad, readout, distanceValue, distanceHint);
  const footer = node('div', 'dsc-space-controls-footer');
  const modeStatus = node('span', 'dsc-space-mode-status'); modeStatus.setAttribute('aria-live', 'polite');
  const resetButton = node('button', 'dsc-space-reset', '复位'); resetButton.type = 'button';
  footer.append(modeStatus, resetButton);
  controls.append(modeGroup, speedGroup, qualityLabel, viewTools, footer);

  const snapshot = () => ({ ...state, scene: { id: catalog[sceneIndex].id, label: (state.skyQuality === 'photo' ? catalog[sceneIndex].photoLabel : '') || catalog[sceneIndex].label || '',
    credit: catalog[sceneIndex].credit || '', source: catalog[sceneIndex].source || '' },
    transitioning: Boolean(transition), warpSeconds });
  const notify = kind => onChange?.(snapshot(), { kind });
  function persist() {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null; writeEnvironmentState(storage, state);
  }
  function deferPersist() {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 250);
  }
  function syncViewControls() {
    const signed = value => `${value >= 0 ? '+' : ''}${Math.round(value)}°`;
    const angles = `${signed(state.yaw)} / ${signed(state.pitch)}`, distance = `${state.distance.toFixed(2)}×`;
    // Sub-degree camera frames need no text replacement or controls relayout.
    if (readout.textContent !== angles) readout.textContent = angles;
    if (distanceValue.textContent !== distance) distanceValue.textContent = distance;
  }
  function syncFlightControls() {
    docked.setAttribute('aria-pressed', String(state.mode === 'docked'));
    cruise.setAttribute('aria-pressed', String(state.mode === 'cruise'));
    docked.classList.toggle('dsc-is-active', state.mode === 'docked');
    cruise.classList.toggle('dsc-is-active', state.mode === 'cruise');
    throttle.value = String(state.throttle);
    throttle.setAttribute('aria-valuetext', `${SPEEDS[state.speed].label} · ${Math.round(state.throttle * 100)}%`);
    speedValue.textContent = `${SPEEDS[state.speed].label} ${Math.round(state.throttle * 100)}%`;
    for (const mark of speedMarks.children) mark.classList.toggle('dsc-is-active', mark.dataset.speedMark === state.speed);
    modeStatus.textContent = state.mode === 'docked' ? '停泊 · 静止' : motion?.matches ? '巡航 · 减少动态效果'
      : transition ? '跃迁中 · 正在驶入新星域' : awaitingScene ? '跃迁 · 正在准备星域'
      : state.speed === 'warp' ? '极快持续 5 秒后进入随机星域' : `${SPEEDS[state.speed].label}航行`;
    element.dataset.mode = state.mode; element.dataset.speed = state.speed; element.dataset.scene = state.sceneId;
    element.dataset.skyQuality = state.skyQuality; qualitySelect.value = state.skyQuality;
  }
  // Projection constants are computed once on resize, never 1,000 times per frame.
  const project = (x, y, z) => z > .15 ? { x: width / 2 + heading.x + x * focal / z, y: height / 2 + heading.y - y * focal / z, depth: z, scale: focal / z } : null;
  function draw() {
    if (disposed) return;
    const transform = getPanoramaTransform(drift);
    panorama.style.transform = `translate3d(${transform.x}%,${transform.y}%,0) scale(${transform.scale})`;
    heading = { x: transform.x * width * 1.08 / 100, y: transform.y * height * 1.08 / 100 };
    const shown = background?.render(sceneKey(sceneIndex),transition ? sceneKey(transition.nextIndex) : null,transition?.opacity || 0,heading) || false;
    if(shown !== backgroundShown) {
      backgroundShown=shown;panorama.style.display=shown?'none':'block';
      for(let i=0;i<layers.length;i++)layers[i].style.display=!shown&&(i===activeLayer||i===transition?.nextLayer)?'block':'none';
      if(background)background.canvas.hidden=!shown;
      element.dataset.backgroundRenderer=shown?'webgl2':'css';
    }
    const profile = motion?.matches ? (state.mode === 'docked' ? PARKED : SPEEDS.slow) : flight;
    if (particles?.render(profile,travel,focal,heading)) return;
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); context.clearRect(0, 0, width, height);
    const warp = profile.warp;
    if (warp > .001) {
      context.globalAlpha = warp; context.fillStyle = 'rgba(2,9,29,0.85)'; context.fillRect(0, 0, width, height);
      context.save(); context.translate(heading.x, heading.y);
      context.fillStyle = glow; context.fillRect(-heading.x, -heading.y, width, height); context.restore(); context.globalAlpha = 1;
      drawWarpRays(context, warpRays, DEFAULT_VIEW, width, height, travel, warp, project);
    }
    for (const star of stars) {
      const z = ((star.z - travel + 110) % 220 + 220) % 220 - 110;
      const point = project(star.x, star.y, z);
      if (!point || point.x < -5 || point.y < -5 || point.x > width + 5 || point.y > height + 5) continue;
      const size = Math.min(1.75, Math.max(.35, star.radius * point.scale));
      const alpha = Math.min(1, star.brightness * Math.min(1, point.depth / 3) * profile.brightness);
      const color = star.warm && warp < .5 ? '239,219,189' : '202,225,248';
      if (profile.trail > .001) {
        const tail = project(star.x, star.y, z + profile.trail);
        if (tail) {
          const gradient = context.createLinearGradient(tail.x, tail.y, point.x, point.y);
          gradient.addColorStop(0, `rgba(${color},0)`); gradient.addColorStop(1, `rgba(${color},${alpha})`);
          context.strokeStyle = gradient; context.lineWidth = (.45 + size * .45) * (1 + warp * 1.3);
          context.lineCap = 'round'; context.beginPath(); context.moveTo(tail.x, tail.y); context.lineTo(point.x, point.y); context.stroke();
        }
      }
      context.fillStyle = `rgba(${color},${alpha})`; context.beginPath(); context.arc(point.x, point.y, size, 0, Math.PI * 2); context.fill();
      if (size > 1.35) {
        context.fillStyle = `rgba(178,218,235,${alpha * .17})`;
        context.fillRect(point.x - size * 3.5, point.y - .35, size * 7, .7);
        context.fillRect(point.x - .35, point.y - size * 3.5, .7, size * 7);
      }
    }
  }
  function loadScene(scene, quality = state.skyQuality) {
    const key = scene.id + ':' + quality, url = sceneUrl(scene, quality);
    if (sceneLoads.has(key)) return sceneLoads.get(key);
    const load = preloadScene ? Promise.resolve().then(() => preloadScene({ ...scene, url, skyQuality: quality })) : new Promise((resolve, reject) => {
      const image = new window.Image(); image.decoding = 'async';
      image.onload = () => {
        const decoded = image.decode ? image.decode() : Promise.resolve();
        decoded.then(() => resolve(image), reject);
      };
      image.onerror = () => reject(new Error(`Unable to decode scene: ${scene.id}`)); image.src = url;
    });
    const promise = load.then(image => { if (!disposed) readyScenes.add(key); return image; });
    sceneLoads.set(key, promise);
    // Attach a rejection handler immediately: optional artwork failure must not surface as an unhandled promise.
    promise.catch(() => { sceneLoads.delete(key); });
    return promise;
  }
  async function prepareScene(index,quality=state.skyQuality,isCurrent=()=>true) {
    const image=await loadScene(catalog[index],quality);
    if(disposed||!isCurrent())return false;
    if(background) {
      const prepared=await background.prepare(sceneKey(index,quality),image);
      // A failed renderer has a complete CSS fallback. A cancelled upload is
      // different: its stale request must never start a transition.
      if(!prepared&&background.diagnostics.available)return false;
    }
    return !disposed&&isCurrent();
  }
  function retainVisibleTextures() {
    background?.retain([sceneKey(sceneIndex),...(transition?[sceneKey(transition.nextIndex)]:[])]);
  }
  function beginTransition(nextIndex) {
    if (disposed || transition || document.hidden || motion?.matches || state.mode !== 'cruise' || state.speed !== 'warp') return;
    const nextLayer = nextIndex;
    // DOM order is fixed, so every hop must explicitly place the incoming sky above
    // the fully opaque current sky. This remains correct on reverse and later hops.
    layers[activeLayer].style.zIndex='0';
    layers[nextLayer].style.zIndex='1';
    layers[nextLayer].style.display=backgroundShown?'none':'block';
    setLayerOpacity(layers[nextLayer],0);
    transition = { nextIndex, nextLayer, seconds: 0, opacity:0 }; awaitingScene = false; warpSeconds = 0;
    syncFlightControls(); notify('scene');
  }
  function requestNextScene() {
    if (catalog.length < 2 || awaitingScene || transition || qualityPreparing) return;
    const others = catalog.map((scene, index) => index).filter(index => index !== sceneIndex);
    const randomValue = Math.max(0, Math.min(.999999999, Number(random()) || 0));
    const nextIndex = others[Math.floor(randomValue * others.length)], request = ++sceneRequest;
    awaitingScene = true; syncFlightControls();
    if (!background && readyScenes.has(catalog[nextIndex].id + ':' + state.skyQuality)) { beginTransition(nextIndex); return; }
    prepareScene(nextIndex,state.skyQuality,()=>request===sceneRequest).then(prepared => {
      if (!disposed && request === sceneRequest) {
        if(prepared)beginTransition(nextIndex);
        else {awaitingScene=false;warpSeconds=0;syncFlightControls();}
      }
    }).catch(() => {
      if (disposed || request !== sceneRequest) return;
      awaitingScene = false; warpSeconds = 0; syncFlightControls();
      modeStatus.textContent = '星域加载失败，保留当前景色';
    });
  }
  function cancelSceneRequest() {
    sceneRequest++; awaitingScene = false; warpSeconds = 0;
    if(!qualityPreparing)retainVisibleTextures();
  }
  function advanceTransition(seconds) {
    if (!transition) return;
    transition.seconds += seconds;
    const progress = Math.min(1, transition.seconds / 1.6), eased = progress * progress * (3 - 2 * progress);
    transition.opacity=eased;
    setLayerOpacity(layers[transition.nextLayer],eased);
    // Keep the old sky fully opaque underneath; a crossfade never exposes a black frame.
    if (progress < 1) return;
    setLayerOpacity(layers[activeLayer],0); layers[activeLayer].style.display='none'; activeLayer = transition.nextLayer;
    sceneIndex = transition.nextIndex; state.sceneId = catalog[sceneIndex].id; transition = null;
    if(!qualityPreparing)retainVisibleTextures();
    // A deliberate manual change during the fade takes precedence over the automatic return to fast.
    if (state.mode === 'cruise' && state.speed === 'warp') {
      state.speed = 'fast'; state.throttle = SPEED_MARKS.fast;
    }
    warpSeconds = 0;
    deferPersist(); syncFlightControls(); notify('scene');
  }
  function shouldAnimate() {
    return !disposed && !document.hidden && !motion?.matches &&
      (Boolean(transition) || state.mode === 'cruise' || flight.velocity > .001 || flight.warp > .001);
  }
  function tick(now) {
    frame = null;
    if (!shouldAnimate()) return;
    const visibleSeconds = lastFrame === null ? 0 : Math.max(0, now - lastFrame) / 1000;
    const seconds = Math.min(visibleSeconds, .1);
    lastFrame = now;
    // rAF follows the display refresh rate, including 144/165/240 Hz. No software frame cap.
    const target = state.mode === 'cruise' ? profileForThrottle(state.throttle) : PARKED;
    flight = approachFlight(flight, target, seconds);
    if (state.mode === 'docked' && flight.velocity < .001 && flight.warp < .001) flight = { ...PARKED };
    drift = flightDrift.advance(seconds * flight.panoramaRate);
    // Common period of the star/ray depth loops keeps GPU float precision stable on long sessions.
    travel = (travel + seconds * flight.velocity) % 12540;
    if (state.mode === 'cruise' && state.speed === 'warp' && !transition && !awaitingScene) {
      warpSeconds += visibleSeconds;
      if (warpSeconds > 5) requestNextScene();
    }
    advanceTransition(seconds); draw();
    if (shouldAnimate()) frame = window.requestAnimationFrame(tick);
  }
  function syncAnimation() {
    if (!shouldAnimate()) {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null; lastFrame = null; return;
    }
    if (frame === null) { lastFrame = null; frame = window.requestAnimationFrame(tick); }
  }
  function applyView(next) {
    if (disposed) return;
    const view = clampView(next, state);
    if (view.yaw === state.yaw && view.pitch === state.pitch && view.distance === state.distance) return;
    Object.assign(state, view); syncViewControls(); deferPersist(); notify('view');
    // Looking around changes the cabin matrix only. It does not redraw unrelated star particles.
  }
  function flushView() {
    if (viewFrame !== null) window.cancelAnimationFrame(viewFrame);
    viewFrame = null;
    if (pendingView) { const next = pendingView; pendingView = null; applyView(next); }
  }
  function queueView(view) {
    pendingView = clampView(view, pendingView || state);
    if (viewFrame === null) viewFrame = window.requestAnimationFrame(() => { viewFrame = null; flushView(); });
  }
  function setView(view) { flushView(); applyView(view); }
  function setMode(mode) {
    if (mode !== 'docked' && mode !== 'cruise') throw new TypeError('Mode must be docked or cruise');
    if (disposed) return;
    state.mode = mode;
    if (mode !== 'cruise') cancelSceneRequest();
    deferPersist(); syncFlightControls(); syncAnimation(); notify('flight');
  }
  function setThrottle(value) {
    if (!Number.isFinite(value)) throw new TypeError('Throttle must be a finite number');
    if (disposed) return;
    const next = Math.max(0, Math.min(1, value));
    state.throttle = next; state.speed = speedForThrottle(next);
    if (state.speed !== 'warp') cancelSceneRequest();
    deferPersist(); syncFlightControls(); syncAnimation(); notify('flight');
  }
  function setSpeed(speed) {
    if (!Object.hasOwn(SPEEDS, speed)) throw new TypeError('Speed must be slow, fast, or warp');
    setThrottle(SPEED_MARKS[speed]);
  }
  async function setSkyQuality(quality) {
    if (quality !== 'photo' && quality !== 'art') throw new TypeError('Sky quality must be photo or art');
    const request = ++qualityRequest;
    if (disposed) return false;
    if (quality === state.skyQuality) {
      qualityPreparing=false;qualitySelect.removeAttribute('aria-busy');retainVisibleTextures();syncFlightControls();
      // Cancelling an early quality change may have cancelled the initial GPU
      // upload too. Restore the selected image without committing the old job.
      void prepareScene(sceneIndex,quality,()=>request===qualityRequest).then(prepared=>{if(prepared)draw();}).catch(()=>{});
      return true;
    }
    qualityPreparing=true;cancelSceneRequest();
    qualitySelect.setAttribute('aria-busy', 'true');
    try {
      // Prepare all four destinations before swapping URLs, including during a warp.
      await Promise.all(catalog.map(scene => loadScene(scene, quality)));
      if (disposed || request !== qualityRequest) return false;
      for(const index of new Set([sceneIndex,...(transition?[transition.nextIndex]:[])])) {
        if(!await prepareScene(index,quality,()=>request===qualityRequest))return false;
      }
      if (disposed || request !== qualityRequest) return false;
      for (let i = 0; i < layers.length; i++) layers[i].style.backgroundImage = `url(${JSON.stringify(sceneUrl(catalog[i], quality))})`;
      state.skyQuality = quality; deferPersist(); syncFlightControls(); notify('scene');
      retainVisibleTextures();draw();
      return true;
    } catch {
      if (!disposed && request === qualityRequest) {
        syncFlightControls(); modeStatus.textContent = '影像加载失败，保留当前景色';
      }
      return false;
    } finally {
      if (!disposed && request === qualityRequest) {qualityPreparing=false;qualitySelect.removeAttribute('aria-busy');}
    }
  }
  function reset() { setView(DEFAULT_VIEW); }
  function resize() {
    width = Math.max(1, element.clientWidth || window.innerWidth);
    height = Math.max(1, element.clientHeight || window.innerHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    focal = height / (2 * Math.tan(radians(32.5)));
    const nextWidth = Math.round(width * pixelRatio), nextHeight = Math.round(height * pixelRatio);
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    particles?.resize(width,height,pixelRatio);
    background?.resize(width,height,Math.min(window.devicePixelRatio || 1,2));
    if (context) {
      glow = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width * .45, height * .9));
      glow.addColorStop(0, 'rgba(166,229,255,.18)'); glow.addColorStop(.12, 'rgba(55,144,249,.32)');
      glow.addColorStop(.45, 'rgba(26,73,164,.24)'); glow.addColorStop(1, 'rgba(39,86,163,0)');
    }
    draw();
  }
  listen(docked, 'click', () => setMode('docked')); listen(cruise, 'click', () => setMode('cruise'));
  listen(throttle, 'input', () => setThrottle(Number(throttle.value))); listen(throttle, 'change', persist);
  listen(qualitySelect, 'change', () => { void setSkyQuality(qualitySelect.value); });
  listen(resetButton, 'click', reset);
  listen(lookPad, 'pointerdown', event => {
    if (event.button !== 0 || drag) return;
    flushView(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch };
    lookPad.setPointerCapture(event.pointerId); lookPad.focus({ preventScroll: true });
    lookPad.classList.add('dsc-is-dragging'); event.preventDefault();
  });
  listen(lookPad, 'pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const latest = event.getCoalescedEvents?.()?.at(-1) || event;
    queueView({ yaw: drag.yaw + (latest.clientX - drag.x) * .28, pitch: drag.pitch - (latest.clientY - drag.y) * .28 });
  });
  const endDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const id = drag.id; drag = null;
    flushView(); persist();
    if (lookPad.hasPointerCapture(id)) lookPad.releasePointerCapture(id);
    lookPad.classList.remove('dsc-is-dragging');
  };
  listen(lookPad, 'pointerup', endDrag); listen(lookPad, 'pointercancel', endDrag); listen(lookPad, 'lostpointercapture', endDrag);
  listen(lookPad, 'keydown', event => {
    const step = event.shiftKey ? 10 : 3;
    const actions = { ArrowLeft: () => setView({ yaw: state.yaw - step }), ArrowRight: () => setView({ yaw: state.yaw + step }),
      ArrowUp: () => setView({ pitch: state.pitch + step }), ArrowDown: () => setView({ pitch: state.pitch - step }),
      '+': () => setView({ distance: state.distance - .05 }), '=': () => setView({ distance: state.distance - .05 }),
      '-': () => setView({ distance: state.distance + .05 }), Home: reset };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  const interactive = '[data-dsc-screen],[data-shell-overlay],input,textarea,select,button,a,[contenteditable="true"],[role="dialog"],[role="menu"],[role="listbox"],.dsc-navigation';
  listen(document, 'wheel', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !event.deltaY) return;
    const target = event.target;
    const overPad = target === lookPad || lookPad.contains(target);
    if (!overPad) {
      if (!target?.closest || target.closest(interactive)) return;
      // Only exposed cabin surfaces belong to the camera. Host panes keep their scroll gestures.
      if (target !== document.body && target !== document.documentElement && !container.contains(target)
        && target !== document.getElementById('root')) return;
    }
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    const base = pendingView || state;
    queueView({ distance: base.distance + Math.max(-160, Math.min(160, delta)) * .0008 });
    event.preventDefault();
  }, { passive: false });
  listen(window, 'resize', resize);
  if (window.ResizeObserver) {
    const observer = new window.ResizeObserver(resize); observer.observe(element); listeners.push(() => observer.disconnect());
  }
  listen(document, 'visibilitychange', () => {
    lastFrame = null; syncAnimation();
    if (!document.hidden && awaitingScene && !transition) {
      // Any load completed while hidden is retried only after a fresh visible warp dwell.
      cancelSceneRequest(); syncFlightControls();
    }
  });
  const motionChanged = () => {
    cancelSceneRequest();
    if (motion?.matches && transition) {
      setLayerOpacity(layers[transition.nextLayer],0); layers[transition.nextLayer].style.display='none'; transition = null;
      retainVisibleTextures();
    }
    syncFlightControls(); draw(); syncAnimation();
  };
  if (motion?.addEventListener) listen(motion, 'change', motionChanged);
  else if (motion?.addListener) { motion.addListener(motionChanged); listeners.push(() => motion.removeListener(motionChanged)); }
  syncViewControls(); syncFlightControls(); resize(); syncAnimation();
  // Decode outside the frame loop. A target is never crossfaded before its decode promise resolves.
  for (const scene of catalog) loadScene(scene).catch(() => {});
  if(background) {
    const initialQuality=state.skyQuality;
    prepareScene(sceneIndex,initialQuality,()=>state.skyQuality===initialQuality&&!qualityPreparing)
      .then(prepared=>{if(prepared)draw();}).catch(()=>{});
  }
  return {
    element, controls, getState: snapshot, setMode, setSpeed, setThrottle, setSkyQuality, setView, reset,
    dispose() {
      if (disposed) return;
      flushView(); persist(); disposed = true; sceneRequest++; qualityRequest++;
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (viewFrame !== null) window.cancelAnimationFrame(viewFrame);
      frame = viewFrame = null;
      for (const unlisten of listeners) unlisten();
      if (drag && lookPad.hasPointerCapture(drag.id)) lookPad.releasePointerCapture(drag.id);
      drag = null; background?.dispose();particles?.dispose();element.remove(); controls.remove();
    },
  };
}
