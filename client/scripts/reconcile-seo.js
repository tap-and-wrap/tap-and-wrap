import { readJsonInput, buildSeoPlan } from './seo/generator.js';
import { publicationFor, comparePublications } from './seo/publication.js';

// Offline/stdout only. Explicit current and previous reviewed JSON are required.
// This never exports a catalog, changes database records, writes a file or deploys.
try {
  const options = {};
  for (let index = 0; index < process.argv.slice(2).length; index += 1) {
    const args = process.argv.slice(2);
    const key = args[index];
    if (!['--previous', '--input', '--content', '--previous-content', '--site-origin'].includes(key) || options[key] || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Use explicit --previous, --input, --site-origin and optional approved content paths');
    options[key] = args[++index];
  }
  if (!options['--previous'] || !options['--input'] || !options['--site-origin']) throw new Error('Use explicit --previous, --input and --site-origin');
  const now = new Date();
  const before = buildSeoPlan({ catalog: await readJsonInput(options['--previous']), content: options['--previous-content'] ? await readJsonInput(options['--previous-content']) : undefined, siteOrigin: options['--site-origin'], publish: true, now });
  const after = buildSeoPlan({ catalog: await readJsonInput(options['--input']), content: options['--content'] ? await readJsonInput(options['--content']) : undefined, siteOrigin: options['--site-origin'], publish: true, now });
  // Historical data can be expired; diff the plans without approving publication.
  before.sourceGeneratedAt = null;
  after.sourceGeneratedAt = null;
  process.stdout.write(`${JSON.stringify({ mode: 'offline-reconciliation', databaseConnections: false, networkRequests: false, filesWritten: false, ...comparePublications(publicationFor(before, { now }), publicationFor(after, { now })), currentReview: after.report }, null, 2)}\n`);
} catch { process.stderr.write('Offline SEO reconciliation failed; verify explicit reviewed project JSON and canonical origin.\n'); process.exitCode = 1; }
