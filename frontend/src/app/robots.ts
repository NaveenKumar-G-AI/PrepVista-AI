import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const publicAllowed = [
    '/',
    '/about',
    '/company',
    '/contact',
    '/pricing',
    '/privacy',
    '/terms',
    '/llms.txt',
  ];

  const privateDisallowed = [
    '/dashboard/',
    '/student-dashboard/',
    '/org-admin/',
    '/admin/',
    '/settings/',
    '/profile/',
    '/auth/',
    '/api/',
    '/interview/',
    '/history/',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: publicAllowed,
        disallow: privateDisallowed,
      },
      {
        userAgent: 'OAI-SearchBot',
        allow: publicAllowed,
        disallow: privateDisallowed,
      },
    ],
    sitemap: 'https://prepvistaai.com/sitemap.xml',
    host: 'https://prepvistaai.com',
  };
}
