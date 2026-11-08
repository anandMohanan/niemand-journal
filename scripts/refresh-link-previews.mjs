import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.cwd();
const config = await readFile(join(root, 'astro.config.mjs'), 'utf8');
const origin = config.match(/\bsite:\s*["']([^"']+)["']/)?.[1];
if (!origin) throw new Error('Set site in astro.config.mjs before refreshing previews.');
const manifestPath = join(root, 'src/data/link-previews.json');
const cache = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'));
const overrides = JSON.parse(await readFile(join(root, 'src/data/link-preview-overrides.json'), 'utf8').catch(() => '{}'));
const normalize = value => { const url = new URL(value); url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '') || '/'; return url.href; };
const decode = value => value.replace(/&#(x[\da-f]+|\d+);/gi, (_,n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : +n)).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2] ?? m[3])]));
const metadata = html => {
  const tags = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) { const a = attributes(tag); if (a.content) tags[a.property || a.name] = a.content; }
  return { title: tags['og:title'] || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim(), description: tags['og:description'] || tags.description || '', imageUrl: tags['og:image'] || tags['twitter:image'] };
};
async function files(dir) { const out=[]; for (const item of await readdir(dir,{withFileTypes:true})) { const path=join(dir,item.name); if(item.isDirectory())out.push(...await files(path));else if(path.endsWith('.html'))out.push(path); } return out; }
const urls = new Map();
const local = new Map();
for (const file of await files(join(root,'dist'))) {
  const html = await readFile(file,'utf8');
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].map(m=>attributes(m[0])).find(a=>a.rel === 'canonical');
  const canonical = canonicalTag?.href;
  if (canonical && !file.endsWith('404.html')) local.set(normalize(canonical), metadata(html));
  for (const [tag] of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const href = attributes(tag.split('>')[0]).href;
    if (!href || href.startsWith('#')) continue;
    let url; try { url = new URL(href, canonical || origin); } catch { continue; }
    if (!['http:','https:'].includes(url.protocol) || /\.(xml|png|jpe?g|svg|webp|zip|mp4)$/i.test(url.pathname)) continue;
    if (['localhost','127.0.0.1','::1'].includes(url.hostname)) continue;
    const label = decode(tag.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
    urls.set(normalize(url.href), label.slice(0,160) || url.hostname);
  }
}
async function limited(response,max) {
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > max) throw Error('Response too large');
  const reader = response.body.getReader(); const chunks=[]; let size=0;
  try { while(true) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Response too large');chunks.push(value); } }
  finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
async function refresh(url,label) {
  const previous = cache[url] || {};
  try {
    let meta = local.get(url);
    if (!meta) {
      const response = await fetch(url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'PersonalSite-LinkPreview/1.0','Accept':'text/html'}});
      if (!response.headers.get('content-type')?.includes('text/html')) throw Error('Not HTML');
      meta = metadata((await limited(response,2_000_000)).toString('utf8'));
    }
    const entry = { title: meta.title || previous.title || label, description: meta.description || previous.description || '' };
    if (previous.screenshot) entry.screenshot = previous.screenshot;
    if (previous.image) entry.image = previous.image;
    try {
    if (meta.imageUrl && !entry.screenshot) {
      const imageUrl = new URL(meta.imageUrl,url);
      if (!['http:','https:'].includes(imageUrl.protocol)) throw Error('Invalid image URL');
      const response = await fetch(imageUrl,{signal:AbortSignal.timeout(8000)});
      const type=response.headers.get('content-type')?.split(';')[0];
      const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif','image/gif':'gif'}[type];
      if (ext) {
        const data=await limited(response,4_000_000);
        const filename=createHash('sha256').update(url).digest('hex').slice(0,16)+'.'+ext;
        await writeFile(join(root,'public/link-previews',filename),data);
        entry.image='/link-previews/'+filename;
      }
    }
    } catch { /* Keep usable metadata when a preview image cannot be downloaded. */ }
    cache[url]=entry;
  } catch {
    cache[url]={title:previous.title || label,description:previous.description || '',...(previous.image?{image:previous.image}:{}),...(previous.screenshot?{screenshot:previous.screenshot}:{})};
  }
}
await mkdir(join(root,'public/link-previews'),{recursive:true});
const pending=[...urls];
await Promise.all(Array.from({length:4},async()=>{while(pending.length){const [url,label]=pending.shift();await refresh(url,label);}}));
for (const [url, entry] of Object.entries(overrides)) cache[url] = { ...cache[url], ...entry };
await writeFile(manifestPath,JSON.stringify(Object.fromEntries(Object.entries(cache).sort(([a],[b])=>a.localeCompare(b))),null,2)+'\n');
console.log(`Cached ${urls.size} public links; ${Object.values(cache).filter(x=>x.image || x.screenshot).length} have images. No visitor-time preview service is used.`);
