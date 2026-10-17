import type { MetadataRoute } from 'next';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3021';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/desk', '/login', '/bff'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
