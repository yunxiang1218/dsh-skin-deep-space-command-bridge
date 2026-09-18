import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightDrift } from '../src/client/flight-drift.js';

const seeded = () => { let seed = 417; return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); };
test('random flight visits all four directions with comparable vertical and horizontal motion', () => {
  const flight = createFlightDrift({ random: seeded() });
  let before = flight.advance(0), minX = 0, maxX = 0, minY = 0, maxY = 0;
  const directions = new Set();
  for (let frame = 0; frame < 144 * 300; frame++) {
    const p = flight.advance(1 / 144);
    assert.ok(Math.abs(p.x) <= 3 && Math.abs(p.y) <= 3, 'never reveals an overscan edge');
    if (p.x - before.x > .0001) directions.add('right');
    if (p.x - before.x < -.0001) directions.add('left');
    if (p.y - before.y > .0001) directions.add('down');
    if (p.y - before.y < -.0001) directions.add('up');
    assert.ok(Math.hypot(p.x - before.x, p.y - before.y) < .014, 'no waypoint jumps');
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); before = p;
  }
  assert.equal(directions.size, 4);
  assert.ok(maxX - minX > 4 && maxY - minY > 4);
});
test('flight is frame-rate independent and a stopped clock preserves its position', () => {
  const a = createFlightDrift({ random: seeded() }), b = createFlightDrift({ random: seeded() });
  let result;
  for (let i = 0; i < 14400; i++) result = a.advance(1 / 144);
  const single = b.advance(100);
  assert.ok(Math.hypot(result.x - single.x, result.y - single.y) < 1e-9);
  assert.deepEqual(a.advance(0), result);
  assert.deepEqual(a.advance(NaN), result);
});
test('random turns have continuous velocity and acceleration', () => {
  let n = 0;
  const flight = createFlightDrift({ random: () => [1, 1, 0, 0, 0, 0][n++ % 6] });
  const before = flight.advance(7.999), join = flight.advance(.001), after = flight.advance(.001);
  assert.ok(Math.hypot(join.x - before.x, join.y - before.y) < 1e-8);
  assert.ok(Math.hypot(after.x - join.x, after.y - join.y) < 1e-8);
});
