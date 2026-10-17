import type { MetadataRoute } from 'next';
import { publicApi } from '@/lib/server-api';
import type { Book, Page } from '@/lib/types';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3021';
const PAGE = 100;
const MAX_BOOKS = 5000;

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
  ];
  try {
    for (let offset = 0; offset < MAX_BOOKS; offset += PAGE) {
      const page = await publicApi<Page<Book>>(`/books?limit=${PAGE}&offset=${offset}`, 300);
      for (const b of page.items) {
        entries.push({
          url: `${SITE_URL}/books/${b.id}`,
          lastModified: b.updatedAt,
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }
      if (offset + PAGE >= page.page.total) break;
    }
  } catch {
    // The API being down must not turn the sitemap into an error page for crawlers.
  }
  return entries;
}
