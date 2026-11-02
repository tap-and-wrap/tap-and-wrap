import { pathToFileURL } from 'node:url';
import { INITIAL_SETTINGS, INITIAL_SETTINGS_VERSION, validateInitialSettings } from './lib/gift-box-initial-settings.js';

export function parseProvisionArguments(args = []) {
  const options = { apply: false, target: null, confirmWrites: false, adminId: null };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--apply') options.apply = true;
    else if (args[index] === '--target') options.target = args[++index];
    else if (args[index] === '--confirm-initial-settings-writes') options.confirmWrites = true;
    else if (args[index] === '--admin-id') options.adminId = args[++index];
    else throw new Error('Unknown initial-settings argument.');
  }
  if (options.target !== null && !['local', 'staging'].includes(options.target)) throw new Error('Production provisioning is not supported by this tool.');
  if (options.apply && (!options.confirmWrites || !options.target || !/^[a-f0-9]{24}$/i.test(options.adminId ?? ''))) throw new Error('Explicit target, write confirmation and verified administrator ID are required.');
  return options;
}

export async function runInitialProvision(options, configuration = process.env) {
  validateInitialSettings();
  if (!options.apply) return { mode: 'offline-dry-run', connected: false, writes: false,
    version: INITIAL_SETTINGS_VERSION, settings: INITIAL_SETTINGS, existingSettingsPolicy: 'skip-without-modification' };
  // No dotenv loading, automatic DDL or inherited live connection is permitted.
  if (!options.confirmWrites || !['local', 'staging'].includes(options.target) || configuration.NODE_ENV === 'production'
    || configuration.DATABASE_TARGET !== options.target || !/^[a-f0-9]{24}$/i.test(options.adminId ?? '')) throw new Error('Initial-settings authorization or target is invalid.');
  process.env.TAP_WRAP_SKIP_DOTENV = 'true';
  const [{ default: mongoose }, { validateDatabaseUri, databaseDiagnostic }, { runtimeSettings }] = await Promise.all([
    import('mongoose'), import('../src/config/database-safety.js'), import('../src/config/deployment.js'),
  ]);
  const settings = { ...runtimeSettings(configuration), nodeEnv: configuration.NODE_ENV || 'development', databaseTarget: options.target, mongoUri: configuration.MONGODB_URI || '' };
  const target = validateDatabaseUri(settings.mongoUri, { target: settings.databaseTarget, nodeEnv: settings.nodeEnv });
  if (mongoose.connection.readyState !== 0) throw new Error('An existing database connection is not allowed.');
  try {
    await mongoose.connect(settings.mongoUri, { dbName: target.dbName, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 6000, maxPoolSize: 2 });
    const [{ User }, { provisionInitialSettings }] = await Promise.all([import('../src/models/User.js'), import('./lib/gift-box-initial-settings.js')]);
    const actor = await User.findOne({ _id: options.adminId, role: 'admin', active: true });
    const result = await provisionInitialSettings(actor, { authorized: true });
    return { mode: 'authorized-non-production-provision', ...result };
  } catch (error) { throw new Error(databaseDiagnostic(error).code ?? 'Initial settings could not be provisioned.'); }
  finally { await mongoose.disconnect(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log(JSON.stringify(await runInitialProvision(parseProvisionArguments(process.argv.slice(2))), null, 2)); }
  catch { console.error(JSON.stringify({ ok: false, error: 'Initial-settings provisioning rejected or failed. No automatic retry was attempted.' })); process.exitCode = 1; }
}
