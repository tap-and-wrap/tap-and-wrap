import {
  mkdir,
  writeFile
} from "node:fs/promises";
import {
  resolve
} from "node:path";

const siteUrl = String(
  process.env.SITE_URL ||
    process.argv[2] ||
    ""
)
  .trim()
  .replace(/\/+$/, "");

if (!/^https?:\/\/[^/]+/i.test(siteUrl)) {
  console.error(
    "Provide the final domain, for example:\nnode scripts/generateSeoFiles.mjs https://tapandwrap.com"
  );

  process.exit(1);
}

const publicDirectory =
  resolve(
    process.cwd(),
    "public"
  );

await mkdir(
  publicDirectory,
  {
    recursive: true
  }
);

const publicRoutes = [
  {
    path: "/",
    changefreq: "weekly",
    priority: "1.0"
  },
  {
    path: "/shop",
    changefreq: "daily",
    priority: "0.9"
  },
  {
    path: "/services",
    changefreq: "monthly",
    priority: "0.8"
  },
  {
    path: "/track-order",
    changefreq: "monthly",
    priority: "0.6"
  },
  {
    path: "/faq",
    changefreq: "monthly",
    priority: "0.7"
  },
  {
    path: "/delivery-returns",
    changefreq: "monthly",
    priority: "0.6"
  },
  {
    path: "/contact",
    changefreq: "monthly",
    priority: "0.7"
  },
  {
    path: "/privacy-policy",
    changefreq: "yearly",
    priority: "0.3"
  },
  {
    path: "/terms",
    changefreq: "yearly",
    priority: "0.3"
  }
];

const sitemapEntries =
  publicRoutes
    .map(
      (route) => `
  <url>
    <loc>${siteUrl}${route.path}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
    )
    .join("");

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapEntries}
</urlset>
`;

const robots =
  `User-agent: *
Allow: /

Disallow: /admin
Disallow: /checkout
Disallow: /order-success/
Disallow: /payment-result

Sitemap: ${siteUrl}/sitemap.xml
`;

await Promise.all([
  writeFile(
    resolve(
      publicDirectory,
      "sitemap.xml"
    ),
    sitemap,
    "utf8"
  ),

  writeFile(
    resolve(
      publicDirectory,
      "robots.txt"
    ),
    robots,
    "utf8"
  )
]);

console.log(
  `SEO files generated for ${siteUrl}`
);
