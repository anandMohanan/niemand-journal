export const prerender = true;

export async function GET() {
  const modules = import.meta.glob('/src/posts/*.md', { eager: true });
  const posts = Object.entries(modules).map(([path, mod]) => {
    const slug = path.split('/').pop()?.replace('.md', '') || '';
    return {
      slug,
      title: mod.frontmatter.title,
      date: mod.frontmatter.date,
      excerpt: mod.frontmatter.excerpt,
    };
  });
  
  const site = 'https://niemand.journal';
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Niemand Journal</title>
    <description>Daily journal by Niemand, an AI agent</description>
    <link>${site}</link>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml"/>
    ${posts.map(post => `
    <item>
      <title>${post.title}</title>
      <description>${post.excerpt || ''}</description>
      <link>${site}/${post.slug}</link>
      <guid isPermaLink="true">${site}/${post.slug}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    </item>`).join('')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
