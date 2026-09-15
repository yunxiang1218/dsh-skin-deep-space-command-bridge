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
    const nebula = environment.element.querySelector('.dsc-space-nebula');
    const originalTransform = nebula.style.transform;
    const originalStars = fixture.paintedStars;
    const originalTrails = fixture.trails;
    for (const distance of [0.7, 1.6]) {
      environment.setView({ distance });
      assert.equal(environment.getState().distance, distance);
      assert.equal(fixture.lastChange.distance, distance);
      assert.equal(readEnvironmentState(fixture.window.localStorage).distance, distance);
      assert.equal(environment.controls.querySelector('.dsc-distance-value').textContent, `${distance.toFixed(2)}×`);
      assert.equal(environment.controls.querySelector('.dsc-distance-slider').getAttribute('aria-label'), '观察距离');
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
  assert.deepEqual(readEnvironmentState(storage), { mode: 'cruise', speed: 'slow', yaw: 42, pitch: -17, distance: 0.8 });
  data.set(SPACE_STORAGE_KEY, JSON.stringify({ mode: 'unknown', yaw: 300, pitch: -400, distance: 99 }));
  assert.deepEqual(readEnvironmentState(storage), { mode: 'cruise', speed: 'slow', yaw: 60, pitch: -60, distance: 1.6 });
  data.set(SPACE_STORAGE_KEY, 'not json');
  assert.deepEqual(readEnvironmentState(storage), { mode: 'cruise', speed: 'slow', yaw: 0, pitch: 0, distance: 1 });
});

test('speed storage supports all three levels and migrates old saved preferences', () => {
  let saved = JSON.stringify({ mode: 'docked', yaw: 14, pitch: 5, distance: 1.2 });
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  assert.deepEqual(readEnvironmentState(storage), { mode: 'docked', speed: 'slow', yaw: 14, pitch: 5, distance: 1.2 });
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

function environmentFixture({ reduced = false, initialState } = {}) {
  const dom = new JSDOM('<body><div class="dsc-stage" style="z-index:-1"></div><textarea id="chat"></textarea></body>', {
    url: 'https://dsh.test', pretendToBeVisual: true,
  });
  const { window } = dom;
  if (initialState) writeEnvironmentState(window.localStorage, initialState);
  const frames = new Map();
  let frameId = 0;
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
  Object.defineProperty(window.document, 'hidden', { get: () => hidden });
  const environment = createSpaceEnvironment(window.document.querySelector('.dsc-stage'), {
    backgroundUrl: '/resource/nebula.jpg',
    onChange: state => { changes++; lastChange = state; },
  });
  window.document.body.append(environment.controls);
  return {
    window, environment, frames, motionListeners,
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
    settle() { for(let time=240;time<=15240;time+=100)this.runFrame(time); },
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
  const nebula = environment.element.querySelector('.dsc-space-nebula');
  try {
    assert.equal(environment.element.querySelectorAll('.dsc-space-nebula').length, 1);
    assert.equal(environment.element.querySelectorAll('canvas').length, 1);
    assert.equal(fixture.contextCount, 1, 'only the full-scene star canvas is created');
    assert.equal(nebula.style.backgroundSize, 'cover');
    const span = 1 - 2 * parseFloat(nebula.style.inset) / 100;
    for (const yaw of [-60, 60]) for (const pitch of [-60, 60]) for (const distance of [0.7, 1.6]) {
      environment.setView({ yaw, pitch, distance });
      const transform = nebula.style.transform.match(/translate\(([-\d.]+)%, ([-\d.]+)%\) scale\(([-\d.]+)\)/);
      assert.ok(transform);
      const scale = Number(transform[3]);
      for (const translation of transform.slice(1, 3).map(Number)) {
        const center = 0.5 + translation / 100 * span;
        assert.ok(center - span * scale / 2 <= 0, 'panorama must extend beyond the near edge');
        assert.ok(center + span * scale / 2 >= 1, 'panorama must extend beyond the far edge');
      }
      for (const seconds of [30, 66, 132, 198, 300]) {
        const panorama = getPanoramaTransform({ yaw, pitch, distance }, seconds);
        for (const translation of [panorama.x, panorama.y]) {
          const center = 0.5 + translation / 100 * span;
          assert.ok(center - span * panorama.scale / 2 <= 0, 'cruise must retain near-edge coverage');
          assert.ok(center + span * panorama.scale / 2 >= 1, 'cruise must retain far-edge coverage');
        }
      }
    }
  } finally { fixture.close(); }
});

test('speed controls select and announce each speed without changing the camera or mode', () => {
  const fixture = environmentFixture({ initialState: { mode: 'docked', yaw: 12 } });
  const { environment } = fixture;
  try {
    const group = environment.controls.querySelector('[aria-label="航行速度"]');
    assert.ok(group);
    assert.deepEqual([...group.querySelectorAll('button')].map(button => button.textContent), ['缓慢', '快速', '极快']);
    for (const speed of ['fast', 'warp', 'slow']) {
      const button = group.querySelector(`[data-speed="${speed}"]`);
      button.click();
      assert.equal(environment.getState().speed, speed);
      assert.equal(environment.getState().mode, 'docked');
      assert.equal(environment.getState().yaw, 12);
      assert.equal(fixture.lastChange.speed, speed);
      assert.equal(button.getAttribute('aria-pressed'), 'true');
      assert.equal(group.querySelectorAll('[aria-pressed="true"]').length, 1);
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
      const speedButton = fixture.environment.controls.querySelector('[data-speed="warp"]');
      fixture.environment.dispose();
      const changes = fixture.changes;
      speedButton.click();
      assert.equal(fixture.changes, changes);
      assert.equal(fixture.frames.size, 0);
    } finally { fixture.close(); }
  }
});

test('the shared starfield and panorama react together to view changes and cruise', () => {
  const fixture = environmentFixture();
  const { environment } = fixture;
  const nebula = environment.element.querySelector('.dsc-space-nebula');
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
    const scene = environment.element.querySelector('.dsc-space-nebula').style.transform;
    const stars = fixture.paintedStars;
    environment.setMode('docked');
    assert.equal(fixture.frames.size, 1);
    assert.equal(environment.element.querySelector('.dsc-space-nebula').style.transform, scene);
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
    assert.deepEqual(environment.getState(), { mode: 'cruise', speed: 'slow', yaw: 60, pitch: 60, distance: 1 });
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
