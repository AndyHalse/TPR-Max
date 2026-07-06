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

// keep in sync with pricing plans in MarketingPage.tsx
const MARKETING_PLANS = [
  {
    name: 'TPR Basic',
    price: '49',
    description: 'For offices and smaller sites that need personnel tracking, emergency mustering, and essential site safety tools.',
  },
  {
    name: 'TPR Pro',
    price: '89',
    description: 'For organisations actively managing contractors, safety compliance, incidents, and high-risk work activities.',
  },
  {
    name: 'TPR Max',
    price: '195',
    description: 'The full connected workforce and site safety platform for complex, high-compliance sites and multi-site portfolios.',
  },
];

const MARKETING_FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is TPR?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TPR is a UK-built connected workforce and site safety platform — contractor compliance software, visitor management system, emergency mustering, audits and inspections, risk assessments, lone worker protection, CDM 2015, PPM, and HR lifecycle management, all in one subscription.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do visitors and contractors need to download an app?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. TPR is entirely browser-based. Visitors sign in via QR code on any device, Fire Marshals access their evacuation panel through a permanent bookmarked link, and contractors complete inductions and compliance checks online — no app download or installation required.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does TPR handle contractor compliance and CDM 2015?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. TPR includes dedicated contractor compliance software covering RAMS management, contractor inductions, right-to-work checks, document control, and a full CDM 2015 project management module — all built to UK Health & Safety legislation.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can TPR run an emergency muster and evacuation roll call?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. TPR\'s emergency mustering software supports up to 16 colour-coded evacuation zones, a digital roll-call for staff, visitors, contractors and members, targeted zone alerts by email, automatic PEEP flagging for persons needing evacuation assistance, and a Fire Marshal mobile panel that works instantly without any login or app.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is TPR built in the UK and GDPR-compliant?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. TPR is designed and supported by ACS Safety & Security Ltd, based in Witney, Oxfordshire. Data is held in isolated per-customer tenants, end-to-end encrypted, and never shared between organisations. TPR is fully GDPR-compliant and built around UK-specific regulations including CDM 2015, RIDDOR 2013, RRO 2005, and Martyn\'s Law.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does TPR cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TPR plans start from £49 per site per month (TPR Basic), with TPR Pro at £89 per site per month and TPR Max at £195 per site per month. All plans are billed per site with no setup fees, no long-term contracts, and no hidden costs.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which industries does TPR support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'TPR is used across construction and civil engineering, manufacturing and warehousing, NHS trusts and healthcare, schools, colleges and universities, facilities management, and commercial offices and business parks — wherever UK Health & Safety legislation and contractor or visitor management is required.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does TPR include lone worker protection?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. The TPR Max plan includes a lone worker protection system with automated welfare check-ins, escalation alerts, and reporting — suitable for lone workers operating on-site or off-site.',
      },
    },
  ],
};

const MARKETING_PRODUCT_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'TPR — Connected Workforce & Site Safety Platform',
  description: 'UK contractor compliance software, visitor management system, emergency mustering software, lone worker protection, CDM 2015, PPM, audits and inspections — 26 modules in one platform.',
  brand: {
    '@type': 'Organization',
    name: 'ACS Safety & Security Ltd',
    url: 'https://www.acsltd.eu',
  },
  url: 'https://www.tpr-max.com/marketing',
  offers: MARKETING_PLANS.map(plan => ({
    '@type': 'Offer',
    name: plan.name,
    description: plan.description,
    price: plan.price,
    priceCurrency: 'GBP',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: plan.price,
      priceCurrency: 'GBP',
      unitText: 'per site per month',
    },
    availability: 'https://schema.org/InStock',
    url: 'https://www.tpr-max.com/marketing#pricing',
    seller: {
      '@type': 'Organization',
      name: 'ACS Safety & Security Ltd',
      url: 'https://www.acsltd.eu',
    },
  })),
};

interface MetaInput {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object | object[];
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

  const ldScripts = Array.isArray(jsonLd)
    ? jsonLd.map(ld => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`).join('\n    ')
    : `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

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
    ldScripts,
  ].join('\n    ');
}

const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'TPR — Site Risk & Compliance Software for Contractors, Visitors & Staff',
    description:
      'TPR is site risk and compliance software for UK sites: contractor compliance and CDM verification, digital inductions, permit-to-work, risk assessments, incident reporting and emergency mustering — with a full audit trail. One platform, one login.',
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

  if (path === '/marketing') {
    return {
      ...ROUTE_META['/marketing'],
      canonical: `${BASE_URL}/marketing`,
      jsonLd: [DEFAULT_JSON_LD, MARKETING_FAQ_JSON_LD, MARKETING_PRODUCT_JSON_LD],
    };
  }

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
