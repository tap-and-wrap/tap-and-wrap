import { realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { PROJECT_ROOT, validateStagingUri } from './import-catalog.js';
import { readCatalogWorkbook, buildCatalogPlan, workbookSha256 } from '../src/catalog/import-workbook.js';
import { validateCatalogModels } from '../src/catalog/import-catalog.js';
import { assertIdentityModels, planCategoryIdentityMigration, applyCategoryIdentityMigration } from '../src/catalog/category-import-identity.js';
import { writeImportReport } from '../src/catalog/import-report.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';

export function parseIdentityArguments(argv) {
  const options = { file: 'local-data/TapAndWrap_Website_Product_Master.xlsx', report: 'local-data/category-identity-report.json' };
  const valueFlags = new Map([['--file', 'file'], ['--report', 'report'], ['--reviewed', 'reviewed'], ['--target', 'target']]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (seen.has(flag)) throw new Error('Duplicate identity argument.'); seen.add(flag);
    if (valueFlags.has(flag)) { const value = argv[++index]; if (!value || value.startsWith('--')) throw new Error('Missing identity argument value.'); options[valueFlags.get(flag)] = value; }
    else if (['--inspect', '--apply', '--confirm-staging', '--confirm-category-identities', '--dry-run', '--help'].includes(flag)) options[flag.slice(2)] = true;
    else throw new Error('Unsupported identity argument.');
  }
  if (options.inspect && options.apply || options['dry-run'] && (options.inspect || options.apply)) throw new Error('Choose one offline, inspect or apply mode.');
  if (options.target && options.target !== 'staging') throw new Error('Production identity operations are disabled.');
  if ((options.inspect || options.apply) && (options.target !== 'staging' || !options['confirm-staging'])) throw new Error('Database access requires --target staging --confirm-staging and separate authorization.');
  if (options.apply && (!options.reviewed || !options['confirm-category-identities'])) throw new Error('Application requires a reviewed dry-run and --confirm-category-identities.');
  return options;
}

async function ownedFile(value) {
  const resolved = await realpath(path.resolve(PROJECT_ROOT, value));
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Identity files must remain inside this project.');
  return resolved;
}

export async function runCategoryIdentities(argv, { environment = process.env, log = console.log } = {}) {
  const options = parseIdentityArguments(argv);
  if (options.help) { log('Default: offline workbook/schema validation only. Separately authorized read: --inspect --target staging --confirm-staging. Separately authorized metadata migration: --apply --reviewed project/report.json --target staging --confirm-staging --confirm-category-identities. Never loads .env or application MONGODB_URI.'); return; }
  const file = await ownedFile(options.file);
  const before = await workbookSha256(file);
  const plan = buildCatalogPlan(await readCatalogWorkbook(file), { workbookHash: before });
  if (before !== await workbookSha256(file)) throw new Error('Workbook changed during inspection.');
  const models = { Product, ComponentOption, Category };
  await validateCatalogModels(plan, models);
  if (!options.inspect && !options.apply) {
    const report = { mode: 'offline-dry-run', counts: plan.report.counts, writes: 0, connectionOpened: false, next: 'A separately authorized inspection is required to resolve existing category IDs.' };
    log(JSON.stringify(report)); return report;
  }
  const reportPath = path.resolve(PROJECT_ROOT, options.report);
  if (path.extname(reportPath).toLowerCase() !== '.json' || reportPath === file) throw new Error('Use a separate JSON report.');
  // Validate writable destination before considering a connection.
  await ownedFile(path.relative(PROJECT_ROOT, path.dirname(reportPath)) || '.').catch((error) => {
    // The root is permitted as a parent; all actual output remains inside it.
    if (path.dirname(reportPath) !== PROJECT_ROOT) throw error;
  });
  await ownedFile(options.report).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  let reviewed;
  if (options.apply) {
    const reviewedPath = await ownedFile(options.reviewed);
    if (reviewedPath === file || reviewedPath === reportPath) throw new Error('Preserve the reviewed report and workbook; choose a separate output report.');
    reviewed = JSON.parse(await readFile(reviewedPath, 'utf8'));
  }
  const uri = validateStagingUri(environment.CATALOG_IMPORT_STAGING_URI, environment.NODE_ENV);
  try {
    await mongoose.connect(uri, { dbName: 'tapandwrap_staging', autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000, maxPoolSize: 2 });
    assertIdentityModels(models);
    let report;
    if (options.apply) {
      await Category.createIndexes();
      report = await applyCategoryIdentityMigration(plan, reviewed, models, { confirm: true });
    } else report = await planCategoryIdentityMigration(plan, models);
    await writeImportReport(reportPath, report);
    log(JSON.stringify({ mode: report.mode, proposals: report.proposals?.length, issues: report.issues?.length, updated: report.updated, writes: report.writes }));
    return report;
  } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCategoryIdentities(process.argv.slice(2)).catch(() => { console.error('Category identity operation failed. Review flags, the safe target and the dry-run privately. No credentials are logged.'); process.exitCode = 1; });
