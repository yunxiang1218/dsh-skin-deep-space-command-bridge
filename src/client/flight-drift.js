/** Random, bounded C2-continuous flight paths, expressed as panorama percentages.
 * The clock is supplied by the flight controller, so pause and speed easing also
 * apply to the scenery. Randomness is independent of destination selection.
 */
export function createFlightDrift({ random = Math.random } = {}) {
  const unit = () => Math.max(0, Math.min(1, Number(random()) || 0));
  const waypoint = () => ({ x: (unit() * 2 - 1) * 3, y: (unit() * 2 - 1) * 3 });
  let from = { x: 0, y: 0 }, to = waypoint(), duration = 8 + unit() * 10, elapsed = 0;
  let position = { ...from };
  return {
    advance(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return { ...position };
      elapsed += seconds;
      while (elapsed >= duration) {
        elapsed -= duration; from = to; to = waypoint(); duration = 8 + unit() * 10;
      }
      const t = elapsed / duration;
      // Zero velocity and acceleration at joins: turns never snap or bounce.
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      position = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
      return { ...position };
    },
  };
}
