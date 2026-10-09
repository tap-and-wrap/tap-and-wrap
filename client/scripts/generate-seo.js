import { readJsonInput, writeSeoOutput } from './seo/generator.js';

function parseArgs(args) {
  const options = { publish: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error('Use each explicit SEO argument once');
    seen.add(arg);
    if (arg === '--publish') options.publish = true;
    else if (['--input', '--content', '--site-origin', '--max-age-seconds', '--minimum-category-products'].includes(arg) && args[index + 1] && !args[index + 1].startsWith('--')) {
      const key = ({ 'site-origin': 'siteOrigin', 'max-age-seconds': 'maximumAgeSeconds', 'minimum-category-products': 'minimumCategoryProducts' })[arg.slice(2)] || arg.slice(2);
      const value = args[++index];
      options[key] = ['maximumAgeSeconds', 'minimumCategoryProducts'].includes(key) ? Number(value) : value;
    }
    else throw new Error('Use --input <project JSON>, --content <approved JSON>, --site-origin <HTTPS origin> and optional --publish');
  }
  return options;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const catalog = args.input ? await readJsonInput(args.input) : undefined;
  const content = args.content ? await readJsonInput(args.content) : undefined;
  const report = await writeSeoOutput({ catalog, content, siteOrigin: args.siteOrigin, publish: args.publish, maximumAgeSeconds: args.maximumAgeSeconds, minimumCategoryProducts: args.minimumCategoryProducts });
  process.stdout.write(`${JSON.stringify({ mode: args.publish ? 'explicit-publish-output' : 'development-noindex', databaseConnections: false, networkRequests: false, ...report }, null, 2)}\n`);
} catch (error) {
  // User-controlled URLs, paths and export content never enter error logs.
  const known = ['SEO input', 'SEO export', 'SEO output', 'SEO JSON', 'SEO cleanup', 'SEO publication', 'SEO snapshot', 'SEO source', 'SEO category', 'SEO generation', 'Existing SEO', 'Unsafe SEO', 'Unsafe previous', 'Duplicate ', 'Indexing requires', 'SITE origin', 'Vite HTML', 'Use --input'];
  process.stderr.write(`${known.some((prefix) => error.message?.startsWith(prefix)) ? error.message : 'SEO generation failed; verify explicit input and the completed Vite build'}\n`);
  process.exitCode = 1;
}
