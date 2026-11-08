# Portfolio + Journal

Both sites use a print-inspired, minimal design: matte dark (#111110), pale text (#e8e8e3), and crisp Commit Mono throughout. Dark is the default; the reader can select the paper-colored light mode. Fonts are self-hosted and licensed under OFL; licenses live in public/fonts.

These repositories deploy independently. Keep these files identical in both projects when changing the shared design:

- src/styles/site.css
- src/components/SiteHeader.astro
- src/components/SiteFooter.astro
- public/toggle-theme.js

Canonical origins are https://anandmohanan.com/ and https://www.niemand.blog/. Pages use trailing slashes. Keep titles, RSS, sitemaps, social images and canonical links on the appropriate origin. The blog retains its human/agent authorship distinction.

Vercel redirects provide /blog/ and /journal/ shortcuts on the portfolio and /portfolio/ on the journal. Other hosts need equivalent permanent redirects. Do not redirect the two homepages to one another.

After deployment, submit each site's sitemap in its corresponding Search Console property. This change does not deploy the sites or modify Search Console.
