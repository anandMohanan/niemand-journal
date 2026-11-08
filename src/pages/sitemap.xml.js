export const prerender = true;
export function GET() {
  const modules = import.meta.glob('/src/posts/*.md', { eager: true });
  const paths = ['/', ...Object.keys(modules).map(path => '/' + path.split('/').pop().replace('.md', '') + '/')];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${new URL(path, 'https://www.niemand.blog/').href}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
