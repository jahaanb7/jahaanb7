// Builds the profile cards from live GitHub data.
// Usage: GITHUB_TOKEN=... node scripts/build.mjs
// Writes assets/card-{dark,light}.svg and assets/stats-{dark,light}.svg.
// Runs daily in .github/workflows/refresh.yml; no dependencies beyond Node 20.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { boombox } from './lib/boombox.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIN = 'jahaanb7';
const PORTFOLIO = 'jahaanb7.github.io/Jahaans-Workspace-Portfolio';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is not set');

// ---------- data ----------
async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-card' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const { user } = await gql(`query($login: String!) {
  user(login: $login) {
    createdAt
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 100, isFork: false) {
      totalCount
      nodes { name languages(first: 20) { edges { size node { name color } } } }
    }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
  }
}`, { login: LOGIN });

const repos = user.repositories.nodes;
const cal = user.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) => w.contributionDays);

// Streaks: today may still be empty, so the current streak may end yesterday.
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (i === days.length - 1) continue;
  else break;
}
let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
const activeDays = days.filter((d) => d.contributionCount > 0).length;

// Languages by bytes. Markup, notebooks (outputs inflate them) and build files are left out.
const SKIP = new Set(['HTML', 'CSS', 'Jupyter Notebook', 'Makefile', 'CMake', 'Dockerfile', 'Shell', 'PowerShell', 'Batchfile']);
const langMap = new Map();
for (const r of repos) for (const e of r.languages.edges) {
  if (SKIP.has(e.node.name)) continue;
  const cur = langMap.get(e.node.name) || { name: e.node.name, color: e.node.color || '#8b949e', size: 0 };
  cur.size += e.size; langMap.set(e.node.name, cur);
}
let langs = [...langMap.values()].sort((a, b) => b.size - a.size);
const totalBytes = langs.reduce((s, l) => s + l.size, 0);
if (langs.length > 7) {
  const rest = langs.slice(6).reduce((s, l) => s + l.size, 0);
  langs = [...langs.slice(0, 6), { name: 'Other', color: '#6e7681', size: rest }];
}
langs.forEach((l) => (l.pct = (l.size / totalBytes) * 100));

const created = new Date(user.createdAt);
const now = new Date();
let months = (now.getFullYear() - created.getFullYear()) * 12 + now.getMonth() - created.getMonth();
let dd = now.getDate() - created.getDate();
if (dd < 0) { months--; dd += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
const uptime = `${Math.floor(months / 12)} yr, ${months % 12} mo, ${dd} d`;

// ---------- ASCII boom box ----------
const COLS = 62, ROWS = 26;
const ascii = boombox(COLS, ROWS);

// ---------- SVG helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => n.toLocaleString('en-US');
const THEMES = {
  dark: { bg: '#0d1117', border: '#30363d', text: '#c9d1d9', muted: '#7d8590', key: '#ffa657', value: '#a5d6ff', title: '#f0f6fc', art: '#8b949e',
    link: '#58a6ff', heat: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'], tile: '#161b22' },
  light: { bg: '#ffffff', border: '#d0d7de', text: '#24292f', muted: '#656d76', key: '#953800', value: '#0a3069', title: '#1f2328', art: '#57606a',
    link: '#0969da', heat: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'], tile: '#f6f8fa' },
};
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

// ---------- card: neofetch-style ----------
// Each row: [key, value] with a dotted leader, a section header, or a blank line.
const W = 62; // characters on the right column
// As many top languages as fit on the row (key 'Languages.Code' takes 14 + 7 characters).
let langNames = '';
for (const l of langs.filter((x) => x.name !== 'Other')) {
  const next = langNames ? `${langNames}, ${l.name}` : l.name;
  if (next.length > W - 21) break;
  langNames = next;
}
const rows = [
  ['head', 'jahaan@workspace'],
  ['kv', 'OS', 'High school, Class of 2028'],
  ['kv', 'Uptime', `${uptime} on GitHub`],
  ['kv', 'Host', "Jahaan's Workspace"],
  ['kv', 'Kernel', 'Student engineer'],
  ['blank'],
  ['kv', 'Interests', 'Physics, CS, AI/ML, Engineering, Maths'],
  ['kv', 'Languages.Code', 'Python, Java, C, C++'],
  ['kv', 'Languages.Hardware', 'KiCad, Fusion 360'],
  ['blank'],
  ['kv', 'Building.Software', 'Renderers, simulations, AI assistant'],
  ['kv', 'Building.Hardware', 'Rocket, Chladni plate, radio dish'],
  ['blank'],
  ['head', 'Contact'],
  ['kv', 'Portfolio', PORTFOLIO],
  ['kv', 'GitHub', `@${LOGIN}`],
  ['blank'],
  ['head', 'GitHub Stats'],
  ['kv2', 'Repos', fmt(user.repositories.totalCount), 'Active days', `${activeDays}`],
  ['kv2', 'Commits (yr)', fmt(user.contributionsCollection.totalCommitContributions), 'Streak', `${current} d`],
  ['kv', 'Contributions (last year)', fmt(cal.totalContributions)],
];

function leader(key, value, width) {
  if (key.length + String(value).length + 7 > width) throw new Error(`card row too long: ${key}`);
  const dots = Math.max(2, width - key.length - String(value).length - 4);
  return { key: `. ${key}:`, dots: ' ' + '.'.repeat(dots) + ' ', value: String(value) };
}

function card(t) {
  const fs = 14, lh = 20, cw = fs * 0.6, pad = 24;
  const AFS = 10, ALH = 13; // art is set smaller so the drawing fits beside the text
  const leftW = COLS * AFS * 0.6;
  const rx = pad + leftW + 28;
  const width = Math.round(rx + W * cw + pad);
  const height = pad * 2 + Math.max(ROWS * ALH, rows.length * lh);
  const artTop = pad + (height - pad * 2 - ROWS * ALH) / 2;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Jahaan Bhavsar: student engineer. ${esc(cal.totalContributions)} contributions in the last year.">
<style>text{font-family:${MONO};font-size:${fs}px;white-space:pre;fill:${t.text}}.a{fill:${t.art};font-size:${AFS}px}.k{fill:${t.key}}.v{fill:${t.value}}.d{fill:${t.muted}}.h{fill:${t.title};font-weight:600}</style>
<rect width="${width}" height="${height}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
`;
  ascii.forEach((l, i) => { out += `<text class="a" x="${pad}" y="${artTop + (i + 0.8) * ALH}" xml:space="preserve">${esc(l)}</text>\n`; });
  rows.forEach((r, i) => {
    const y = pad + (i + 0.8) * lh;
    if (r[0] === 'head') {
      const label = r[1] === 'jahaan@workspace' ? r[1] : `- ${r[1]}`;
      out += `<text x="${rx}" y="${y}" xml:space="preserve"><tspan class="h">${esc(label)}</tspan><tspan class="d"> ${'-'.repeat(W - label.length - 1)}</tspan></text>\n`;
    } else if (r[0] === 'kv') {
      const l = leader(r[1], r[2], W);
      out += `<text x="${rx}" y="${y}" xml:space="preserve"><tspan class="k">${esc(l.key)}</tspan><tspan class="d">${l.dots}</tspan><tspan class="v">${esc(l.value)}</tspan></text>\n`;
    } else if (r[0] === 'kv2') {
      const half = 36;
      const a = leader(r[1], r[2], half), b = leader(r[3], r[4], W - half - 2);
      out += `<text x="${rx}" y="${y}" xml:space="preserve"><tspan class="k">${esc(a.key)}</tspan><tspan class="d">${a.dots}</tspan><tspan class="v">${esc(a.value)}</tspan><tspan class="d"> | </tspan><tspan class="k">${esc(b.key.slice(2))}</tspan><tspan class="d">${b.dots}</tspan><tspan class="v">${esc(b.value)}</tspan></text>\n`;
    }
  });
  return out + '</svg>\n';
}

// ---------- stats: tiles, contribution grid, languages ----------
function stats(t) {
  const width = 900, pad = 24, gap = 16;
  let y = pad;
  let out = '';
  // welcome panel
  const wh = 84;
  out += `<rect x="${pad}" y="${y}" width="${width - pad * 2}" height="${wh}" rx="10" fill="${t.tile}" stroke="${t.border}"/>
<text x="${pad + 24}" y="${y + 38}" class="hello">Welcome to Jahaan's Hub</text>
<text x="${pad + 24}" y="${y + 62}" class="sub">Explore my contributions and projects</text>
<rect x="${width - pad - 24 - 260}" y="${y + 24}" width="260" height="36" rx="18" fill="none" stroke="${t.link}"/>
<text x="${width - pad - 24 - 130}" y="${y + 47}" text-anchor="middle" class="link">Click me to view my portfolio ↗</text>\n`;
  y += wh + gap;
  // tiles
  const tiles = [
    [fmt(cal.totalContributions), 'CONTRIBUTIONS'],
    [fmt(user.contributionsCollection.totalCommitContributions), 'COMMITS'],
    [fmt(user.repositories.totalCount), 'PUBLIC REPOS'],
    [`${longest}`, 'LONGEST STREAK (DAYS)'],
  ];
  const tw = (width - pad * 2 - gap * 3) / 4, th = 84;
  tiles.forEach(([n, label], i) => {
    const x = pad + i * (tw + gap);
    out += `<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="10" fill="${t.tile}" stroke="${t.border}"/>
<text x="${x + tw / 2}" y="${y + 44}" text-anchor="middle" class="big">${esc(n)}</text>
<text x="${x + tw / 2}" y="${y + 66}" text-anchor="middle" class="cap">${esc(label)}</text>\n`;
  });
  y += th + gap;

  // contribution grid
  const weeks = cal.weeks;
  const cell = 12, cg = 3, gx = pad + 40;
  const gridH = 7 * (cell + cg) - cg;
  const boxH = 36 + 18 + gridH + 34;
  out += `<rect x="${pad}" y="${y}" width="${width - pad * 2}" height="${boxH}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<text x="${pad + 18}" y="${y + 28}" class="sec">Contributions</text>
<text x="${width - pad - 18}" y="${y + 28}" text-anchor="end" class="cap2">${fmt(cal.totalContributions)} in the last year · ${activeDays} active days · current streak ${current} day${current === 1 ? '' : 's'}</text>\n`;
  const gy = y + 54;
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  let lastMonth = -1;
  weeks.forEach((w, wi) => {
    const x = gx + wi * (cell + cg);
    const m = new Date(w.contributionDays[0].date + 'T00:00:00Z').getUTCMonth();
    if (m !== lastMonth && wi < weeks.length - 2) {
      out += `<text x="${x}" y="${gy - 8}" class="cap2">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]}</text>\n`;
      lastMonth = m;
    }
    w.contributionDays.forEach((d) => {
      const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
      const c = d.contributionCount;
      const lvl = c === 0 ? 0 : Math.min(4, 1 + Math.floor((c / max) * 3.999));
      out += `<rect x="${x}" y="${gy + dow * (cell + cg)}" width="${cell}" height="${cell}" rx="2.5" fill="${t.heat[lvl]}"><title>${d.date}: ${c}</title></rect>`;
    });
    out += '\n';
  });
  ['Mon', 'Wed', 'Fri'].forEach((l, i) => { out += `<text x="${pad + 14}" y="${gy + (1 + i * 2) * (cell + cg) + 10}" class="cap2">${l}</text>\n`; });
  const ly = gy + gridH + 22;
  const moreX = width - pad - 18, sw0 = moreX - 38 - 5 * (cell + cg);
  out += `<text x="${sw0 - 6}" y="${ly}" text-anchor="end" class="cap2">Less</text>`;
  t.heat.forEach((c, i) => { out += `<rect x="${sw0 + i * (cell + cg)}" y="${ly - 10}" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>`; });
  out += `<text x="${moreX}" y="${ly}" text-anchor="end" class="cap2">More</text>\n`;
  y += boxH + gap;

  // languages
  const lbH = 36 + 14 + 22 + Math.ceil(langs.length / 4) * 24 + 12;
  out += `<rect x="${pad}" y="${y}" width="${width - pad * 2}" height="${lbH}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<text x="${pad + 18}" y="${y + 28}" class="sec">Languages</text>
<text x="${width - pad - 18}" y="${y + 28}" text-anchor="end" class="cap2">by bytes of code in public repos · markup, notebooks and build files left out</text>\n`;
  const bx = pad + 18, bw = width - pad * 2 - 36, by = y + 46;
  out += `<clipPath id="bar"><rect x="${bx}" y="${by}" width="${bw}" height="10" rx="5"/></clipPath><g clip-path="url(#bar)">`;
  let acc = 0;
  langs.forEach((l) => { const w = (l.pct / 100) * bw; out += `<rect x="${bx + acc}" y="${by}" width="${w + 0.5}" height="10" fill="${l.color}"/>`; acc += w; });
  out += '</g>\n';
  langs.forEach((l, i) => {
    const lx = bx + (i % 4) * (bw / 4), lyy = by + 36 + Math.floor(i / 4) * 24;
    out += `<circle cx="${lx + 5}" cy="${lyy - 4}" r="5" fill="${l.color}"/><text x="${lx + 16}" y="${lyy}" class="lang">${esc(l.name)} <tspan class="pct">${l.pct.toFixed(1)}%</tspan></text>\n`;
  });
  y += lbH + pad;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}" role="img" aria-label="GitHub activity: ${cal.totalContributions} contributions in the last year, ${user.repositories.totalCount} public repositories. Top languages: ${esc(langNames)}.">
<style>text{font-family:${SANS};fill:${t.text}}.big{font-size:30px;font-weight:700;fill:${t.title}}.cap{font-size:11px;letter-spacing:1.2px;fill:${t.muted}}.cap2{font-size:12px;fill:${t.muted}}.sec{font-size:16px;font-weight:600;fill:${t.title}}.hello{font-size:22px;font-weight:600;fill:${t.title}}.sub{font-size:14px;fill:${t.muted}}.link{font-size:14px;font-weight:600;fill:${t.link}}.lang{font-size:13px}.pct{fill:${t.muted}}</style>
${out}</svg>\n`;
}

for (const [name, t] of Object.entries(THEMES)) {
  await writeFile(path.join(root, `assets/card-${name}.svg`), card(t));
  await writeFile(path.join(root, `assets/stats-${name}.svg`), stats(t));
}
console.log(ascii.join('\n'));
console.log(`contributions ${cal.totalContributions}, repos ${user.repositories.totalCount}, streak ${current}/${longest}, langs ${langs.map((l) => l.name).join(',')}`);
