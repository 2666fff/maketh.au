import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredPages = [
  'services/affordable-web-design-australia/index.html',
  'zh/services/affordable-web-design-australia/index.html',
  'index.html',
  '404.html',
  '502.html',
  'en/index.html',
  'zh/index.html',
  'services/web-design-brisbane/index.html',
  'services/app-development-brisbane/index.html',
  'services/ai-receptionist-brisbane/index.html',
  'zh/services/web-design-brisbane/index.html',
  'zh/services/app-development-brisbane/index.html',
  'zh/services/ai-receptionist-brisbane/index.html',
  'privacy/index.html',
  'games/little-tower-defence/index.html',
  'quote/index.html', 'admin/index.html',
  'examples/starter/index.html', 'examples/starter/about/index.html', 'examples/starter/product/index.html',
  ...['', 'about/', 'services/', 'projects/', 'guide/', 'quote/'].map(page => `examples/business/${page}index.html`)
];
const requiredAssets = [
  'assets/danatech/company.css',
  'assets/danatech/coverage.css',
  'assets/danatech/company.js',
  'assets/danatech/quote.css', 'assets/danatech/quote.js', 'assets/danatech/admin.js',
  'examples/assets/demo.css', 'examples/assets/demo.js',
  ...['still-life', 'garden', 'vase', 'bowl', 'lamp'].map(name => `examples/assets/${name}.svg`),
  'assets/danatech/danatech-game-og.webp',
  'assets/danatech/danatech-services-og.png',
  'assets/danatech/danatech-icon.png',
  'assets/danatech/error.css',
  'assets/danatech/xxtf-feature.webp',
  'assets/danatech/xxtf-hero.webp',
  'assets/danatech/xxtf-hero-mobile.webp',
  'assets/danatech/xxtf-icon.webp',
  'assets/danatech/xxtf-landing.css',
  'assets/danatech/xxtf-landing.js',
  ...Array.from({ length: 8 }, (_, index) =>
    `assets/danatech/xxtf/screen-${String(index + 1).padStart(2, '0')}.webp`)
];

const requiredPublicFiles = ['robots.txt', 'sitemap.xml', 'app-ads.txt'];
const failures = [];
for (const relativePath of [...requiredPages, ...requiredAssets, ...requiredPublicFiles]) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath) || statSync(absolutePath).size === 0) {
    failures.push(`Missing or empty required file: ${relativePath}`);
  }
}

const servicesOgImage = readFileSync(join(root, 'assets/danatech/danatech-services-og.png'));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!servicesOgImage.subarray(0, 8).equals(pngSignature)) {
  failures.push('danatech-services-og.png must contain real PNG data');
} else if (servicesOgImage.readUInt32BE(16) !== 1200 || servicesOgImage.readUInt32BE(20) !== 630) {
  failures.push('danatech-services-og.png must be 1200x630 pixels');
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

for (const relativePath of requiredPages) {
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

const indexableCompanyPages = [
  'services/affordable-web-design-australia/index.html',
  'zh/services/affordable-web-design-australia/index.html',
  'index.html',
  'zh/index.html',
  'services/web-design-brisbane/index.html',
  'services/app-development-brisbane/index.html',
  'services/ai-receptionist-brisbane/index.html',
  'zh/services/web-design-brisbane/index.html',
  'zh/services/app-development-brisbane/index.html',
  'zh/services/ai-receptionist-brisbane/index.html'
];

for (const relativePath of indexableCompanyPages) {
  const html = readFileSync(join(root, relativePath), 'utf8');
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1] || '';
  const minimumDescriptionLength = relativePath.startsWith('zh/') ? 30 : 80;
  if (h1Count !== 1) failures.push(`${relativePath} must contain exactly one h1, found ${h1Count}`);
  if ([...html.matchAll(/<title>/gi)].length !== 1 || /<meta[^>]*<meta/.test(html)) failures.push(`${relativePath} has malformed title or meta markup`);
  if (!/<title>[^<]{20,}<\/title>/i.test(html)) failures.push(`${relativePath} needs a descriptive title`);
  if (description.length < minimumDescriptionLength) failures.push(`${relativePath} needs a useful meta description`);
  if (!/<link rel="canonical" href="https:\/\/maketh\.au\//i.test(html)) failures.push(`${relativePath} needs a maketh.au canonical URL`);
  if (!html.includes('hreflang="en-AU"') || !html.includes('hreflang="zh-CN"')) {
    failures.push(`${relativePath} needs reciprocal English and Chinese hreflang links`);
  }
  if (/\bR18\b/.test(html)) failures.push(`${relativePath} contains the unrelated R18 navigation label`);
  if (/470 St Kilda|Registered address/.test(html)) failures.push(`${relativePath} contains an unconfirmed company address`);

  const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  if (jsonLdBlocks.length === 0) failures.push(`${relativePath} is missing JSON-LD`);
  for (const [, json] of jsonLdBlocks) {
    try {
      JSON.parse(json);
    } catch {
      failures.push(`${relativePath} contains invalid JSON-LD`);
    }
  }
}

for (const relativePath of ['index.html', 'zh/index.html']) {
  const html = readFileSync(join(root, relativePath), 'utf8');
  for (const fact of ['$199', '$299', '$888', '$500']) {
    if (!html.includes(fact)) failures.push(`${relativePath} is missing confirmed price ${fact}`);
  }
  if (!/source code|源码/i.test(html)) failures.push(`${relativePath} is missing the source-code handover promise`);
}

const projectNavigationChecks = [
  ['index.html', 'href="#projects">Projects'],
  ['zh/index.html', 'href="#projects">项目'],
  ['services/web-design-brisbane/index.html', 'href="/#projects">Projects'],
  ['services/app-development-brisbane/index.html', 'href="/#projects">Projects'],
  ['services/ai-receptionist-brisbane/index.html', 'href="/#projects">Projects'],
  ['zh/services/web-design-brisbane/index.html', 'href="/zh/#projects">项目'],
  ['zh/services/app-development-brisbane/index.html', 'href="/zh/#projects">项目'],
  ['zh/services/ai-receptionist-brisbane/index.html', 'href="/zh/#projects">项目']
];

for (const [relativePath, marker] of projectNavigationChecks) {
  const html = readFileSync(join(root, relativePath), 'utf8');
  if (!html.includes(marker)) failures.push(`${relativePath} is missing the Projects navigation link`);
}

const englishHome = readFileSync(join(root, 'index.html'), 'utf8');
const chineseHome = readFileSync(join(root, 'zh/index.html'), 'utf8');
if (!englishHome.includes('<section id="projects"') || !englishHome.includes('Get it on Google Play')) {
  failures.push('index.html is missing the published Projects section or Google Play link');
}
if (!chineseHome.includes('<section id="projects"') || !chineseHome.includes('Google Play 下载')) {
  failures.push('zh/index.html is missing the published 项目 section or Google Play link');
}

const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.dana.xxtf';
const gamePage = readFileSync(join(root, 'games/little-tower-defence/index.html'), 'utf8');
if (!gamePage.includes(playStoreUrl)) failures.push('Little Tower Defence page is missing the Google Play URL');
if (/即将上线|正在准备 Google Play 上线/.test(gamePage)) {
  failures.push('Little Tower Defence page still contains pre-release copy');
}

const adsTxt = readFileSync(join(root, 'app-ads.txt'), 'utf8').trim();
if (adsTxt !== 'google.com, pub-3690130446613985, DIRECT, f08c47fec0942fa0') {
  failures.push('app-ads.txt does not contain the expected publisher declaration');
}

const websiteSalesPages = [
  'index.html',
  'zh/index.html',
  'services/web-design-brisbane/index.html',
  'zh/services/web-design-brisbane/index.html'
];

const majorAustralianCities = [
  'Brisbane', 'Sydney', 'Melbourne', 'Perth', 'Adelaide', 'Canberra', 'Hobart', 'Darwin',
  'Gold Coast', 'Sunshine Coast', 'Newcastle', 'Wollongong', 'Geelong', 'Toowoomba', 'Cairns', 'Townsville'
];

for (const relativePath of websiteSalesPages) {
  const html = readFileSync(join(root, relativePath), 'utf8');
  for (const fact of ['$199', '$299', '$888', 'Mount Gravatt', 'Sunnybank', 'Eight Mile Plains', ...majorAustralianCities]) {
    if (!html.includes(fact)) failures.push(`${relativePath} is missing website sales fact ${fact}`);
  }
  if (!/Australia|全澳/.test(html)) failures.push(`${relativePath} is missing Australia-wide service coverage`);
  if (!/meetings? (?:across|anywhere in) Brisbane|Brisbane[^<]{0,40}(?:meeting|面谈)|整个 Brisbane/i.test(html)) {
    failures.push(`${relativePath} is missing Brisbane-wide meeting coverage`);
  }
  if (!/10\s+(?:content\s+)?pages|10\s*页/i.test(html)) failures.push(`${relativePath} is missing the 299 package page limit`);
  for (const marker of ['.com.au', '.au', 'Home', 'About', 'Product', '/examples/starter/', '/examples/business/']) {
    if (!html.includes(marker)) failures.push(`${relativePath} is missing package fact/link ${marker}`);
  }
  if (!/Sydney server hosting for 12 months|悉尼服务器 12 个月/.test(html)) failures.push(`${relativePath} is missing the 199 Sydney hosting inclusion`);
  if (!/User registration and login|用户注册及登录/.test(html) || !/Basic data query|基础数据查询/.test(html)) failures.push(`${relativePath} is missing the 888 account/query scope`);
  if (/\$399|399\s*澳元|"price":"399"/.test(html)) failures.push(`${relativePath} still advertises the removed 399 package`);
  if (/\$300\b|300\s*澳元/.test(html)) failures.push(`${relativePath} contains the superseded $300 website price`);
  if (!html.includes('data-reveal=')) failures.push(`${relativePath} is missing scroll-reveal anchors`);
}

for (const relativePath of ['index.html', 'services/web-design-brisbane/index.html']) {
  const html = readFileSync(join(root, relativePath), 'utf8');
  if (!/cheapest website design for your needs|Maketh.s cheapest/i.test(html)) {
    failures.push(`${relativePath} is missing qualified lowest-price comparison language`);
  }
  if (!/business and personal|personal and business|individuals and businesses/i.test(html)) {
    failures.push(`${relativePath} is missing business and personal customer language`);
  }
}

for (const relativePath of ['zh/index.html', 'zh/services/web-design-brisbane/index.html']) {
  const html = readFileSync(join(root, relativePath), 'utf8');
  for (const phrase of ['布里斯班平价网站设计', '商务及个人网站', 'Maketh']) {
    if (!html.includes(phrase)) failures.push(`${relativePath} is missing Chinese SEO phrase ${phrase}`);
  }
}

const companyJs = readFileSync(join(root, 'assets/danatech/company.js'), 'utf8');
const companyCss = readFileSync(join(root, 'assets/danatech/company.css'), 'utf8');
if (!companyJs.includes('IntersectionObserver') || !companyJs.includes('prefers-reduced-motion')) {
  failures.push('company.js needs scroll-triggered motion with a reduced-motion fallback');
}
if (!companyCss.includes('.reveal-enabled [data-reveal]') || !companyCss.includes('@media (prefers-reduced-motion: reduce)')) {
  failures.push('company.css needs reveal styling and a reduced-motion override');
}

const legacyEnglish = readFileSync(join(root, 'en/index.html'), 'utf8');
if (!legacyEnglish.includes('noindex, follow') || !legacyEnglish.includes('window.location.replace')) {
  failures.push('en/index.html must remain a noindex compatibility redirect');
}

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
for (const url of [
  'https://maketh.au/services/affordable-web-design-australia/',
  'https://maketh.au/zh/services/affordable-web-design-australia/',
  'https://maketh.au/',
  'https://maketh.au/zh/',
  'https://maketh.au/services/web-design-brisbane/',
  'https://maketh.au/services/app-development-brisbane/',
  'https://maketh.au/services/ai-receptionist-brisbane/',
  'https://maketh.au/zh/services/web-design-brisbane/',
  'https://maketh.au/zh/services/app-development-brisbane/',
  'https://maketh.au/zh/services/ai-receptionist-brisbane/',
  'https://maketh.au/privacy/',
  'https://maketh.au/games/little-tower-defence/'
]) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) failures.push(`sitemap.xml is missing ${url}`);
}


const guideRoutes = ['services/affordable-web-design-australia/', 'zh/services/affordable-web-design-australia/'];
const pageTitles = new Set();
for (const relativePath of indexableCompanyPages) {
  const html = readFileSync(join(root, relativePath), 'utf8');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  if (pageTitles.has(title)) failures.push(`${relativePath} repeats another company's page title`);
  pageTitles.add(title);
  if (/"openingHours":"Mo-Su 00:00-23:59"/.test(html)) failures.push(`${relativePath} invents 24-hour staffed opening times`);
}
for (const route of guideRoutes) {
  const html = readFileSync(join(root, route, 'index.html'), 'utf8');
  const canonical = 'https://maketh.au/' + route;
  if (!html.includes(`rel="canonical" href="${canonical}"`)) failures.push(`${route} has an incorrect canonical`);
  for (const fact of ['199', '299', '888', 'Home', 'About', 'Product', '.com.au', '.au', 'Sydney', 'Melbourne', 'Perth', 'Western Australia', 'Brisbane', '/examples/starter/', '/examples/business/']) {
    if (!html.includes(fact)) failures.push(`${route} missing approved package/coverage fact ${fact}`);
  }
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  for (const type of ['Service', 'Organization', 'BreadcrumbList', 'FAQPage']) {
    if (!graph.some(node => node['@type'] === type)) failures.push(`${route} missing ${type}`);
  }
  const offers = graph.find(node => node['@type'] === 'Service').offers;
  if (offers.map(offer => offer.price).join(',') !== '199,299,888' || offers.some(offer => offer.priceCurrency !== 'AUD')) failures.push(`${route} incorrect approved prices/currency`);
  for (const offer of offers) {
    if (!/Desktop and mobile|电脑版及移动版/.test(offer.description)) failures.push(`${route} offer ${offer.price} missing both device layouts`);
    if (!html.includes(`id="package-${offer.price}"`) || offer.url !== canonical + '#package-' + offer.price) failures.push(`${route} offer has no visible price anchor`);
  }
  const faqs = graph.find(node => node['@type'] === 'FAQPage').mainEntity;
  for (const faq of faqs) {
    if (!html.includes(`<summary>${faq.name}</summary><p>${faq.acceptedAnswer.text}</p>`)) failures.push(`${route} FAQ structured data differs from visible answer`);
  }
  if (!/not claim to be the cheapest|不声称是全澳最便宜/.test(html)) failures.push(`${route} missing lowest-price comparison qualification`);
  if (!/email notifications are not included|套餐不包含邮件通知/.test(html)) failures.push(`${route} incorrectly includes email in the 299 package`);
  if (!/domain quoted separately|域名另行报价/.test(html)) failures.push(`${route} must state the 888 domain boundary`);
  if (!/other locations are served remotely|其他地区以远程方式服务/.test(html)) failures.push(`${route} missing real location boundary`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${requiredPages.length} pages, ${requiredAssets.length} required assets, ${requiredPublicFiles.length} public config files, local links, branding, and public-content boundaries.`);
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
