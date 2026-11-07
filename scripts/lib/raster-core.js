// raster-core.js
// A small CPU rasterizer used by the homepage study and by tools/render-hero-frame.mjs.
// It follows the same pipeline as Rasterix (Java): rotate, view, project, divide,
// map to the viewport, cull back faces, shade, fill with barycentric weights, depth test.
// No DOM access here, so it runs in the browser and in Node.

export const MODES = ['vertices', 'wireframe', 'shaded'];

// Quaternion helpers: q = [w, x, y, z]
function quatFromAxisAngle(ax, ay, az, angle) {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), ax * s, ay * s, az * s];
}
function quatMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
function quatToMatrix(q) {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

// Perspective matrix in the same form as the Rasterix README:
// [f/aspect 0 0 0; 0 f 0 0; 0 0 -(F+N)/(F-N) -2FN/(F-N); 0 0 -1 0], f = 1/tan(fov/2)
export function perspective(fovRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovRadians / 2);
  return { f, aspect, a: -(far + near) / (far - near), b: -(2 * far * near) / (far - near), near, far };
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function createRasterizer(width, height, opts = {}) {
  const color = new Uint8ClampedArray(width * height * 4);
  const depth = new Float32Array(width * height);
  const faceId = new Int32Array(width * height); // which triangle wrote each pixel (-1: none)
  let last = null; // what the last render produced, for inspect()
  const bg = hexToRgb(opts.background || '#0B0D0F');
  const ink = hexToRgb(opts.ink || '#ECECE7');
  const accent = hexToRgb(opts.accent || '#ABCDF7');
  const proj = perspective((opts.fovDegrees || 40) * Math.PI / 180, width / height, 0.1, 100);
  const cameraDistance = opts.cameraDistance || 3.2;

  function clear() {
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      color[o] = bg[0]; color[o + 1] = bg[1]; color[o + 2] = bg[2]; color[o + 3] = 255;
      depth[i] = Infinity;
      faceId[i] = -1;
    }
  }

  function plot(x, y, rgb, alpha = 1) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 4;
    color[o] = color[o] + (rgb[0] - color[o]) * alpha;
    color[o + 1] = color[o + 1] + (rgb[1] - color[o + 1]) * alpha;
    color[o + 2] = color[o + 2] + (rgb[2] - color[o + 2]) * alpha;
  }

  // Bresenham's line algorithm, as in Rasterix's LineDrawer
  function line(x0, y0, x1, y1, rgb, alpha) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      plot(x0, y0, rgb, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Signed area of the parallelogram (a, b, p): the edge function
  function edge(ax, ay, bx, by, px, py) {
    return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  }

  function fillTriangle(a, b, c, rgb, id) {
    const area = edge(a[0], a[1], b[0], b[1], c[0], c[1]);
    if (area === 0) return;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const w0 = edge(b[0], b[1], c[0], c[1], px, py) / area;
        const w1 = edge(c[0], c[1], a[0], a[1], px, py) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const i = y * width + x;
        if (z >= depth[i]) continue; // smaller NDC depth is closer
        depth[i] = z;
        faceId[i] = id;
        const o = i * 4;
        color[o] = rgb[0]; color[o + 1] = rgb[1]; color[o + 2] = rgb[2];
      }
    }
  }

  // yaw/pitch in radians
  function render(mesh, { yaw = 0, pitch = 0, mode = 'shaded' } = {}) {
    clear();
    const q = quatMul(quatFromAxisAngle(1, 0, 0, pitch), quatFromAxisAngle(0, 1, 0, yaw));
    const m = quatToMatrix(q);
    const V = mesh.vertices;
    const n = V.length;
    const cam = new Float32Array(n * 3); // camera space
    const scr = new Float32Array(n * 3); // screen x, y, ndc z
    const ok = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      const [x, y, z] = V[i];
      const cx = m[0] * x + m[1] * y + m[2] * z;
      const cy = m[3] * x + m[4] * y + m[5] * z;
      const cz = m[6] * x + m[7] * y + m[8] * z - cameraDistance; // camera looks down -z
      cam[i * 3] = cx; cam[i * 3 + 1] = cy; cam[i * 3 + 2] = cz;
      // clip coordinates
      const clipX = (proj.f / proj.aspect) * cx;
      const clipY = proj.f * cy;
      const clipZ = proj.a * cz + proj.b;
      const clipW = -cz;
      if (clipW <= proj.near) continue; // behind or too close
      ok[i] = 1;
      // perspective divide, then viewport map (y flipped for screen space)
      scr[i * 3] = (clipX / clipW + 1) * 0.5 * width;
      scr[i * 3 + 1] = (1 - (clipY / clipW + 1) * 0.5) * height;
      scr[i * 3 + 2] = clipZ / clipW;
    }

    const light = [0.35, 0.55, 0.76]; // normalised, points toward the light
    let drawn = 0, culled = 0;
    const seen = mode === 'vertices' ? new Uint8Array(n) : null;

    const shade = new Float32Array(mesh.faces.length);
    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const [i0, i1, i2] = mesh.faces[fi];
      if (!ok[i0] || !ok[i1] || !ok[i2]) { culled++; continue; }
      // face normal in camera space from the cross product of two edges
      const ax = cam[i1 * 3] - cam[i0 * 3], ay = cam[i1 * 3 + 1] - cam[i0 * 3 + 1], az = cam[i1 * 3 + 2] - cam[i0 * 3 + 2];
      const bx = cam[i2 * 3] - cam[i0 * 3], by = cam[i2 * 3 + 1] - cam[i0 * 3 + 1], bz = cam[i2 * 3 + 2] - cam[i0 * 3 + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      // back-face test: does the normal point toward the camera (at the origin)?
      const facing = -(nx * cam[i0 * 3] + ny * cam[i0 * 3 + 1] + nz * cam[i0 * 3 + 2]);
      const a = [scr[i0 * 3], scr[i0 * 3 + 1], scr[i0 * 3 + 2]];
      const b = [scr[i1 * 3], scr[i1 * 3 + 1], scr[i1 * 3 + 2]];
      const c = [scr[i2 * 3], scr[i2 * 3 + 1], scr[i2 * 3 + 2]];

      if (mode === 'wireframe') {
        // wireframe shows every edge, front faces brighter
        const alpha = facing > 0 ? 0.9 : 0.18;
        line(a[0], a[1], b[0], b[1], ink, alpha);
        line(b[0], b[1], c[0], c[1], ink, alpha);
        line(c[0], c[1], a[0], a[1], ink, alpha);
        if (facing > 0) drawn++; else culled++;
        continue;
      }
      if (facing <= 0) { culled++; continue; }
      drawn++;
      if (mode === 'vertices') {
        seen[i0] = seen[i1] = seen[i2] = 1;
        continue;
      }
      // flat Lambert shading with a little ambient light
      const lambert = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
      const k = 0.16 + 0.84 * lambert;
      shade[fi] = lambert;
      fillTriangle(a, b, c, [ink[0] * k, ink[1] * k, ink[2] * k], fi);
    }

    if (mode === 'vertices') {
      for (let i = 0; i < n; i++) {
        if (!seen[i]) continue;
        const x = scr[i * 3] | 0, y = scr[i * 3 + 1] | 0;
        plot(x, y, accent, 1); plot(x + 1, y, accent, 1); plot(x, y + 1, accent, 1); plot(x + 1, y + 1, accent, 1);
      }
    }
    last = { mesh, scr, cam, shade, light, mode };
    return { triangles: mesh.faces.length, drawn, culled };
  }

  // The numbers behind one pixel of the last shaded render: which triangle, its screen
  // vertices, the barycentric weights at the pixel centre, the interpolated depth and the shade.
  function inspect(x, y) {
    if (!last || last.mode !== 'shaded') return null;
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const fi = faceId[y * width + x];
    if (fi < 0) return null;
    const { mesh, scr, shade, light } = last;
    const [i0, i1, i2] = mesh.faces[fi];
    const P = (i) => [scr[i * 3], scr[i * 3 + 1], scr[i * 3 + 2]];
    const a = P(i0), b = P(i1), c = P(i2);
    const px = x + 0.5, py = y + 0.5;
    const area = edge(a[0], a[1], b[0], b[1], c[0], c[1]);
    const w0 = edge(b[0], b[1], c[0], c[1], px, py) / area;
    const w1 = edge(c[0], c[1], a[0], a[1], px, py) / area;
    const w2 = 1 - w0 - w1;
    return { face: fi, a, b, c, area, w: [w0, w1, w2], z: depth[y * width + x], lambert: shade[fi], light, k: 0.16 + 0.84 * shade[fi] };
  }

  return { width, height, color, render, inspect };
}
