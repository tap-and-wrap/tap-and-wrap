import { prepareBox1Candidate } from './lib/box-1-candidate.js';

if (process.argv.length !== 2) {
  console.error('This offline command accepts no source, output, approval or upload arguments.');
  process.exitCode = 1;
} else {
  try {
    const report = await prepareBox1Candidate();
    console.log(JSON.stringify({ mode: 'offline-versioned-candidate', candidateVersion: report.candidateVersion, status: report.status,
      sourceSha256: report.source.sha256, candidate: report.candidate, comparison: report.comparison,
      originalSourceUnchanged: report.originalSourceUnchanged, manifestUpdated: false, productionApproved: false, databaseConnections: false, networkRequests: false }, null, 2));
  } catch (error) {
    console.error(error.message?.startsWith('Candidate') || error.message?.startsWith('The manifest') || error.message?.startsWith('Gift-box output') ? error.message : 'Box-1 candidate preparation failed; verify the pinned source and safe ignored output directory.');
    process.exitCode = 1;
  }
}
