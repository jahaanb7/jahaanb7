// Draws a retro boom box as ASCII on a COLS x ROWS grid (cells ~2x as tall as wide).
export function boombox(COLS = 62, ROWS = 26) {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  const put = (x, y, ch) => { if (y >= 0 && y < ROWS && x >= 0 && x < COLS) g[y][x] = ch; };
  const text = (x, y, s) => [...s].forEach((ch, i) => put(x + i, y, ch));
  const hline = (x0, x1, y, ch) => { for (let x = x0; x <= x1; x++) put(x, y, ch); };
  const vline = (x, y0, y1, ch) => { for (let y = y0; y <= y1; y++) put(x, y, ch); };
  const box = (x0, y0, x1, y1, h = '-', v = '|', c = '+') => {
    hline(x0, x1, y0, h); hline(x0, x1, y1, h); vline(x0, y0, y1, v); vline(x1, y0, y1, v);
    put(x0, y0, c); put(x1, y0, c); put(x0, y1, c); put(x1, y1, c);
  };
  const fill = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) hline(x0, x1, y, ch); };

  const L = 1, R = COLS - 2, T = 7, B = T + 17;
  // handle
  text(12, 4, '.' + '-'.repeat(R - 25) + '.');
  text(12, 5, '| .' + '-'.repeat(R - 29) + '. |');
  vline(12, 6, 6, '|'); vline(14, 6, 6, '|'); vline(R - 12, 6, 6, '|'); vline(R - 14, 6, 6, '|');
  // antenna, leaning back from the right shoulder
  for (let k = 0; k < 6; k++) put(R - 4 - k, T - 1 - k, '\\');
  put(R - 10, 0, 'o');
  // body
  box(L, T, R, B, '=', '#', '@');
  // top strip: buttons, tuner and bass
  ['<<', ' >', '>>', '[]', 'II'].forEach((b, i) => text(L + 3 + i * 5, T + 1, `[${b}]`));
  text(R - 17, T + 1, 'FM 1420.4 MHz');
  hline(L + 2, R - 2, T + 2, '-');
  text(L + 3, T + 3, '88 . 92 . 96 . 100 | 104 . 108');
  text(R - 17, T + 3, 'BASS [=====-]');
  hline(L + 2, R - 2, T + 4, '-');
  // speakers: concentric rings, round on a 2:1 character cell
  const cy = T + 10, rx = 9.6;
  const sp = (cx) => {
    for (let y = T + 5; y < B; y++) for (let x = L + 1; x < R; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / (rx / 2.08));
      if (d > 1) continue;
      put(x, y, d > 0.9 ? '@' : d > 0.78 ? '%' : d > 0.64 ? '*' : d > 0.48 ? '=' : d > 0.32 ? '-' : d > 0.18 ? ':' : d > 0.09 ? 'o' : '@');
    }
  };
  sp(L + 11); sp(R - 11);
  // cassette deck
  const dx0 = L + 23, dx1 = R - 23, dy0 = T + 5, dy1 = B - 1;
  box(dx0, dy0, dx1, dy1, '-', '|', '+');
  const mid = Math.round((dx0 + dx1) / 2);
  text(mid - 3, dy0 + 1, 'STEREO');
  box(dx0 + 1, dy0 + 3, dx1 - 1, dy0 + 7, '-', '|', '.');
  text(dx0 + 3, dy0 + 5, '(@)');
  text(dx1 - 5, dy0 + 5, '(@)');
  hline(dx0 + 6, dx1 - 6, dy0 + 5, '~');
  text(mid - 3, dy0 + 9, 'SIDE A');
  // feet
  text(L + 4, B + 1, '[____]'); text(R - 9, B + 1, '[____]');
  return g.map((r) => r.join(''));
}
