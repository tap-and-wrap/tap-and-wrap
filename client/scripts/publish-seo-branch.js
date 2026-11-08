import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RENEWAL_FILES, validateSealedPublication } from './seo/renewal.js';

// The tree equals reviewed main plus three public artifacts. A merge parent
// retains publication history without rebasing or force-pushing either branch.
export async function publishSeoBranch({ cwd = process.cwd(), token = process.env.GH_PUBLICATION_TOKEN } = {}) {
  if (!token) throw Error('The job-scoped repository token is required');
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + token).toString('base64') };
  delete env.GH_PUBLICATION_TOKEN;
  const git = (args, extra = {}) => execFileSync('git', args, { cwd, env: { ...env, ...extra.env }, input: extra.input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const read = async name => JSON.parse(await readFile(path.join(cwd, 'seo-publication', name + '.json'), 'utf8'));
  const [catalog, content, lock] = await Promise.all(['catalog', 'content', 'lock'].map(read));
  validateSealedPublication({ lock, catalog, content });
  if (git(['rev-parse', 'HEAD']) !== lock.sourceCommit) throw Error('Working source differs from reviewed main');
  const main = git(['ls-remote', '--exit-code', 'origin', 'refs/heads/main']).split(/\s/)[0];
  if (main !== lock.sourceCommit) throw Error('Main advanced; renew from the new reviewed source');
  const remote = git(['ls-remote', 'origin', 'refs/heads/seo-publication']);
  const previous = remote ? remote.split(/\s/)[0] : null;
  if (previous) git(['fetch', '--no-tags', 'origin', 'refs/heads/seo-publication']);
  const temporary = await mkdtemp(path.join(tmpdir(), 'tap-wrap-seo-index-'));
  const indexEnv = { GIT_INDEX_FILE: path.join(temporary, 'index') };
  try {
    git(['read-tree', lock.sourceCommit], { env: indexEnv });
    for (const file of RENEWAL_FILES) {
      const hash = git(['hash-object', '-w', '--', file]);
      git(['update-index', '--add', '--cacheinfo', `100644,${hash},${file}`], { env: indexEnv });
    }
    const tree = git(['write-tree'], { env: indexEnv });
    const parents = previous ? ['-p', previous, '-p', lock.sourceCommit] : ['-p', lock.sourceCommit];
    const identity = { GIT_AUTHOR_NAME: 'Tap & Wrap SEO renewal', GIT_AUTHOR_EMAIL: 'seo-renewal@users.noreply.github.com', GIT_COMMITTER_NAME: 'Tap & Wrap SEO renewal', GIT_COMMITTER_EMAIL: 'seo-renewal@users.noreply.github.com' };
    const commit = git(['commit-tree', tree, ...parents], { env: identity, input: `Renew verified SEO publication ${lock.publicationId}\n\nReviewed source: ${lock.sourceCommit}\nExpires: ${lock.expiresAt}\n` });
    if (git(['ls-remote', '--exit-code', 'origin', 'refs/heads/main']).split(/\s/)[0] !== main) throw Error('Main changed before publication push');
    // No main write, force push or branch-protection bypass. Concurrent branch
    // updates reject; an uncertain response is reconciled against remote history.
    git(['push', '--porcelain', 'origin', `${commit}:refs/heads/seo-publication`]);
    return { commit, sourceCommit: main, publicationId: lock.publicationId, expiresAt: lock.expiresAt, branch: 'seo-publication' };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  publishSeoBranch().then(result => console.log(JSON.stringify(result))).catch(() => { console.error('Publication push rejected or failed; inspect branch permissions, source drift and the prior remote commit before retrying. No main write or force push attempted.'); process.exitCode = 1; });
}
