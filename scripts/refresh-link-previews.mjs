import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const config = await readFile(join(root, 'astro.config.mjs'), 'utf8');
const origin = config.match(/\bsite:\s*["']([^"']+)["']/)?.[1];
if (!origin) throw new Error('Set site in astro.config.mjs before refreshing previews.');
const ownHosts = new Set([new URL(origin).hostname, 'anandmohanan.com', 'www.anandmohanan.com', 'niemand.blog', 'www.niemand.blog']);
const manifestPath = join(root, 'src/data/link-previews.json');
const isExternal = value => { try { return !ownHosts.has(new URL(value).hostname); } catch { return false; } };
const textOnly = entry => ({ title: entry.title || '', description: entry.description || '' });
const cache = Object.fromEntries(Object.entries(JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'))).filter(([url]) => isExternal(url)).map(([url,entry]) => [url,textOnly(entry)]));
const overrides = JSON.parse(await readFile(join(root, 'src/data/link-preview-overrides.json'), 'utf8').catch(() => '{}'));
const normalize = value => { const url = new URL(value); url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '') || '/'; return url.href; };
const decode = value => value.replace(/&#(x[\da-f]+|\d+);/gi, (_,n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : +n)).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2] ?? m[3])]));
const metadata = html => {
  const tags = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) { const a = attributes(tag); if (a.content) tags[a.property || a.name] = a.content; }
  return { title: tags['og:title'] || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim(), description: tags['og:description'] || tags.description || '' };
};
async function files(dir) {
  const out=[];
  for (const item of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,item.name);
    if(item.isDirectory()) out.push(...await files(path));
    else if(path.endsWith('.html')) out.push(path);
  }
  return out;
}
const urls = new Map();
for (const file of await files(join(root,'dist'))) {
  const html = await readFile(file,'utf8');
  for (const [tag] of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const href = attributes(tag.split('>')[0]).href;
    if (!href || href.startsWith('#')) continue;
    let url; try { url = new URL(href, origin); } catch { continue; }
    if (!['http:','https:'].includes(url.protocol) || /\.(xml|png|jpe?g|svg|webp|zip|mp4)$/i.test(url.pathname)) continue;
    if (ownHosts.has(url.hostname) || ['localhost','127.0.0.1','::1'].includes(url.hostname)) continue;
    const label = decode(tag.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
    urls.set(normalize(url.href), label.slice(0,160) || url.hostname);
  }
}
async function limited(response,max) {
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > max) throw Error('Response too large');
  const reader = response.body.getReader(); const chunks=[]; let size=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.length;
      if(size>max) throw Error('Response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
async function refresh(url,label) {
  const previous = cache[url] || {};
  try {
    const response = await fetch(url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'PersonalSite-LinkPreview/1.0','Accept':'text/html'}});
    if (!response.headers.get('content-type')?.includes('text/html')) throw Error('Not HTML');
    const meta = metadata((await limited(response,2_000_000)).toString('utf8'));
    cache[url] = { title: meta.title || previous.title || label, description: meta.description || previous.description || '' };
  } catch {
    cache[url] = { title: previous.title || label, description: previous.description || '' };
  }
}
const pending=[...urls];
await Promise.all(Array.from({length:4},async()=>{
  while(pending.length) { const [url,label]=pending.shift(); await refresh(url,label); }
}));
for (const [url, entry] of Object.entries(overrides)) if (isExternal(url)) cache[normalize(url)] = { ...cache[normalize(url)], ...textOnly(entry) };
await writeFile(manifestPath,JSON.stringify(Object.fromEntries(Object.entries(cache).sort(([a],[b])=>a.localeCompare(b))),null,2)+'\n');
console.log(`Cached text details for ${urls.size} external links. No images or visitor-time preview service are used.`);
