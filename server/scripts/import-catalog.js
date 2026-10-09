import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogPlan, readCatalogWorkbook, workbookSha256 } from '../src/catalog/import-workbook.js';
import { validateDatabaseUri, assertConnectedDatabase } from '../src/config/database-safety.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { validateCatalogModels } from '../src/catalog/import-catalog.js';
import { writeImportReport } from '../src/catalog/import-report.js';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function parseImportArguments(argv) {
  const options = { apply: false, target: null, confirmStaging: false, batchSize: 50,
    file: 'local-data/TapAndWrap_Website_Product_Master.xlsx', report: 'local-data/catalog-import-report.json' };
  const valueFlags = new Map([['--file', 'file'], ['--report', 'report'], ['--target', 'target'], ['--batch-size', 'batchSize']]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    seen.add(flag);
    if (flag === '--apply') options.apply = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--confirm-staging') options.confirmStaging = true;
    else if (flag === '--help') options.help = true;
    else if (valueFlags.has(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[valueFlags.get(flag)] = flag === '--batch-size' ? Number(value) : value;
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  if (options.apply && options.dryRun) throw new Error('--apply and --dry-run cannot be combined');
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) throw new Error('--batch-size must be from 1 to 100');
  if (options.target && options.target !== 'staging') throw new Error('Production targets are disabled; only an explicitly confirmed staging target is supported');
  if (options.apply && (options.target !== 'staging' || !options.confirmStaging)) throw new Error('Applying requires --apply --target staging --confirm-staging');
  return options;
}

export function validateStagingUri(uri, nodeEnv) {
  if (nodeEnv === 'production') throw new Error('Catalog database writes are disabled in production');
  if (!uri) throw new Error('CATALOG_IMPORT_STAGING_URI must explicitly identify the staging database');
  validateDatabaseUri(uri, { target: 'staging', nodeEnv: nodeEnv || 'development' });
  return uri;
}

function requireInsideProject(candidate) {
  const relative = path.relative(PROJECT_ROOT, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Catalog files and reports must remain inside the Tap & Wrap project');
  return candidate;
}

export async function runCatalogImport(argv, { env = process.env, log = console.log } = {}) {
  const options = parseImportArguments(argv);
  if (options.help) {
    log('npm run catalog:import -- [--dry-run] [--file project/path.xlsx] [--report project/report.json] [--batch-size 1..100]\nStaging only: --apply --target staging --confirm-staging with CATALOG_IMPORT_STAGING_URI naming exactly tapandwrap_staging. Production writes are disabled.');
    return null;
  }
  // Resolve symlinks before reading to keep even alternate workbook inputs in this project.
  const workbookPath = requireInsideProject(await realpath(path.resolve(PROJECT_ROOT, options.file)));
  const reportPath = requireInsideProject(path.resolve(PROJECT_ROOT, options.report));
  if (reportPath === workbookPath || path.extname(reportPath).toLowerCase() !== '.json') throw new Error('Report must be a separate .json file');
  const reportParent = path.dirname(reportPath);
  // Reports use an existing project directory; do not create arbitrary paths through symlinks.
  const realReportParent = await realpath(reportParent);
  if (realReportParent !== PROJECT_ROOT) requireInsideProject(realReportParent);
  try { requireInsideProject(await realpath(reportPath)); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const hashBefore = await workbookSha256(workbookPath);
  const sheets = await readCatalogWorkbook(workbookPath);
  const plan = buildCatalogPlan(sheets, { workbookHash: hashBefore });
  plan.report.workbook = path.relative(PROJECT_ROOT, workbookPath).split(path.sep).join('/');
  const hashAfter = await workbookSha256(workbookPath);
  if (hashBefore !== hashAfter) throw new Error('Workbook changed during inspection; import aborted');
  plan.report.workbookUnchanged = true;

  if (!plan.report.fatalErrors.length && !plan.report.invalidRows.length) {
    try { plan.report.schemaValidation = await validateCatalogModels(plan, { Product, Category, ComponentOption }); }
    catch {
      plan.report.schemaValidation = { valid: false };
      plan.report.fatalErrors.push('Catalog schema preflight failed; no connection was opened. Check workbook fields against the catalog models.');
    }
  }
  // A reviewable validation report exists before any connection or persistent write.
  await writeImportReport(reportPath, plan.report);

  if (options.apply) {
    // Workbook validation must finish before considering a database connection.
    if (plan.report.fatalErrors.length || plan.report.invalidRows.length) {
      await writeImportReport(reportPath, plan.report);
      throw new Error('Catalog validation failed; no database connection was opened. Review the local report.');
    }
    const uri = validateStagingUri(env.CATALOG_IMPORT_STAGING_URI, env.NODE_ENV);
    const [{ default: mongoose }, { applyCatalogPlan }] = await Promise.all([
      import('mongoose'), import('../src/catalog/import-catalog.js'),
    ]);
    try {
      await mongoose.connect(uri, { dbName: 'tapandwrap_staging', autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000, maxPoolSize: 2 });
      assertConnectedDatabase(mongoose.connection, { target: 'staging', nodeEnv: env.NODE_ENV || 'development' });
      plan.report.mode = 'apply';
      plan.report.application = await applyCatalogPlan(plan, { Category, Product, ComponentOption, batchSize: options.batchSize,
        onProgress: async (application) => { plan.report.application = application; await writeImportReport(reportPath, plan.report); } });
    } catch (error) {
      plan.report.application = error.importReport || { mode: 'apply', status: 'failed', failureCode: 'IMPORT_CONNECTION_OR_SETUP_FAILED', countsUncertain: true };
      await writeImportReport(reportPath, plan.report);
      throw error;
    } finally { await mongoose.disconnect(); }
  }
  await writeImportReport(reportPath, plan.report);
  log(JSON.stringify({ mode: plan.report.mode, workbookUnchanged: plan.report.workbookUnchanged, counts: plan.report.counts,
    fatalErrors: plan.report.fatalErrors, roles: plan.report.roleCounts, report: path.relative(PROJECT_ROOT, reportPath),
    ...(plan.report.application ? { application: plan.report.application } : {}) }, null, 2));
  if (plan.report.fatalErrors.length || plan.report.invalidRows.length) throw new Error('Catalog dry-run found invalid data; review the report. No database connection was opened.');
  return plan.report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCatalogImport(process.argv.slice(2)).catch(() => {
    // URI/driver errors may contain credentials; do not echo arbitrary exception text.
    console.error('Catalog import failed. Review the local report and verify arguments, staging safeguards, and workbook validation. No application MongoDB credentials are used.');
    process.exitCode = 1;
  });
}
