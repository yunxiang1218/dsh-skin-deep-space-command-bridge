export const SPACE_STORAGE_KEY = 'dsc.space.environment.v1';
const DEFAULT_VIEW = Object.freeze({ yaw: 0, pitch: 0, distance: 1 });
const DEFAULT_STATE = Object.freeze({ mode: 'cruise', speed: 'slow', ...DEFAULT_VIEW });
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
    return { mode: saved?.mode === 'docked' ? 'docked' : 'cruise', speed: normalizeSpeed(saved?.speed), ...clampView(saved) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeEnvironmentState(storage, state) {
  try {
    storage?.setItem(SPACE_STORAGE_KEY, JSON.stringify({
      mode: state.mode === 'docked' ? 'docked' : 'cruise', speed: normalizeSpeed(state.speed), ...clampView(state),
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

/** Slow bounded travel through a single panorama; never reset or tile separate windows. */
export function getPanoramaTransform(view = DEFAULT_VIEW, timeSeconds = 0) {
  const camera = clampView(view);
  return {
    x: -camera.yaw * 0.15 + Math.sin(timeSeconds / 42) * 3.4,
    y: camera.pitch * 0.13 + Math.sin(timeSeconds / 57) * 1.1,
    scale: 1.035 - (camera.distance - 1) * 0.03 + (1 - Math.cos(timeSeconds / 80)) * 0.012,
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

function drawWarpRays(context, rays, view, width, height, travel,amount=1) {
  const aspect = Math.max(1, width / height);
  for (const ray of rays) {
    const depth = 6 + ((ray.depth - travel + 114) % 114 + 114) % 114;
    const position = { x: Math.cos(ray.angle) * ray.spread * aspect, y: Math.sin(ray.angle) * ray.spread, z: depth };
    const head = projectPoint(position, view, width, height);
    const tail = projectPoint({ ...position, z: depth + ray.length }, view, width, height);
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

/** The returned controls are intentionally unattached, so the host can place them in its AI panel. */
export function createSpaceEnvironment(container, { backgroundUrl = './resource/nebula.jpg', storage, onChange } = {}) {
  const document = container.ownerDocument;
  const window = document.defaultView;
  if (storage === undefined) {
    try { storage = window.localStorage; } catch { storage = null; }
  }
  let state = readEnvironmentState(storage);
  let flight={...(state.mode==='cruise'?SPEEDS[state.speed]:PARKED)};
  let disposed = false;
  let frame = null;
  let lastFrame = 0;
  let elapsed = 0;
  let travel = 0;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let drag = null;
  const listeners = [];
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const stars = makeStars();
  const warpRays = makeWarpRays();
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
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
  const nebula = node('div', 'dsc-space-nebula');
  // One oversized panorama spans every window; camera travel never exposes its edges.
  nebula.style.cssText = 'position:absolute;inset:-24%;background-size:cover;background-repeat:no-repeat;background-position:50% 50%;opacity:.38;';
  nebula.style.backgroundImage = `url(${JSON.stringify(backgroundUrl)})`;
  const canvas = node('canvas', 'dsc-space-canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  const shade = node('div', 'dsc-space-shade');
  shade.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at 68% 38%,transparent 5%,rgba(2,7,14,.25) 70%,rgba(2,6,13,.72)),linear-gradient(180deg,rgba(2,8,17,.1),rgba(2,7,13,.2) 45%,rgba(1,5,11,.65));';
  element.append(nebula, canvas, shade);
  container.append(element);
  const context = canvas.getContext('2d');

  const controls = node('section', 'dsc-space-controls');
  controls.setAttribute('aria-label', '太空环境控制');
  const heading = node('div', 'dsc-space-controls-heading');
  heading.append(node('span', 'dsc-space-controls-title', '环境控制'), node('span', 'dsc-space-controls-kicker', 'VIEWPORT'));
  const modeGroup = node('div', 'dsc-space-mode');
  modeGroup.setAttribute('role', 'group');
  modeGroup.setAttribute('aria-label', '航行模式');
  const docked = node('button', 'dsc-space-mode-button', '停泊');
  const cruise = node('button', 'dsc-space-mode-button', '巡航');
  docked.type = cruise.type = 'button';
  docked.dataset.mode = 'docked';
  cruise.dataset.mode = 'cruise';
  modeGroup.append(docked, cruise);
  const speedGroup = node('div', 'dsc-space-speeds');
  speedGroup.setAttribute('role', 'group');
  speedGroup.setAttribute('aria-label', '航行速度');
  const speedButtons = Object.entries(SPEEDS).map(([speed, profile]) => {
    const button = node('button', 'dsc-space-speed-button', profile.label);
    button.type = 'button';
    button.dataset.speed = speed;
    speedGroup.append(button);
    return button;
  });
  const lookPad = node('div', 'dsc-look-pad');
  lookPad.tabIndex = 0;
  lookPad.setAttribute('role', 'group');
  lookPad.setAttribute('aria-label', '拖动观察整个船舱；方向键转头，加减键调整观察距离，Home 键复位');
  lookPad.style.touchAction = 'none';
  const reticle = node('span', 'dsc-look-reticle');
  reticle.setAttribute('aria-hidden', 'true');
  reticle.append(node('span', 'dsc-look-reticle-dot'));
  const padLabel = node('span', 'dsc-look-pad-label', '拖动观察船舱');
  lookPad.append(reticle, padLabel, node('span', 'dsc-look-pad-range', '←  120°  →'));
  const readout = node('output', 'dsc-space-readout');
  readout.setAttribute('aria-label', '当前视角');
  const distanceLabel = node('label', 'dsc-distance-control');
  const distanceCaption = node('span', 'dsc-distance-caption');
  const distanceValue = node('output', 'dsc-distance-value');
  distanceCaption.append(node('span', 'dsc-distance-label', '观察距离'), distanceValue);
  const distance = node('input', 'dsc-distance-slider');
  distance.type = 'range';
  distance.min = '0.7';
  distance.max = '1.6';
  distance.step = '0.01';
  distance.setAttribute('aria-label', '观察距离');
  distanceLabel.append(distanceCaption, distance);
  const footer = node('div', 'dsc-space-controls-footer');
  const modeStatus = node('span', 'dsc-space-mode-status');
  const resetButton = node('button', 'dsc-space-reset', '视角复位');
  resetButton.type = 'button';
  footer.append(modeStatus, resetButton);
  controls.append(heading, modeGroup, speedGroup, lookPad, readout, distanceLabel, footer);

  function syncControls() {
    docked.setAttribute('aria-pressed', String(state.mode === 'docked'));
    cruise.setAttribute('aria-pressed', String(state.mode === 'cruise'));
    docked.classList.toggle('dsc-is-active', state.mode === 'docked');
    cruise.classList.toggle('dsc-is-active', state.mode === 'cruise');
    for (const button of speedButtons) {
      const selected = button.dataset.speed === state.speed;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('dsc-is-active', selected);
    }
    const signed = value => `${value >= 0 ? '+' : ''}${Math.round(value)}°`;
    readout.textContent = `偏航 ${signed(state.yaw)}   ·   俯仰 ${signed(state.pitch)}`;
    distance.value = String(state.distance);
    distanceValue.textContent = `${state.distance.toFixed(2)}×`;
    distance.setAttribute('aria-valuetext', `${state.distance.toFixed(2)} 倍船舱观察距离，包含驾驶台和舷窗`);
    reticle.style.transform = `translate(${state.yaw / 60 * 24}px, ${-state.pitch / 60 * 14}px)`;
    modeStatus.textContent = state.mode === 'docked' ? '停泊 · 静止' : motion?.matches ? '巡航 · 减少动态效果'
      : state.speed === 'warp' ? '巡航 · 空间跃迁' : `巡航 · ${SPEEDS[state.speed].label}航行`;
    element.dataset.mode = state.mode;
    element.dataset.speed = state.speed;
  }

  function draw() {
    if (disposed) return;
    // UI distance belongs to the cockpit layer; looking into space keeps a fixed depth.
    const view = DEFAULT_VIEW;
    const panorama = getPanoramaTransform(view, elapsed);
    nebula.style.transform = `translate(${panorama.x}%, ${panorama.y}%) scale(${panorama.scale})`;
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    const profile = motion?.matches ? SPEEDS.slow : flight;
    const warp=profile.warp;
    if (warp > .001) {
      context.globalAlpha=warp;
      const vanishingPoint = projectPoint({ x: 0, y: 0, z: 100000 }, view, width, height);
      // A blue veil separates the travel tunnel from the detailed static photograph.
      context.fillStyle = 'rgba(2,9,29,0.85)';
      context.fillRect(0, 0, width, height);
      const glow = context.createRadialGradient(vanishingPoint.x, vanishingPoint.y, 0,
        vanishingPoint.x, vanishingPoint.y, Math.max(width * 0.45, height * 0.9));
      // Steady illumination creates depth without flashing, pulsing, or camera shake.
      glow.addColorStop(0, 'rgba(166,229,255,0.18)');
      glow.addColorStop(0.12, 'rgba(55,144,249,0.32)');
      glow.addColorStop(0.45, 'rgba(26,73,164,0.24)');
      glow.addColorStop(1, 'rgba(39,86,163,0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.globalAlpha=1;
      drawWarpRays(context, warpRays, view, width, height, travel,warp);
    }
    for (const star of stars) {
      const z = ((star.z - travel + 110) % 220 + 220) % 220 - 110;
      const point = projectPoint({ ...star, z }, view, width, height);
      if (!point || point.x < -5 || point.y < -5 || point.x > width + 5 || point.y > height + 5) continue;
      const size = Math.min(1.75, Math.max(0.35, star.radius * point.scale));
      const alpha = Math.min(1, star.brightness * Math.min(1, point.depth / 3) * profile.brightness);
      const color = star.warm && warp<.5 ? '239,219,189' : '202,225,248';
      if (profile.trail > 0) {
        const tail = projectPoint({ ...star, z: z + profile.trail }, view, width, height);
        if (tail) {
          const trail = context.createLinearGradient(tail.x, tail.y, point.x, point.y);
          trail.addColorStop(0, `rgba(${color},0)`);
          trail.addColorStop(1, `rgba(${color},${alpha})`);
          context.strokeStyle = trail;
          context.lineWidth = (0.45 + size * 0.45) * (1+warp*1.3);
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(tail.x, tail.y);
          context.lineTo(point.x, point.y);
          context.stroke();
        }
      }
      context.fillStyle = `rgba(${color},${alpha})`;
      context.beginPath();
      context.arc(point.x, point.y, size, 0, Math.PI * 2);
      context.fill();
      if (size > 1.35) {
        context.fillStyle = `rgba(178,218,235,${alpha * 0.17})`;
        context.fillRect(point.x - size * 3.5, point.y - 0.35, size * 7, 0.7);
        context.fillRect(point.x - 0.35, point.y - size * 3.5, 0.7, size * 7);
      }
    }
  }

  function shouldAnimate() {
    return !disposed && Boolean(context) && (state.mode === 'cruise' || flight.velocity>.001 || flight.warp>.001) && !document.hidden && !motion?.matches;
  }
  function tick(now) {
    frame = null;
    if (!shouldAnimate()) return;
    if (!lastFrame) lastFrame = now;
    const delta = now - lastFrame;
    if (delta >= 1000 / 30) {
      const seconds = Math.min(delta, 100) / 1000;
      flight=approachFlight(flight,state.mode==='cruise'?SPEEDS[state.speed]:PARKED,seconds);
      if(state.mode==='docked'&&flight.velocity<.001)flight={...PARKED};
      const profile = flight;
      elapsed += seconds * profile.panoramaRate;
      travel += seconds * profile.velocity;
      lastFrame = now;
      draw();
    }
    frame = window.requestAnimationFrame(tick);
  }
  function syncAnimation() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    lastFrame = 0;
    if (shouldAnimate()) frame = window.requestAnimationFrame(tick);
  }
  function update(next) {
    if (disposed) return;
    state = { mode: next.mode === 'cruise' ? 'cruise' : 'docked', speed: normalizeSpeed(next.speed), ...clampView(next, state) };
    writeEnvironmentState(storage, state);
    syncControls();
    draw();
    if(frame===null || !shouldAnimate())syncAnimation();
    onChange?.({ ...state });
  }
  function setView(view) { update({ ...state, ...clampView(view, state) }); }
  function setMode(mode) {
    if (mode !== 'docked' && mode !== 'cruise') throw new TypeError('Mode must be docked or cruise');
    update({ ...state, mode });
  }
  function setSpeed(speed) {
    if (!Object.hasOwn(SPEEDS, speed)) throw new TypeError('Speed must be slow, fast, or warp');
    update({ ...state, speed });
  }
  function reset() { setView(DEFAULT_VIEW); }
  function resize() {
    width = Math.max(1, element.clientWidth || window.innerWidth);
    height = Math.max(1, element.clientHeight || window.innerHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    draw();
  }

  listen(docked, 'click', () => setMode('docked'));
  listen(cruise, 'click', () => setMode('cruise'));
  for (const button of speedButtons) listen(button, 'click', () => setSpeed(button.dataset.speed));
  listen(resetButton, 'click', reset);
  listen(distance, 'input', () => setView({ distance: Number(distance.value) }));
  listen(lookPad, 'pointerdown', event => {
    if (event.button !== 0 || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch };
    lookPad.setPointerCapture(event.pointerId);
    lookPad.focus({ preventScroll: true });
    lookPad.classList.add('dsc-is-dragging');
    event.preventDefault();
  });
  listen(lookPad, 'pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    setView({ yaw: drag.yaw + (event.clientX - drag.x) * 0.4, pitch: drag.pitch - (event.clientY - drag.y) * 0.4 });
  });
  const endDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (lookPad.hasPointerCapture(event.pointerId)) lookPad.releasePointerCapture(event.pointerId);
    drag = null;
    lookPad.classList.remove('dsc-is-dragging');
  };
  listen(lookPad, 'pointerup', endDrag);
  listen(lookPad, 'pointercancel', endDrag);
  listen(lookPad, 'lostpointercapture', endDrag);
  listen(lookPad, 'keydown', event => {
    const step = event.shiftKey ? 10 : 3;
    const actions = {
      ArrowLeft: () => setView({ yaw: state.yaw - step }),
      ArrowRight: () => setView({ yaw: state.yaw + step }),
      ArrowUp: () => setView({ pitch: state.pitch + step }),
      ArrowDown: () => setView({ pitch: state.pitch - step }),
      '+': () => setView({ distance: state.distance - 0.05 }),
      '=': () => setView({ distance: state.distance - 0.05 }),
      '-': () => setView({ distance: state.distance + 0.05 }),
      Home: reset,
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  listen(window, 'resize', resize);
  if (window.ResizeObserver) {
    const resizeObserver = new window.ResizeObserver(resize);
    resizeObserver.observe(element);
    listeners.push(() => resizeObserver.disconnect());
  }
  listen(document, 'visibilitychange', syncAnimation);
  const motionChanged = () => { syncControls(); draw(); syncAnimation(); };
  if (motion?.addEventListener) listen(motion, 'change', motionChanged);
  else if (motion?.addListener) {
    motion.addListener(motionChanged);
    listeners.push(() => motion.removeListener(motionChanged));
  }
  syncControls();
  resize();
  syncAnimation();

  return {
    element,
    controls,
    getState: () => ({ ...state }),
    setMode,
    setSpeed,
    setView,
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      for (const unlisten of listeners) unlisten();
      if (drag && lookPad.hasPointerCapture(drag.id)) lookPad.releasePointerCapture(drag.id);
      drag = null;
      element.remove();
      controls.remove();
    },
  };
}
