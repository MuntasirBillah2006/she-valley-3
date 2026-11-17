import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.ts';
import { blogPosts, categories, products } from '../../db/schema.ts';

export const seoRouter = Router();

function getBaseUrl(reqHost?: string, protocol = 'https'): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured.startsWith('http')) {
    return configured.replace(/\/+$/, '');
  }
  if (reqHost) {
    return `${protocol}://${reqHost}`;
  }
  return 'http://localhost:3000';
}

seoRouter.get('/robots.txt', (req, res) => {
  const baseUrl = getBaseUrl(req.get('host'), req.protocol);
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /en/admin',
    'Disallow: /bn/admin',
    'Disallow: /api/',
    'Disallow: /en/checkout',
    'Disallow: /bn/checkout',
    'Disallow: /en/account',
    'Disallow: /bn/account',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(body);
});

seoRouter.get('/sitemap.xml', async (req, res, next) => {
  try {
    const baseUrl = getBaseUrl(req.get('host'), req.protocol);
    const [activeCats, activeProds, publishedPosts] = await Promise.all([
      db.select({ slug: categories.slug, updatedAt: categories.updatedAt }).from(categories).where(eq(categories.isActive, true)),
      db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(eq(products.status, 'ACTIVE')),
      db.select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt }).from(blogPosts).where(eq(blogPosts.status, 'PUBLISHED')),
    ]);

    const staticPaths = ['', '/shop', '/track-order', '/journal', '/faq', '/about', '/contact'];
    const urlEntries: { locEn: string; locBn: string; lastmod?: string }[] = [];

    for (const p of staticPaths) {
      urlEntries.push({
        locEn: `${baseUrl}/en${p}`,
        locBn: `${baseUrl}/bn${p}`,
      });
    }
    for (const cat of activeCats) {
      urlEntries.push({
        locEn: `${baseUrl}/en/shop?category=${encodeURIComponent(cat.slug)}`,
        locBn: `${baseUrl}/bn/shop?category=${encodeURIComponent(cat.slug)}`,
        lastmod: cat.updatedAt.toISOString(),
      });
    }
    for (const prod of activeProds) {
      urlEntries.push({
        locEn: `${baseUrl}/en/products/${encodeURIComponent(prod.slug)}`,
        locBn: `${baseUrl}/bn/products/${encodeURIComponent(prod.slug)}`,
        lastmod: prod.updatedAt.toISOString(),
      });
    }
    for (const post of publishedPosts) {
      urlEntries.push({
        locEn: `${baseUrl}/en/journal/${encodeURIComponent(post.slug)}`,
        locBn: `${baseUrl}/bn/journal/${encodeURIComponent(post.slug)}`,
        lastmod: post.updatedAt.toISOString(),
      });
    }

    const xmlRows = urlEntries.flatMap((entry) => {
      const links = `
    <xhtml:link rel="alternate" hreflang="en" href="${entry.locEn}" />
    <xhtml:link rel="alternate" hreflang="bn" href="${entry.locBn}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${entry.locEn}" />`;
      const mod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : '';
      return [
        `  <url>\n    <loc>${entry.locEn}</loc>${mod}${links}\n  </url>`,
        `  <url>\n    <loc>${entry.locBn}</loc>${mod}${links}\n  </url>`,
      ];
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${xmlRows.join('\n')}\n</urlset>\n`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(xml);
  } catch (err) {
    next(err);
  }
});
