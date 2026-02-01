import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://chess.rebundled.co';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/practice/'], // Keep practice sessions private
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
