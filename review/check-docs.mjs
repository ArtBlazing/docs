import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync('docs.json', 'utf8'));
const routes = [];
function walk(value) {
  if (typeof value === 'string') return;
  if (Array.isArray(value)) return value.forEach(walk);
  if (!value || typeof value !== 'object') return;
  if (value.root) routes.push(value.root);
  if (value.pages) for (const item of value.pages) typeof item === 'string' ? routes.push(item) : walk(item);
  for (const key of ['groups', 'tabs', 'anchors', 'dropdowns']) if (value[key]) walk(value[key]);
}
walk(config.navigation);
const unique = [...new Set(routes)];
const errors = [];
const shots = [];
let words = 0;
const docs = {};
for (const route of unique) {
  const file = route + '.mdx';
  if (!fs.existsSync(file)) { errors.push('Missing route: ' + file); continue; }
  const text = fs.readFileSync(file, 'utf8');
  docs[route] = text;
  if (!/^---\r?\n[\s\S]*?title:/m.test(text)) errors.push('Missing frontmatter: ' + file);
  words += text.split(/\s+/).length;
  let heading = '';
  for (const line of text.split(/\r?\n/)) {
    if (/^##+ /.test(line)) heading = line.replace(/^#+ /, '');
    const match = line.match(/\{\/\* Screenshot: ([a-z0-9-]+\.png) \| (.*?) \*\/\}/);
    if (match) shots.push({ filename: match[1], route, heading, description: match[2] });
  }
}
function slug(s) { return s.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-'); }
for (const [route, text] of Object.entries(docs)) {
  const links = [...text.matchAll(/\]\((\/[^)\s]+)\)|(?:href|src)="(\/[^"]+)"/g)].map(m => m[1] || m[2]);
  for (const link of links) {
    if (link.startsWith('//')) continue;
    const [target, hash] = decodeURIComponent(link).split('#');
    const clean = target.split('?')[0].replace(/^\//, '');
    if (!clean) continue;
    if (fs.existsSync(clean) && fs.statSync(clean).isFile()) continue;
    const found = docs[clean];
    if (!found) { errors.push(route + ': missing link/asset ' + link); continue; }
    if (hash) {
      const anchors = [...found.matchAll(/^#{1,6} (.+)$/gm)].map(m => slug(m[1].trim()));
      const explicit = [...found.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
      if (!anchors.includes(hash) && !explicit.includes(hash)) errors.push(route + ': missing anchor ' + link);
    }
  }
  for (const tag of ['Steps','Step','Tabs','Tab','Columns','Card','AccordionGroup','Accordion','Note','Warning','Info','Tip','Check','Frame']) {
    const opened = [...text.matchAll(new RegExp('<' + tag + '(?:\\s[^>]*|)>', 'g'))].length;
    const closed = [...text.matchAll(new RegExp('</' + tag + '>', 'g'))].length;
    if (opened !== closed) errors.push(route + ': unmatched ' + tag + ' tags');
  }
}
const hash = crypto.createHash('sha256').update(fs.readFileSync('builders/mcp-tools.mdx')).digest('hex').toUpperCase();
// User-approved metadata-only change: add the robot icon; guide text is unchanged.
if (hash !== 'E0894F9D35DB336B36FF4CEBA27A9EBA9A354184D76986282526AFA56D499650') errors.push('MCP page changed beyond the approved icon');
const duplicateShots = shots.filter((s,i) => shots.findIndex(x => x.filename === s.filename) !== i);
if (duplicateShots.length) errors.push('Duplicate screenshot names: ' + duplicateShots.map(s=>s.filename));
if (!fs.existsSync('review/SCREENSHOT_IMPORT.json') && fs.existsSync('review/SCREENSHOT_CHECKLIST.md')) {
  const checklist = fs.readFileSync('review/SCREENSHOT_CHECKLIST.md','utf8');
  const names = [...checklist.matchAll(/^- \[ \] \*\*`([a-z0-9-]+\.png)`/gm)].map(m=>m[1]);
  if (names.length !== shots.length || new Set(names).size !== shots.length) errors.push('Screenshot checklist count mismatch');
  for (const shot of shots) if (!names.includes(shot.filename)) errors.push('Missing screenshot checklist entry: '+shot.filename);
}
if (fs.existsSync('review/SCREENSHOT_IMPORT.json')) {
  const manifest = JSON.parse(fs.readFileSync('review/SCREENSHOT_IMPORT.json', 'utf8'));
  const seen = new Set();
  for (const item of manifest.images) {
    const asset = 'assets/guide-screenshots/' + item.destination;
    if (seen.has(item.destination)) errors.push('Duplicate imported image: ' + item.destination);
    seen.add(item.destination);
    if (!docs[item.route]?.includes('src="/' + asset + '"')) errors.push('Imported image not placed: ' + asset);
    for (const route of item.additionalRoutes || []) {
      if (!docs[route]?.includes('src="/' + asset + '"')) errors.push('Reused image not placed: ' + route + ' → ' + asset);
    }
    if (!shots.some(s => s.filename === item.destination && s.route === item.route)) errors.push('Missing image marker: ' + asset);
    if (!fs.existsSync(asset)) { errors.push('Missing imported image: ' + asset); continue; }
    const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (digest(asset) !== digest(path.join(manifest.sourceDirectory, item.source))) errors.push('Image differs from original: ' + asset);
  }
  const knownMissing = ['deposit-chain-wallet.png', 'withdraw-review.png', 'settings-buy-presets.png', 'settings-trade-panel.png', 'settings-position-panel.png'];
  for (const shot of shots) if (!seen.has(shot.filename) && !knownMissing.includes(shot.filename)) errors.push('Untracked screenshot: ' + shot.filename);
}
const sourcePath = 'C:/Users/artyo/Downloads/Telegram Desktop/';
const sources = ['COVE_PRODUCT_KNOWLEDGE_BASE.md','COVE_PRODUCT_KNOWLEDGE_BASE1.md'].map(name => fs.readFileSync(sourcePath+name,'utf8'));
const featureRows = sources.map(source => [...source.matchAll(/^\| (COVE-[A-Z]+-\d+) \| ([^|]+) \|/gm)].map(m=>({id:m[1],name:m[2].trim()})));
const featureIndex = new Map();
for (const rows of featureRows) for (const row of rows) featureIndex.set(row.id,row.name);
const coverage = JSON.parse(fs.readFileSync('review/coverage.json','utf8'));
for (const [id] of featureIndex) {
  if (!coverage.features[id]) errors.push('Unmapped feature: ' + id);
  else for (const r of coverage.features[id]) if (!docs[r]) errors.push('Bad coverage destination: ' + id + ' → ' + r);
}
const settings = [...sources[1].matchAll(/^\| (SET-[A-Z]+\d+[a-z]?) \| \*\*([^*]+)\*\*/gm)].map(m=>({id:m[1],name:m[2]}));
for (const setting of settings) {
  const route = coverage.settings[setting.id];
  if (!route) errors.push('Unmapped setting: ' + setting.id);
  else if (!docs[route]) errors.push('Bad setting coverage destination: ' + setting.id);
}
const mode = process.argv[2];
if (mode === '--details') console.log(JSON.stringify({routes:unique,shots,features:[...featureIndex].map(([id,name])=>({id,name,pages:coverage.features[id]})),settings},null,2));
else console.log(JSON.stringify({pages:unique.length,words,screenshots:shots.length,features:featureIndex.size,settings:settings.length,mcpHash:hash,errors},null,2));
if (errors.length) process.exitCode=1;
