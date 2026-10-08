import { readJsonInput, writeSeoOutput } from './seo/generator.js';

function parseArgs(args) {
  const options = { publish: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--publish') options.publish = true;
    else if (['--input', '--content', '--site-origin'].includes(arg) && args[index + 1] && !args[index + 1].startsWith('--')) options[arg.slice(2).replace('site-origin', 'siteOrigin')] = args[++index];
    else throw new Error('Use --input <project JSON>, --content <approved JSON>, --site-origin <HTTPS origin> and optional --publish');
  }
  return options;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const catalog = args.input ? await readJsonInput(args.input) : undefined;
  const content = args.content ? await readJsonInput(args.content) : undefined;
  const report = await writeSeoOutput({ catalog, content, siteOrigin: args.siteOrigin, publish: args.publish });
  process.stdout.write(`${JSON.stringify({ mode: args.publish ? 'explicit-publish-output' : 'development-noindex', databaseConnections: false, networkRequests: false, ...report }, null, 2)}\n`);
} catch (error) {
  // User-controlled URLs, paths and export content never enter error logs.
  const known = ['SEO input', 'SEO export', 'SEO output', 'SEO JSON', 'SEO cleanup', 'Existing SEO', 'Unsafe SEO', 'Unsafe previous', 'Duplicate ', 'Indexing requires', 'SITE origin', 'Vite HTML', 'Use --input'];
  process.stderr.write(`${known.some((prefix) => error.message?.startsWith(prefix)) ? error.message : 'SEO generation failed; verify explicit input and the completed Vite build'}\n`);
  process.exitCode = 1;
}
