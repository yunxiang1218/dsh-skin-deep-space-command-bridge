import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  createSpaceEnvironment,
  clampView,
  projectPoint,
  getPanoramaTransform,
  readEnvironmentState,
  writeEnvironmentState,
  SPACE_STORAGE_KEY,
  approachFlight,
  SPEED_MARKS,
  speedForThrottle,
  profileForThrottle,
} from '../src/client/space-environment.js';

test('camera accepts partial views and constrains the full 120 degree range', () => {
  assert.deepEqual(clampView({ yaw: 91, pitch: -75, distance: 4 }), {
    yaw: 60, pitch: -60, distance: 1.6,
  });
  assert.deepEqual(clampView({ yaw: -100, pitch: 75, distance: -1 }), {
    yaw: -60, pitch: 60, distance: 0.7,
  });
  assert.deepEqual(clampView({ pitch: 12 }, { yaw: 30, pitch: 2, distance: 1.2 }), {
    yaw: 30, pitch: 12, distance: 1.2,
  });
  assert.deepEqual(clampView({ yaw: NaN, pitch: Infinity, distance: 'bad' }), {
    yaw: 0, pitch: 0, distance: 1,
  });
});

test('camera rotation changes projection and rejects points behind the camera', () => {
  const origin = projectPoint({ x: 0, y: 0, z: 10 }, {}, 1000, 600);
  assert.equal(origin.x, 500);
  assert.equal(origin.y, 300);
  assert.ok(projectPoint({ x: 0, y: 0, z: 10 }, { yaw: 30 }, 1000, 600).x < origin.x);
  assert.ok(projectPoint({ x: 0, y: 0, z: 10 }, { pitch: 30 }, 1000, 600).y > origin.y);
  assert.equal(projectPoint({ x: 0, y: 0, z: -10 }, {}, 1000, 600), null);
  const yaw = 30 * Math.PI / 180;
  const centered = projectPoint({ x: 10 * Math.sin(yaw), y: 0, z: 10 * Math.cos(yaw) }, { yaw: 30 }, 1000, 600);
  assert.ok(Math.abs(centered.x - 500) < 0.000001);
});

test('the pure perspective helper supports camera depth independently of the cockpit control', () => {
  const near = { x: 1, y: 0, z: 6 };
  const far = { x: 1, y: 0, z: 60 };
  const screen = (point, distance) => projectPoint(point, { distance }, 1000, 600).x - 500;
  const nearScale = screen(near, 1.6) / screen(near, 0.7);
  const farScale = screen(far, 1.6) / screen(far, 0.7);
  assert.ok(nearScale < farScale);
  assert.ok(nearScale > 0 && farScale < 1);
});

test('cockpit distance updates controls and host notification without changing the space scene', () => {
  const fixture = environmentFixture({ initialState: { mode: 'docked', speed: 'warp', yaw: 18, pitch: -12 } });
  const { environment } = fixture;
  try {
    const nebula = environment.element.querySelector('.dsc-space-panorama');
    const originalTransform = nebula.style.transform;
    const originalStars = fixture.paintedStars;
    const originalTrails = fixture.trails;
    for (const distance of [0.7, 1.6]) {
      environment.setView({ distance });
      fixture.flushStorage();
      assert.equal(environment.getState().distance, distance);
      assert.equal(fixture.lastChange.distance, distance);
      assert.equal(readEnvironmentState(fixture.window.localStorage).distance, distance);
      assert.equal(environment.controls.querySelector('.dsc-distance-value').textContent, `${distance.toFixed(2)}×`);
      assert.equal(environment.controls.querySelector('.dsc-distance-slider'), null, 'distance is controlled by wheel, not a slider');
      assert.equal(nebula.style.transform, originalTransform);
      assert.deepEqual(fixture.paintedStars, originalStars);
      assert.deepEqual(fixture.trails, originalTrails);
      assert.equal(fixture.frames.size, 0);
    }
  } finally { fixture.close(); }
});

test('stored state roundtrips and hostile values cannot escape camera bounds', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  writeEnvironmentState(storage, { mode: 'cruise', yaw: 42, pitch: -17, distance: 0.8 });
  assert.deepEqual(readEnvironmentState(storage), { mode: 'cruise', speed: 'slow', skyQuality:'photo', throttle:.12, yaw: 42, pitch: -17, distance: 0.8 });
  data.set(SPACE_STORAGE_KEY, JSON.stringify({ mode: 'unknown', yaw: 300, pitch: -400, distance: 99 }));
  assert.deepEqual(readEnvironmentState(storage), { mode: 'cruise', speed: 'slow', skyQuality:'photo', throttle:.12, yaw: 60, pitch: -60, distance: 1.6 });
  data.set(SPACE_STORAGE_KEY, 'not json');
  assert.deepEqual(readEnvironmentState(storage), { mode: 'cruise', speed: 'slow', skyQuality:'photo', throttle:.12, yaw: 0, pitch: 0, distance: 1 });
});

test('speed storage supports all three levels and migrates old saved preferences', () => {
  let saved = JSON.stringify({ mode: 'docked', yaw: 14, pitch: 5, distance: 1.2 });
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  assert.deepEqual(readEnvironmentState(storage), { mode: 'docked', speed: 'slow', skyQuality:'photo', throttle:.12, yaw: 14, pitch: 5, distance: 1.2 });
  for (const speed of ['slow', 'fast', 'warp']) {
    writeEnvironmentState(storage, { mode: 'docked', speed });
    assert.equal(readEnvironmentState(storage).speed, speed);
    assert.equal(readEnvironmentState(storage).mode, 'docked');
  }
  saved = JSON.stringify({ mode: 'cruise', speed: 'invalid' });
  assert.equal(readEnvironmentState(storage).speed, 'slow');
});

test('unavailable and blocked storage never prevents the environment from loading', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readEnvironmentState(blocked).mode, 'cruise');
  assert.equal(readEnvironmentState(null).distance, 1);
  assert.doesNotThrow(() => writeEnvironmentState(blocked, { mode: 'cruise' }));
  assert.doesNotThrow(() => writeEnvironmentState(null, { mode: 'cruise' }));
});

function environmentFixture({ reduced = false, initialState, ...environmentOptions } = {}) {
  const dom = new JSDOM('<body><div class="dsc-stage" style="z-index:-1"></div><textarea id="chat"></textarea></body>', {
    url: 'https://dsh.test', pretendToBeVisual: true,
  });
  const { window } = dom;
  if (initialState) writeEnvironmentState(window.localStorage, initialState);
  const frames = new Map(), timers = new Map(), kinds=[];
  let frameId = 0;
  let timerId = 0, storageWrites = 0;
  let hidden = false;
  let draws = 0;
  let changes = 0;
  let contextCount = 0;
  let paintedStars = [];
  let trails = [];
  let pathStart = null;
  let lastChange = null;
  const motionListeners = new Set();
  const motion = {
    matches: reduced,
    addEventListener(type, fn) { if (type === 'change') motionListeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'change') motionListeners.delete(fn); },
  };
  const context = new Proxy({
    clearRect: () => { draws++; paintedStars = []; trails = []; },
    beginPath: () => { pathStart = null; },
    moveTo: (x, y) => { pathStart = { x, y }; },
    lineTo: (x, y) => { if (pathStart) trails.push({ from: pathStart, to: { x, y } }); },
    arc: (x, y, radius) => paintedStars.push({ x, y, radius }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  window.HTMLCanvasElement.prototype.getContext = () => { contextCount++; return context; };
  window.Element.prototype.setPointerCapture = function(id) { this.capturedPointer = id; };
  window.Element.prototype.hasPointerCapture = function(id) { return this.capturedPointer === id; };
  window.Element.prototype.releasePointerCapture = function() { delete this.capturedPointer; };
  window.matchMedia = () => motion;
  window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.setTimeout = callback => { timers.set(++timerId,callback); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  Object.defineProperty(window.document, 'hidden', { get: () => hidden });
  const environment = createSpaceEnvironment(window.document.querySelector('.dsc-stage'), {
    backgroundUrl: '/resource/nebula.jpg',
    storage: {getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>{storageWrites++;window.localStorage.setItem(key,value);}},
    onChange: (state,meta) => { changes++; lastChange = state; kinds.push(meta.kind); },
    ...environmentOptions,
  });
  window.document.body.append(environment.controls);
  return {
    window, environment, frames, timers, kinds, motionListeners,
    get storageWrites() {return storageWrites;},
    get draws() { return draws; },
    get changes() { return changes; },
    get contextCount() { return contextCount; },
    get paintedStars() { return paintedStars; },
    get trails() { return trails; },
    get lastChange() { return lastChange; },
    runFrame(time) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    },
    settle() { for(let time=240;time<=15240;time+=100)this.runFrame(time);this.flushStorage(); },
    flushStorage() {const pending=[...timers.values()];timers.clear();for(const callback of pending)callback();},
    setHidden(value) { hidden = value; window.document.dispatchEvent(new window.Event('visibilitychange')); },
    setReduced(value) { motion.matches = value; for (const fn of motionListeners) fn(); },
    pointer(target, type, x, y) {
      const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      target.dispatchEvent(event);
    },
    close() { environment.dispose(); dom.window.close(); },
  };
}

test('one continuous panorama covers every window at all camera and zoom limits', () => {
  const fixture = environmentFixture();
  const { environment } = fixture;
  const nebula = environment.element.querySelector('.dsc-space-panorama');
  try {
    assert.equal(environment.element.querySelectorAll('.dsc-space-panorama').length, 1);
    assert.equal(environment.element.querySelectorAll('.dsc-space-nebula').length, 1,'one persistent layer per catalog scene shares one continuous panorama');
    assert.equal(environment.element.querySelectorAll('canvas').length, 1);
    assert.equal(fixture.contextCount, 1, 'only the full-scene star canvas is created');
    assert.ok([...nebula.children].every(layer=>layer.style.backgroundSize==='cover'));
    const span = 1 - 2 * parseFloat(nebula.style.inset) / 100;
    for (const yaw of [-60, 60]) for (const pitch of [-60, 60]) for (const distance of [0.7, 1.6]) {
      environment.setView({ yaw, pitch, distance });
      const transform = nebula.style.transform.match(/translate3d\(([-\d.]+)%,([-\d.]+)%,0\) scale\(([-\d.]+)\)/);
      assert.ok(transform);
      const scale = Number(transform[3]);
      for (const translation of transform.slice(1, 3).map(Number)) {
        const center = 0.5 + translation / 100 * span;
        assert.ok(center - span * scale / 2 <= 0, 'panorama must extend beyond the near edge');
        assert.ok(center + span * scale / 2 >= 1, 'panorama must extend beyond the far edge');
      }
      for (const x of [-3, 3]) for (const y of [-3, 3]) {
        const panorama = getPanoramaTransform({ x, y });
        for (const translation of [panorama.x, panorama.y]) {
          const center = 0.5 + translation / 100 * span;
          assert.ok(center - span * panorama.scale / 2 <= 0, 'cruise must retain near-edge coverage');
          assert.ok(center + span * panorama.scale / 2 >= 1, 'cruise must retain far-edge coverage');
        }
      }
    }
  } finally { fixture.close(); }
});

test('only visible sky layers allocate raster surfaces before, during and after a warp', async () => {
  const fixture = environmentFixture({ scenes: Array.from({length:4},(_,i)=>({id:String(i),url:`/${i}.jpg`})),
    preloadScene: async () => ({}), random: () => 0 });
  try {
    await new Promise(resolve => setImmediate(resolve));
    const visible = () => [...fixture.environment.element.querySelectorAll('.dsc-space-nebula')].filter(layer=>layer.style.display !== 'none');
    assert.equal(visible().length, 1);
    fixture.environment.setSpeed('warp'); fixture.runFrame(0);
    for(let ms=100;ms<=5400;ms+=100) fixture.runFrame(ms);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(visible().length, 2, 'only outgoing and incoming photographs are rasterized');
    for(let ms=5500;ms<=7400;ms+=100) fixture.runFrame(ms);
    assert.equal(visible().length, 1, 'outgoing texture is released after the fade');
    assert.equal(fixture.environment.getState().speed, 'fast');
  } finally {fixture.close();}
});

test('HD originals are the default and artwork is decoded before an all-window switch', async () => {
  const pending = [];
  const fixture = environmentFixture({ scenes: [{id:'sky',url:'/photo.jpg',artUrl:'/art.webp'}],
    preloadScene: scene => scene.skyQuality === 'art' ? new Promise(resolve => pending.push(resolve)) : Promise.resolve({}) });
  try {
    const env = fixture.environment, layer = env.element.querySelector('.dsc-space-nebula');
    assert.equal(env.getState().skyQuality, 'photo'); assert.ok(layer.style.backgroundImage.includes('/photo.jpg'));
    const request = env.setSkyQuality('art'); await Promise.resolve();
    assert.ok(layer.style.backgroundImage.includes('/photo.jpg'), 'old image remains until decode finishes');
    pending[0]({}); assert.equal(await request, true);
    assert.ok(layer.style.backgroundImage.includes('/art.webp'));
    assert.equal(env.element.dataset.skyQuality, 'art');
    fixture.flushStorage(); assert.equal(readEnvironmentState(fixture.window.localStorage).skyQuality, 'art');
    assert.equal(await env.setSkyQuality('photo'), true);
    assert.ok(layer.style.backgroundImage.includes('/photo.jpg'));
  } finally { fixture.close(); }
});

test('failed or cancelled quality changes retain the current scene and disposal ignores pending loads', async () => {
  let resolveArt, rejectArt;
  const fixture = environmentFixture({ scenes: [{id:'sky',url:'/photo.jpg',artUrl:'/art.webp'}],
    preloadScene: scene => scene.skyQuality === 'art' ? new Promise((resolve,reject) => {resolveArt=resolve;rejectArt=reject;}) : Promise.resolve({}) });
  try {
    const env = fixture.environment;
    const failed = env.setSkyQuality('art'); await Promise.resolve(); rejectArt(Error('decode'));
    assert.equal(await failed, false); assert.equal(env.getState().skyQuality, 'photo');
    const cancelled = env.setSkyQuality('art'); await Promise.resolve(); await env.setSkyQuality('photo'); resolveArt({});
    assert.equal(await cancelled, false); assert.equal(env.getState().skyQuality, 'photo');
    const disposed = env.setSkyQuality('art'); env.dispose();
    assert.equal(await disposed, false); assert.equal(env.getState().skyQuality, 'photo');
  } finally { fixture.close(); }
});

test('random flight moves scenery on both axes, pauses when hidden, and never changes cabin view', () => {
  let n = 0;
  const fixture = environmentFixture({ motionRandom: () => [1, 1, 0, 0, 0, 0][n++ % 6] });
  try {
    const env = fixture.environment, initial = clampView(env.getState());
    const panorama = env.element.querySelector('.dsc-space-panorama');
    fixture.runFrame(0); for (let ms=100;ms<=4000;ms+=100) fixture.runFrame(ms);
    const moving = panorama.style.transform.match(/translate3d\(([-\d.]+)%,([-\d.]+)%/);
    assert.ok(Number(moving[1]) > 1 && Number(moving[2]) > 1, 'vertical movement is as strong as horizontal movement');
    assert.deepEqual(clampView(env.getState()), initial);
    const frozen = panorama.style.transform;
    fixture.setHidden(true); fixture.runFrame(60000); fixture.setHidden(false); fixture.runFrame(90000);
    assert.equal(panorama.style.transform, frozen, 'hidden elapsed time does not teleport the ship');
    fixture.setReduced(true); fixture.runFrame(100000);
    assert.equal(panorama.style.transform, frozen);
  } finally { fixture.close(); }
});

test('continuous speed slider announces three named bands without changing the camera or mode', () => {
  const fixture = environmentFixture({ initialState: { mode: 'docked', yaw: 12 } });
  const { environment } = fixture;
  try {
    const group = environment.controls.querySelector('.dsc-space-speeds');
    const slider = group.querySelector('[aria-label="航行速度"]');
    assert.ok(group);
    assert.deepEqual([...group.querySelectorAll('[data-speed-mark]')].map(mark => mark.textContent), ['缓慢', '快速', '极快']);
    assert.equal(group.querySelectorAll('button').length,0);
    assert.equal(slider.type,'range');assert.equal(slider.step,'0.001');
    for (const speed of ['fast', 'warp', 'slow']) {
      slider.value=String(SPEED_MARKS[speed]);slider.dispatchEvent(new fixture.window.Event('input'));
      assert.equal(environment.getState().speed, speed);
      assert.equal(environment.getState().mode, 'docked');
      assert.equal(environment.getState().yaw, 12);
      assert.equal(fixture.lastChange.speed, speed);
      assert.equal(slider.getAttribute('aria-valuetext').includes(group.querySelector(`[data-speed-mark="${speed}"]`).textContent),true);
      assert.equal(group.querySelectorAll('.dsc-is-active').length, 1);
      assert.equal(fixture.frames.size, 0);
    }
    assert.throws(() => environment.setSpeed('unknown'), TypeError);
  } finally { fixture.close(); }
});

test('fast advances farther than slow and warp produces long outward perspective trails', () => {
  const movement = {};
  const trailsBySpeed = {};
  for (const speed of ['slow', 'fast', 'warp']) {
    const fixture = environmentFixture({initialState:{mode:'cruise',speed}});
    try {
      fixture.environment.setSpeed(speed);
      const initial = fixture.paintedStars[0];
      trailsBySpeed[speed] = fixture.trails;
      fixture.runFrame(100);
      fixture.runFrame(140);
      const later = fixture.paintedStars[0];
      movement[speed] = Math.hypot(later.x - initial.x, later.y - initial.y);
      assert.equal(fixture.contextCount, 1, 'all speed effects share the same scene canvas');
    } finally { fixture.close(); }
  }
  assert.ok(movement.fast > movement.slow * 2);
  assert.ok(movement.warp > movement.fast * 2);
  assert.equal(trailsBySpeed.slow.length, 0);
  assert.ok(trailsBySpeed.fast.length > 0);
  assert.ok(trailsBySpeed.warp.length > 0);
  const lengths = speed => trailsBySpeed[speed].map(trail => Math.hypot(trail.to.x - trail.from.x, trail.to.y - trail.from.y)).sort((a, b) => a - b);
  const fast = lengths('fast');
  const warp = lengths('warp');
  assert.ok(warp[Math.floor(warp.length / 2)] > fast[Math.floor(fast.length / 2)] * 3);
  assert.ok(Math.max(...warp) > 60);
  for (const trail of trailsBySpeed.warp) {
    const from = { x: trail.from.x - 512, y: trail.from.y - 384 };
    const to = { x: trail.to.x - 512, y: trail.to.y - 384 };
    assert.ok(Math.abs(from.x * to.y - from.y * to.x) < 0.000001, 'trails share the forward vanishing point');
    assert.ok(Math.hypot(to.x, to.y) > Math.hypot(from.x, from.y), 'star trails extend away from the vanishing point');
  }
});

test('every speed settles to a parked scene and stays paused under reduced motion and disposal', () => {
  for (const speed of ['slow', 'fast', 'warp']) {
    const fixture = environmentFixture({ initialState: { mode: 'cruise', speed } });
    try {
      fixture.runFrame(100);
      fixture.runFrame(140);
      const stars = fixture.paintedStars;
      const trails = fixture.trails;
      fixture.environment.setMode('docked');
      assert.equal(fixture.frames.size, 1,'Parking decelerates instead of cutting off mid-warp');
      assert.deepEqual(fixture.paintedStars, stars);
      assert.deepEqual(fixture.trails, trails);
      fixture.settle();assert.equal(fixture.frames.size,0);
      assert.equal(fixture.trails.length,0,'Parked scenery has no frozen warp trails');
      assert.equal(readEnvironmentState(fixture.window.localStorage).speed, speed);
      fixture.setReduced(true);
      fixture.environment.setMode('cruise');
      assert.equal(fixture.frames.size, 0);
      assert.equal(fixture.environment.getState().speed, speed);
      fixture.setReduced(false);
      assert.equal(fixture.frames.size, 1);
      fixture.setHidden(true);
      assert.equal(fixture.frames.size, 0);
      fixture.setHidden(false);
      assert.equal(fixture.frames.size, 1);
      const speedSlider = fixture.environment.controls.querySelector('.dsc-speed-slider');
      fixture.environment.dispose();
      const changes = fixture.changes;
      speedSlider.value='1';speedSlider.dispatchEvent(new fixture.window.Event('input'));
      assert.equal(fixture.changes, changes);
      assert.equal(fixture.frames.size, 0);
    } finally { fixture.close(); }
  }
});

test('the shared starfield and panorama react together to view changes and cruise', () => {
  const fixture = environmentFixture();
  const { environment } = fixture;
  const nebula = environment.element.querySelector('.dsc-space-panorama');
  try {
    const initialStars = fixture.paintedStars;
    const initialPanorama = nebula.style.transform;
    environment.setView({ yaw: 18, pitch: -12, distance: 1.4 });
    assert.deepEqual(fixture.paintedStars, initialStars,'Cabin yaw/pitch are not a second external sky camera');
    assert.equal(nebula.style.transform, initialPanorama);
    assert.ok(fixture.paintedStars.every(star => star.radius <= 1.75), 'the scene contains only projected stars');
    const movedStars = fixture.paintedStars;
    const movedPanorama = nebula.style.transform;
    environment.setMode('cruise');
    fixture.runFrame(100);
    fixture.runFrame(140);
    assert.notDeepEqual(fixture.paintedStars, movedStars);
    assert.notEqual(nebula.style.transform, movedPanorama);
  } finally { fixture.close(); }
});

test('saved docked remains static; cruise pauses while hidden or reduced motion is requested', () => {
  const fixture = environmentFixture({ initialState: { mode: 'docked' } });
  const { environment, frames } = fixture;
  try {
    assert.equal(frames.size, 0, 'docked draws once without scheduling frames');
    assert.equal(environment.getState().mode, 'docked', 'respect the saved mode');
    environment.setMode('cruise');
    assert.equal(frames.size, 1);
    const before = fixture.draws;
    fixture.runFrame(100);
    fixture.runFrame(140);
    assert.ok(fixture.draws > before, 'cruise paints a later frame');
    assert.equal(frames.size, 1, 'only one animation chain');
    fixture.setHidden(true);
    assert.equal(frames.size, 0);
    fixture.setHidden(false);
    assert.equal(frames.size, 1);
    fixture.setReduced(true);
    assert.equal(frames.size, 0);
    assert.equal(environment.getState().mode, 'cruise');
    fixture.setReduced(false);
    assert.equal(frames.size, 1);
    environment.setMode('docked');
    fixture.settle();
    assert.equal(frames.size, 0);
  } finally { fixture.close(); }
});

test('new environments cruise by default and parking smoothly settles without resetting the panorama', () => {
  const fixture = environmentFixture();
  const { environment } = fixture;
  try {
    assert.equal(environment.getState().mode, 'cruise');
    assert.equal(fixture.frames.size, 1);
    fixture.runFrame(100);
    fixture.runFrame(140);
    const scene = environment.element.querySelector('.dsc-space-panorama').style.transform;
    const stars = fixture.paintedStars;
    environment.setMode('docked');
    assert.equal(fixture.frames.size, 1);
    assert.equal(environment.element.querySelector('.dsc-space-panorama').style.transform, scene);
    assert.deepEqual(fixture.paintedStars, stars);
    fixture.settle();assert.equal(fixture.frames.size,0);
    const parked=fixture.paintedStars;fixture.runFrame(20000);assert.deepEqual(fixture.paintedStars,parked);
    const stored = readEnvironmentState(fixture.window.localStorage);
    assert.equal(stored.mode, 'docked');
  } finally { fixture.close(); }
});

test('reduced motion suppresses persisted initial cruise and controls remain functional', () => {
  const fixture = environmentFixture({ reduced: true, initialState: { mode: 'cruise' } });
  try {
    assert.equal(fixture.environment.getState().mode, 'cruise');
    fixture.environment.setView({ yaw: 12, distance: 1.2 });
    assert.equal(fixture.frames.size, 0);
    assert.equal(fixture.environment.getState().yaw, 12);
    assert.match(fixture.environment.controls.textContent, /减少动态效果/);
  } finally { fixture.close(); }
});

test('only the dedicated pad captures camera input, leaving the native chat intact', () => {
  const fixture = environmentFixture();
  const { environment, window } = fixture;
  const pad = environment.controls.querySelector('.dsc-look-pad');
  const chat = window.document.querySelector('#chat');
  try {
    fixture.pointer(chat, 'pointerdown', 0, 0);
    fixture.pointer(chat, 'pointermove', 200, 200);
    chat.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(environment.getState().yaw, 0);
    fixture.pointer(pad, 'pointerdown', 0, 0);
    fixture.pointer(pad, 'pointermove', 1000, -1000);
    fixture.runFrame(100);
    assert.deepEqual(clampView(environment.getState()), {yaw: 60, pitch: 60, distance: 1 });
    fixture.pointer(pad, 'pointerup', 1000, -1000);
    environment.reset();
    pad.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    pad.dispatchEvent(new window.KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
    assert.equal(environment.getState().yaw, 3);
    assert.equal(environment.getState().distance, 0.95);
    assert.equal(environment.element.style.pointerEvents, 'none');
    assert.equal(environment.element.style.position, 'fixed');
    assert.equal(environment.element.style.zIndex, '0');
    assert.equal(environment.element.parentElement.style.zIndex, '-1');
    assert.ok(chat.isConnected);
  } finally { fixture.close(); }
});

test('dispose cancels animation, removes controls and detaches every interaction path', () => {
  const fixture = environmentFixture();
  const { environment, window } = fixture;
  const cruise = environment.controls.querySelector('[data-mode="cruise"]');
  const pad = environment.controls.querySelector('.dsc-look-pad');
  const canvas = environment.element.querySelector('canvas');
  environment.setMode('cruise');
  environment.dispose();
  const changes = fixture.changes;
  const draws = fixture.draws;
  const canvasWidth = canvas.width;
  cruise.click();
  pad.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  window.innerWidth = 700;
  window.dispatchEvent(new window.Event('resize'));
  fixture.setHidden(false);
  fixture.setReduced(false);
  assert.equal(fixture.frames.size, 0);
  assert.equal(fixture.motionListeners.size, 0);
  assert.equal(fixture.changes, changes);
  assert.equal(fixture.draws, draws);
  assert.equal(canvas.width, canvasWidth);
  assert.equal(environment.element.isConnected, false);
  assert.equal(environment.controls.isConnected, false);
  assert.ok(window.document.querySelector('#chat').isConnected);
  assert.doesNotThrow(() => environment.dispose());
  fixture.close();
});

test('continuous throttle keeps the three named bands and monotonically controls actual travel',()=>{
  assert.equal(speedForThrottle(0),'slow');assert.equal(speedForThrottle(.32),'slow');
  assert.equal(speedForThrottle(.34),'fast');assert.equal(speedForThrottle(.79),'fast');
  assert.equal(speedForThrottle(.8),'warp');assert.equal(speedForThrottle(1),'warp');
  let previous=0;
  for(let i=0;i<=1000;i++){
    const profile=profileForThrottle(i/1000);
    assert.ok(profile.velocity>=previous);previous=profile.velocity;
    assert.ok(profile.warp>=0&&profile.warp<=1);
  }
  const fixture=environmentFixture({initialState:{mode:'docked'}});
  try{
    fixture.environment.setThrottle(.615);fixture.flushStorage();
    assert.equal(fixture.environment.getState().throttle,.615);
    assert.equal(readEnvironmentState(fixture.window.localStorage).throttle,.615);
    fixture.environment.setSpeed('warp');assert.equal(fixture.environment.getState().throttle,1);
    assert.throws(()=>fixture.environment.setThrottle(NaN),TypeError);
    fixture.environment.setThrottle(99);assert.equal(fixture.environment.getState().throttle,1);
  }finally{fixture.close();}
});

test('camera input coalesces to one display frame without repainting space or writing storage per pointermove',()=>{
  const fixture=environmentFixture({initialState:{mode:'docked'}});
  const pad=fixture.environment.controls.querySelector('.dsc-look-pad');
  try{
    const draws=fixture.draws;
    fixture.pointer(pad,'pointerdown',0,0);
    for(let i=1;i<=24;i++)fixture.pointer(pad,'pointermove',i,-i);
    assert.equal(fixture.frames.size,1);assert.equal(fixture.changes,0);assert.equal(fixture.storageWrites,0);
    fixture.runFrame(1000/144);
    assert.equal(fixture.changes,1);assert.equal(fixture.kinds[0],'view');
    assert.equal(fixture.environment.getState().yaw,24*.28);
    assert.equal(fixture.draws,draws,'camera has no dependency on repainting star particles');
    assert.equal(fixture.storageWrites,0);assert.equal(fixture.timers.size,1);
    fixture.pointer(pad,'pointerup',24,-24);
    assert.equal(fixture.storageWrites,1);assert.equal(fixture.timers.size,0);
  }finally{fixture.close();}
});

test('animation renders every display refresh including 144 Hz, with only one rAF chain',()=>{
  const fixture=environmentFixture();
  try{
    const before=fixture.draws;
    for(let i=0;i<145;i++){
      fixture.runFrame(i*1000/144);assert.equal(fixture.frames.size,1);
    }
    assert.equal(fixture.draws-before,145,'no 30 or 60 FPS throttle');
    assert.equal(fixture.storageWrites,0,'rendering never persists unchanged preferences');
  }finally{fixture.close();}
});

test('wheel zoom belongs to exposed cabin and the compact look control, never native content or zoom gestures',()=>{
  const fixture=environmentFixture({initialState:{mode:'docked'}}),{window,environment}=fixture;
  const wheel=(target,options={})=>{
    const event=new window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100,...options});
    target.dispatchEvent(event);return event;
  };
  const pane=window.document.createElement('div');pane.dataset.dscScreen='command';
  const paragraph=window.document.createElement('p');pane.append(paragraph);window.document.body.append(pane);
  const pad=environment.controls.querySelector('.dsc-look-pad');
  try{
    assert.equal(wheel(window.document.querySelector('#chat')).defaultPrevented,false);
    assert.equal(wheel(paragraph).defaultPrevented,false);
    assert.equal(wheel(window.document.body,{ctrlKey:true}).defaultPrevented,false);
    assert.equal(environment.getState().distance,1);
    assert.equal(wheel(window.document.body).defaultPrevented,true);fixture.runFrame(10);
    assert.equal(environment.getState().distance,1.08);
    assert.equal(wheel(pad,{deltaY:-100}).defaultPrevented,true);fixture.runFrame(20);
    assert.equal(environment.getState().distance,1);
    for(let i=0;i<40;i++)wheel(pad);fixture.runFrame(30);
    assert.equal(environment.getState().distance,1.6);
    assert.equal(environment.controls.querySelectorAll('input[type=range]').length,1,'speed is the only remaining range control');
  }finally{fixture.close();}
});

const SCENES=['a','b','c','d'].map(id=>({id,label:`Star ${id}`,url:`/${id}.webp`,credit:'NASA',source:'https://science.nasa.gov/'}));
const settleLoads=()=>new Promise(resolve=>setImmediate(resolve));
function advance(fixture,from,to,step=1000/144){
  for(let time=from;time<to;time+=step){fixture.runFrame(time);assert.ok(fixture.frames.size<=1,'one animation chain during transitions');}
  fixture.runFrame(to);
}

test('extreme travel longer than five visible seconds fades to a decoded different scene then returns to fast',async()=>{
  const fixture=environmentFixture({scenes:SCENES,random:()=>.45,preloadScene:async()=>({decoded:true}),initialState:{mode:'cruise',speed:'warp'}});
  try{
    await settleLoads();fixture.runFrame(0);advance(fixture,7,4999);
    assert.equal(fixture.environment.getState().sceneId,'a');assert.equal(fixture.environment.getState().transitioning,false);
    fixture.runFrame(5001);assert.equal(fixture.environment.getState().transitioning,true);
    const layers=[...fixture.environment.element.querySelectorAll('.dsc-space-nebula')];
    advance(fixture,5008,5800);
    assert.ok(Number(layers[2].style.opacity)>0&&Number(layers[2].style.opacity)<1);
    assert.equal(layers[0].style.opacity,'1','old scenery fills every pixel beneath the incoming sky');
    assert.equal(fixture.environment.getState().speed,'warp');
    advance(fixture,5807,6700);
    assert.equal(fixture.environment.getState().sceneId,'c');
    assert.equal(fixture.environment.getState().scene.label,'Star c');
    assert.equal(fixture.environment.getState().speed,'fast');assert.equal(fixture.environment.getState().throttle,SPEED_MARKS.fast);
    assert.equal(fixture.environment.getState().transitioning,false);
    const count=fixture.kinds.filter(kind=>kind==='scene').length;
    advance(fixture,6707,15000);assert.equal(fixture.kinds.filter(kind=>kind==='scene').length,count,'fast travel cannot immediately retrigger');
    fixture.flushStorage();assert.equal(readEnvironmentState(fixture.window.localStorage).sceneId,'c');
  }finally{fixture.close();}
});

test('random transition covers every other scene uniformly and excludes the current scene',async()=>{
  for(const [sample,expected] of [[0,'a'],[1/3,'b'],[2/3,'d'],[1,'d']]){
    const fixture=environmentFixture({scenes:SCENES,initialScene:'c',random:()=>sample,preloadScene:async()=>({}),initialState:{mode:'cruise',speed:'warp'}});
    try{
      await settleLoads();fixture.runFrame(0);advance(fixture,50,6700,50);
      assert.equal(fixture.environment.getState().sceneId,expected);
    }finally{fixture.close();}
  }
});

test('every successive warp transition composites the incoming sky above the opaque current sky',async()=>{
  const fixture=environmentFixture({scenes:SCENES,random:()=>0,preloadScene:async()=>({}),initialState:{mode:'cruise',speed:'warp'}});
  try{
    await settleLoads();fixture.runFrame(0);let now=0;
    const persistentLayers=[...fixture.environment.element.querySelectorAll('.dsc-space-nebula')];
    assert.equal(persistentLayers.length,4,'all catalog backgrounds are prepared before flight transitions');
    for(const layer of persistentLayers){
      const image=layer.style.backgroundImage;
      Object.defineProperty(layer.style,'backgroundImage',{configurable:true,get:()=>image,set:()=>{throw new Error('scene URL must not be parsed in a flight frame');}});
    }
    for(let jump=0;jump<3;jump++){
      fixture.environment.setSpeed('warp');advance(fixture,now+10,now+5800,10);
      const layers=[...fixture.environment.element.querySelectorAll('.dsc-space-nebula')];
      const incoming=layers.find(layer=>Number(layer.style.opacity)>0&&Number(layer.style.opacity)<1);
      assert.ok(incoming,`jump ${jump+1} is mid-crossfade`);
      const visible=layers.filter(layer=>Number(layer.style.opacity)>0);
      const top=visible.map(layer=>({layer,index:layers.indexOf(layer),z:Number(layer.style.zIndex)||0}))
        .sort((a,b)=>a.z-b.z||a.index-b.index).at(-1).layer;
      assert.equal(top,incoming,`jump ${jump+1}: incoming scene must actually be visible, not behind opaque old scene`);
      assert.ok(visible.some(layer=>layer!==incoming&&layer.style.opacity==='1'),'continuous opaque coverage prevents black frames');
      advance(fixture,now+5810,now+6800,10);assert.equal(fixture.environment.getState().speed,'fast');now+=6800;
    }
  }finally{fixture.close();}
});

test('reduced motion cancels a partially composited hop and retains the current opaque scene',async()=>{
  const fixture=environmentFixture({scenes:SCENES,random:()=>0,preloadScene:async()=>({}),initialState:{mode:'cruise',speed:'warp'}});
  try{
    await settleLoads();fixture.runFrame(0);advance(fixture,50,5800,50);
    assert.equal(fixture.environment.getState().transitioning,true);
    fixture.setReduced(true);
    const visible=[...fixture.environment.element.querySelectorAll('.dsc-space-nebula')].filter(layer=>Number(layer.style.opacity)>0);
    assert.equal(visible.length,1);assert.equal(visible[0].dataset.sceneId,'a');assert.equal(visible[0].style.opacity,'1');
    assert.equal(fixture.environment.getState().sceneId,'a');assert.equal(fixture.environment.getState().transitioning,false);
    assert.equal(fixture.frames.size,0);
  }finally{fixture.close();}
});

test('leaving extreme speed resets dwell and hidden time does not advance or skip a transition',async()=>{
  const fixture=environmentFixture({scenes:SCENES,preloadScene:async()=>({}),initialState:{mode:'cruise',speed:'warp'}});
  try{
    await settleLoads();fixture.runFrame(0);advance(fixture,50,4000,50);
    fixture.environment.setSpeed('fast');fixture.environment.setSpeed('warp');
    advance(fixture,4050,8000,50);assert.equal(fixture.environment.getState().transitioning,false);
    fixture.setHidden(true);assert.equal(fixture.frames.size,0);
    fixture.runFrame(30000);fixture.setHidden(false);fixture.runFrame(31000);
    assert.equal(fixture.environment.getState().transitioning,false);
    advance(fixture,31050,32001,50);assert.equal(fixture.environment.getState().transitioning,true);
    fixture.setHidden(true);const state=fixture.environment.getState();fixture.runFrame(90000);
    assert.equal(fixture.environment.getState().sceneId,state.sceneId);
    fixture.setHidden(false);fixture.runFrame(91000);advance(fixture,91050,92700,50);
    assert.equal(fixture.environment.getState().speed,'fast');
  }finally{fixture.close();}
});

test('new scenery waits for decode, failures retain the old sky, and disposal invalidates pending loads',async()=>{
  let resolveScene, fail=false;
  const fixture=environmentFixture({scenes:SCENES.slice(0,2),random:()=>0,
    preloadScene:scene=>scene.id==='a'?Promise.resolve({}):fail?Promise.reject(new Error('test unavailable')):new Promise(resolve=>{resolveScene=resolve;}),
    initialState:{mode:'cruise',speed:'warp'}});
  try{
    await settleLoads();fixture.runFrame(0);advance(fixture,100,5100,100);
    assert.equal(fixture.environment.getState().transitioning,false);
    assert.equal(fixture.environment.getState().sceneId,'a');
    assert.equal(fixture.environment.element.querySelectorAll('.dsc-space-nebula')[0].style.opacity,'1');
    fixture.environment.dispose();const changes=fixture.changes;
    resolveScene({});await settleLoads();
    assert.equal(fixture.changes,changes);assert.equal(fixture.frames.size,0);
  }finally{fixture.close();}
  const failed=environmentFixture({scenes:SCENES.slice(0,2),random:()=>0,preloadScene:async scene=>{if(scene.id==='b')throw new Error('decode failed');return{};},initialState:{mode:'cruise',speed:'warp'}});
  try{
    await settleLoads();failed.runFrame(0);advance(failed,100,5100,100);await settleLoads();
    assert.equal(failed.environment.getState().sceneId,'a');assert.equal(failed.environment.getState().transitioning,false);
    assert.match(failed.environment.controls.textContent,/加载失败/);
  }finally{failed.close();}
});

test('reduced motion prevents automatic warp changes and manual changes during a fade take precedence',async()=>{
  const reduced=environmentFixture({reduced:true,scenes:SCENES,preloadScene:async()=>({}),initialState:{mode:'cruise',speed:'warp'}});
  try{await settleLoads();reduced.runFrame(20000);assert.equal(reduced.frames.size,0);assert.equal(reduced.environment.getState().sceneId,'a');}
  finally{reduced.close();}
  const fixture=environmentFixture({scenes:SCENES,random:()=>0,preloadScene:async()=>({}),initialState:{mode:'cruise',speed:'warp'}});
  try{
    await settleLoads();fixture.runFrame(0);advance(fixture,100,5100,100);
    fixture.environment.setSpeed('slow');advance(fixture,5200,6900,100);
    assert.equal(fixture.environment.getState().speed,'slow');assert.equal(fixture.environment.getState().sceneId,'b');
  }finally{fixture.close();}
});
