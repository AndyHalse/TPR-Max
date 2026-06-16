import { db } from './db';
import { blogPosts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';

export const BASE_URL = 'https://www.tpr-max.com';
export const DEFAULT_OG_IMAGE = 'https://www.tpr-max.com/og-image.png';

function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const DEFAULT_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'TPR',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://www.tpr-max.com',
  description: 'UK-built connected workforce & site safety platform with 23 modules covering contractor compliance, emergency mustering, audits & inspections, risk assessments, CDM 2015, PPM, HR lifecycle, lone worker protection, permit-to-work, and more.',
  offers: { '@type': 'Offer', availability: 'https://schema.org/InStock' },
  provider: {
    '@type': 'Organization',
    name: 'ACS Safety & Security Ltd',
    url: 'https://www.acsltd.eu',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Wittas House, Two Rivers, Station Lane',
      addressLocality: 'Witney',
      postalCode: 'OX28 4BH',
      addressCountry: 'GB',
    },
    telephone: '+441344771569',
    email: 'andy@acsltd.eu',
  },
};

interface MetaInput {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object;
}

export function buildHead(meta: MetaInput): string {
  const {
    title,
    description,
    canonical,
    ogImage = DEFAULT_OG_IMAGE,
    ogType = 'website',
    jsonLd = DEFAULT_JSON_LD,
  } = meta;

  const t = esc(title);
  const d = esc(description);
  const c = esc(canonical);
  const img = esc(ogImage);
  const type = esc(ogType);

  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${c}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:url" content="${c}" />`,
    `<meta property="og:site_name" content="TPR" />`,
    `<meta property="og:locale" content="en_GB" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<meta name="twitter:creator" content="@ACSSystemsUK" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  ].join('\n    ');
}

const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Connected Workforce & Site Safety Platform UK | TPR',
    description:
      'TPR is a UK-built connected workforce & site safety platform — contractor compliance, emergency mustering, audits & inspections, risk assessments, CDM 2015, PPM, HR lifecycle and lone worker protection. Book a free demo.',
  },
  '/marketing': {
    title: 'TPR — Connected Workforce & Site Safety Platform | Book a Demo',
    description:
      'See how TPR brings contractor compliance, emergency mustering, audits, risk assessments and CDM 2015 into one UK-built platform. No app download. Book a free demo.',
  },
  '/about': {
    title: 'About ACS — The Team Behind TPR | Site Safety Software UK',
    description:
      'ACS Safety & Security Ltd builds TPR, a UK connected workforce and site safety platform. Learn about the company, our mission and how we help sites stay compliant.',
  },
  '/blog': {
    title: 'TPR Blog — Site Safety, Compliance & Workforce Management',
    description:
      'Practical guidance on contractor compliance, CDM 2015, emergency mustering, risk assessments and site safety from the team behind TPR.',
  },
};

async function resolveMeta(pathname: string): Promise<MetaInput> {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;

  if (ROUTE_META[path]) {
    return {
      ...ROUTE_META[path],
      canonical: path === '/' ? `${BASE_URL}/` : `${BASE_URL}${path}`,
    };
  }

  const blogMatch = path.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    try {
      const [post] = await db
        .select()
        .from(blogPosts)
        .where(eq(blogPosts.slug, slug))
        .limit(1);

      if (post && post.status === 'published') {
        let ogImage = DEFAULT_OG_IMAGE;
        if (post.coverImageUrl) {
          ogImage = post.coverImageUrl.startsWith('/')
            ? BASE_URL + post.coverImageUrl
            : post.coverImageUrl;
        }
        const canonical = `${BASE_URL}/blog/${post.slug}`;
        const description = (post.summary || '').slice(0, 160);
        const jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description,
          image: ogImage,
          datePublished: (post.publishedAt ?? post.createdAt).toISOString(),
          dateModified: post.updatedAt.toISOString(),
          author: { '@type': 'Person', name: post.author },
          publisher: {
            '@type': 'Organization',
            name: 'ACS Safety & Security Ltd',
            url: 'https://www.acsltd.eu',
          },
          mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        };
        return { title: `${post.title} | TPR Blog`, description, canonical, ogImage, ogType: 'article', jsonLd };
      }
    } catch {
      // fall through to default
    }
  }

  return { ...ROUTE_META['/'], canonical: `${BASE_URL}/` };
}

export async function injectSeo(template: string, url: string): Promise<string> {
  try {
    const pathname = url.split('?')[0].split('#')[0];
    const meta = await resolveMeta(pathname);
    return template.replace('<!--SEO_HEAD-->', buildHead(meta));
  } catch {
    return template;
  }
}

export function registerSeoRoutes(app: Express): void {
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /$',
        'Allow: /marketing',
        'Allow: /about',
        'Allow: /blog',
        'Disallow: /platform-admin',
        'Disallow: /contractor-portal',
        'Disallow: /contractor',
        'Disallow: /kiosk',
        'Disallow: /fire-marshal',
        'Disallow: /lone-worker',
        'Disallow: /bug-feedback',
        'Disallow: /settings',
        'Disallow: /staff',
        'Disallow: /visitors',
        'Disallow: /members',
        'Disallow: /contractors',
        'Disallow: /muster',
        'Disallow: /reports',
        'Disallow: /api/',
        '',
        'Sitemap: https://www.tpr-max.com/sitemap.xml',
      ].join('\n'),
    );
  });

  app.get('/sitemap.xml', async (_req, res) => {
    const staticUrls = [
      { loc: `${BASE_URL}/`,          changefreq: 'weekly', priority: '1.0' },
      { loc: `${BASE_URL}/marketing`, changefreq: 'weekly', priority: '0.8' },
      { loc: `${BASE_URL}/about`,     changefreq: 'weekly', priority: '0.8' },
      { loc: `${BASE_URL}/blog`,      changefreq: 'weekly', priority: '0.8' },
    ];

    let blogUrls: Array<{ loc: string; lastmod: string }> = [];
    try {
      const posts = await db
        .select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt, publishedAt: blogPosts.publishedAt })
        .from(blogPosts)
        .where(eq(blogPosts.status, 'published'));

      blogUrls = posts.map(p => ({
        loc: `${BASE_URL}/blog/${encodeURIComponent(p.slug)}`,
        lastmod: (p.updatedAt ?? p.publishedAt ?? new Date()).toISOString().split('T')[0],
      }));
    } catch {
      // Return static entries only if DB fails
    }

    const toEntry = (u: { loc: string; lastmod?: string; changefreq: string; priority: string }) =>
      `  <url>\n    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...staticUrls.map(u => toEntry(u)),
      ...blogUrls.map(u => toEntry({ ...u, changefreq: 'weekly', priority: '0.6' })),
      '</urlset>',
    ].join('\n');

    res.type('application/xml').send(xml);
  });
}
