import { prepareBox1Overlay } from './lib/prepare-box1-overlay.js';

if (process.argv.length !== 2) {
  console.error('This local-only Box 1 overlay command accepts no arguments.');
  process.exitCode = 1;
} else {
  try { console.log(JSON.stringify(await prepareBox1Overlay(), null, 2)); }
  catch (error) {
    console.error(error.message?.startsWith('Box 1') || error.message?.startsWith('Original Box 1') || error.message?.startsWith('Pinned Box 1') || error.message?.startsWith('Gift-box') ? error.message : 'Box 1 development overlay preparation failed without changing source artwork.');
    process.exitCode = 1;
  }
}
