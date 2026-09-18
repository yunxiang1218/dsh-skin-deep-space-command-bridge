// Batched GPU particles. The photographs stay in CSS layers so decoding and scene
// crossfades never upload large textures during a flight frame.
const FULLSCREEN_VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  uv = (p + 1.0) * 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;
const VEIL_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform vec2 resolution;
uniform vec2 heading;
uniform float warp;
out vec4 color;
void main() {
  float r = length((uv - 0.5) * resolution - heading) / max(resolution.x * 0.45, resolution.y * 0.9);
  float glow = exp(-pow((r - 0.12) * 5.0, 2.0));
  float core = exp(-r * 15.0);
  vec3 sky = vec3(0.008, 0.032, 0.09) + vec3(0.038, 0.125, 0.28) * glow + vec3(0.15, 0.20, 0.24) * core;
  float alpha = 0.89 * warp;
  color = vec4(sky * alpha, alpha);
}`;
const PARTICLE_VERTEX = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 corner;
layout(location=1) in vec3 position;
layout(location=2) in vec4 properties;
uniform vec2 resolution;
uniform vec2 heading;
uniform float focal;
uniform float travel;
uniform float trail;
uniform float brightness;
uniform float warp;
uniform int kind;
out vec2 shape;
out float intensity;
out vec3 tint;
void main() {
  bool ray = kind == 2;
  float depth = ray ? 6.0 + mod(position.z - travel, 114.0) : mod(position.z - travel + 110.0, 220.0) - 110.0;
  vec2 xy = position.xy;
  if (ray) xy.x *= max(1.0, resolution.x / resolution.y);
  float scale = focal / max(depth, 0.15);
  vec2 head = xy * scale;
  float radius = clamp(properties.x * scale, 0.35, 1.75);
  intensity = properties.y * min(1.0, max(0.0, depth) / 3.0) * brightness;
  tint = (properties.z > 0.5 && warp < 0.5) ? vec3(0.94, 0.86, 0.74) : vec3(0.79, 0.88, 0.98);
  shape = corner;
  vec2 pixel;
  if (kind == 0) {
    pixel = head + corner * max(1.1, radius * 3.5);
  } else {
    float lengthZ = ray ? properties.w : trail;
    vec2 tail = xy * focal / max(depth + lengthZ, 0.15);
    vec2 direction = head - tail;
    float lengthPx = max(length(direction), 0.01);
    vec2 normal = vec2(-direction.y, direction.x) / lengthPx;
    float halfWidth = ray ? (0.9 + properties.y * 1.3) * 2.3 : (0.45 + radius * 0.45) * (1.0 + warp * 1.3) * 1.8;
    shape.x = (corner.x + 1.0) * 0.5;
    pixel = mix(tail, head, shape.x) + normal * corner.y * halfWidth;
    if (ray) {
      intensity = properties.y * min(1.0, min((depth - 6.0) / 9.0, (120.0 - depth) / 9.0)) * warp;
      tint = vec3(0.86, 0.96, 1.0);
    } else if (lengthZ < 0.001) intensity = 0.0;
  }
  if (depth <= 0.15) {
    intensity = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  } else {
    gl_Position = vec4((pixel + heading) * 2.0 / resolution, 0.0, 1.0);
  }
}`;
const PARTICLE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec2 shape;
in float intensity;
in vec3 tint;
uniform int kind;
out vec4 color;
void main() {
  float light;
  vec3 hue = tint;
  if (kind == 0) {
    float r2 = dot(shape, shape);
    float core = exp(-r2 * 29.0);
    float halo = 0.13 * exp(-r2 * 5.0);
    float cross = 0.045 * exp(-min(abs(shape.x), abs(shape.y)) * 60.0) * (1.0 - smoothstep(0.25, 1.0, length(shape)));
    light = core + halo + cross;
  } else {
    float beam = exp(-shape.y * shape.y * 28.0) + 0.16 * exp(-shape.y * shape.y * 4.5);
    float along = smoothstep(0.0, 0.75, shape.x) * (1.0 - smoothstep(0.98, 1.0, shape.x));
    light = beam * along;
    if (kind == 2) hue = mix(vec3(0.22, 0.47, 1.0), tint, smoothstep(0.25, 1.0, shape.x));
  }
  float alpha = clamp(light * intensity, 0.0, 1.0);
  color = vec4(hue * alpha, alpha);
}`;

/** Returns null when GPU rendering is unavailable; callers retain the 2D fallback. */
export function createSpaceParticles(document, { stars, rays, onAvailability } = {}) {
  const window = document.defaultView;
  if (!window.WebGL2RenderingContext) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'dsc-space-canvas dsc-space-canvas-gpu';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  let disposed = false, available = false, resources = null, width = 1, height = 1, ratio = 1;
  const starData = new Float32Array(stars.flatMap(star => [star.x, star.y, star.z, star.radius, star.brightness, Number(star.warm), 0]));
  const rayData = new Float32Array(rays.flatMap(ray => [Math.cos(ray.angle) * ray.spread, Math.sin(ray.angle) * ray.spread,
    ray.depth, 0, ray.strength, 0, ray.length]));

  function free() {
    if (!resources) return;
    for (const object of resources.programs) gl.deleteProgram(object);
    for (const object of resources.shaders) gl.deleteShader(object);
    for (const object of resources.buffers) gl.deleteBuffer(object);
    for (const object of resources.arrays) gl.deleteVertexArray(object);
    resources = null;
  }
  function compile(type, source) {
    const shader = gl.createShader(type); resources.shaders.push(shader);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Particle shader failed');
    return shader;
  }
  function program(vertex, fragment, names) {
    const program = gl.createProgram(); resources.programs.push(program);
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Particle program failed');
    return { program, uniforms: Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) };
  }
  function buffer(data) {
    const value = gl.createBuffer(); resources.buffers.push(value);
    gl.bindBuffer(gl.ARRAY_BUFFER, value); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return value;
  }
  function vertexArray(corners, data) {
    const array = gl.createVertexArray(); resources.arrays.push(array); gl.bindVertexArray(array);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    buffer(data);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null); return array;
  }
  function initialize() {
    resources = { programs: [], shaders: [], buffers: [], arrays: [] };
    try {
      resources.veil = program(FULLSCREEN_VERTEX, VEIL_FRAGMENT, ['resolution', 'heading', 'warp']);
      resources.particles = program(PARTICLE_VERTEX, PARTICLE_FRAGMENT, ['resolution', 'heading', 'focal', 'travel', 'trail', 'brightness', 'warp', 'kind']);
      const corners = buffer(new Float32Array([-1,-1, 1,-1, -1,1, 1,1]));
      resources.starArray = vertexArray(corners, starData); resources.rayArray = vertexArray(corners, rayData);
      resources.fullscreenArray = gl.createVertexArray(); resources.arrays.push(resources.fullscreenArray);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.clearColor(0,0,0,0);
      available = true; resize(width, height, ratio); return true;
    } catch (error) {
      console.warn('[Deep Space Bridge] GPU particles unavailable; using Canvas:',error.message);
      free(); available = false; return false;
    }
  }
  function resize(nextWidth, nextHeight, nextRatio) {
    width = nextWidth; height = nextHeight; ratio = nextRatio;
    const w = Math.round(width * ratio), h = Math.round(height * ratio);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    if (available) gl.viewport(0, 0, w, h);
  }
  function render(profile, travel, focal, heading = { x: 0, y: 0 }) {
    if (!available || disposed) return false;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (profile.warp > .001) {
      const { program, uniforms } = resources.veil;
      gl.useProgram(program); gl.bindVertexArray(resources.fullscreenArray);
      gl.uniform2f(uniforms.resolution, width, height); gl.uniform1f(uniforms.warp, profile.warp);
      gl.uniform2f(uniforms.heading, heading.x, -heading.y);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const { program, uniforms } = resources.particles;
    gl.useProgram(program); gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform2f(uniforms.resolution, width, height); gl.uniform1f(uniforms.focal, focal);
    gl.uniform2f(uniforms.heading, heading.x, -heading.y);
    gl.uniform1f(uniforms.travel, travel); gl.uniform1f(uniforms.trail, profile.trail);
    gl.uniform1f(uniforms.brightness, profile.brightness); gl.uniform1f(uniforms.warp, profile.warp);
    gl.bindVertexArray(resources.starArray);
    if (profile.trail > .001) {
      gl.uniform1i(uniforms.kind, 1); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stars.length);
    }
    gl.uniform1i(uniforms.kind, 0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stars.length);
    if (profile.warp > .001) {
      gl.bindVertexArray(resources.rayArray); gl.uniform1i(uniforms.kind, 2);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rays.length);
    }
    gl.bindVertexArray(null); return true;
  }
  const lost = event => {
    event.preventDefault(); available = false; canvas.hidden = true;
    onAvailability?.(false);
  };
  const restored = () => {
    if (disposed) return;
    // A restored WebGL context has fresh resource identities and empty state.
    resources = null;
    const success = initialize(); canvas.hidden = !success; onAvailability?.(success);
  };
  if (!initialize()) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
  return { canvas, resize, render, get available() { return available; }, dispose() {
    if (disposed) return;
    disposed = true; available = false;
    canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
    free(); gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove();
  } };
}
