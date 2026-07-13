import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredPages = [
  'index.html',
  'en/index.html',
  'zh/index.html',
  'privacy/index.html',
  'games/little-tower-defence/index.html'
];
const requiredAssets = [
  'assets/danatech/company.css',
  'assets/danatech/company.js',
  'assets/danatech/danatech-game-og.webp',
  'assets/danatech/danatech-icon.png',
  'assets/danatech/xxtf-feature.webp',
  'assets/danatech/xxtf-hero.webp',
  'assets/danatech/xxtf-hero-mobile.webp',
  'assets/danatech/xxtf-icon.webp',
  'assets/danatech/xxtf-landing.css',
  'assets/danatech/xxtf-landing.js',
  ...Array.from({ length: 8 }, (_, index) =>
    `assets/danatech/xxtf/screen-${String(index + 1).padStart(2, '0')}.webp`)
];

const failures = [];
for (const relativePath of [...requiredPages, ...requiredAssets, 'robots.txt', 'sitemap.xml']) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath) || statSync(absolutePath).size === 0) {
    failures.push(`Missing or empty required file: ${relativePath}`);
  }
}

const publicFiles = walk(root).filter((file) => !isLocalOrRepositoryFile(file));
const textFiles = publicFiles.filter((file) => ['.css', '.html', '.js', '.json', '.md', '.txt', '.xml'].includes(extname(file)));
const forbidden = [
  [/huijia\.xyz/i, 'legacy domain'],
  [/assets\/huijia/i, 'legacy asset path'],
  [/\b(?:VPN|Turnstile|PayID)\b/i, 'unrelated service content'],
  [/ghp_[A-Za-z0-9]{20,}/, 'GitHub credential'],
  [/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/, 'private key']
];

for (const file of textFiles) {
  const relativePath = file.slice(root.length + 1).replaceAll('\\', '/');
  if (relativePath === 'scripts/verify-site.mjs') continue;
  const content = readFileSync(file, 'utf8');
  for (const [pattern, label] of forbidden) {
    if (pattern.test(content)) failures.push(`${relativePath} contains ${label}`);
  }
}

for (const relativePath of requiredPages.slice(1)) {
  const html = readFileSync(join(root, relativePath), 'utf8');
  if (!html.includes('DanaTech')) failures.push(`${relativePath} is missing the DanaTech company name`);

  for (const match of html.matchAll(/(?:href|src|srcset|data-src)="([^"]+)"/g)) {
    const target = match[1].split(/[?#]/, 1)[0];
    if (!target.startsWith('/') || target.startsWith('//')) continue;

    const localPath = target.endsWith('/') ? `${target}index.html` : target;
    if (!existsSync(join(root, localPath.replace(/^\//, '')))) {
      failures.push(`${relativePath} references missing local file: ${target}`);
    }
  }
}

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
for (const url of [
  'https://maketh.au/',
  'https://maketh.au/en/',
  'https://maketh.au/zh/',
  'https://maketh.au/privacy/',
  'https://maketh.au/games/little-tower-defence/'
]) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) failures.push(`sitemap.xml is missing ${url}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${requiredPages.length} pages, ${requiredAssets.length} required assets, local links, branding, and public-content boundaries.`);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory() && ['.git', '.codex_tmp'].includes(entry.name)) return [];
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function isLocalOrRepositoryFile(file) {
  const relativePath = file.slice(root.length + 1).replaceAll('\\', '/');
  return relativePath.startsWith('.git/')
    || relativePath.startsWith('.codex_tmp/')
    || ['codex_temp.txt', 'confs.txt', 'maketh.au_key'].includes(relativePath);
}
