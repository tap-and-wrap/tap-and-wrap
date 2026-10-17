import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const types = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const invalid = () => Object.assign(new Error('Use a complete, valid JPEG, PNG or WebP image up to 10 MB. Export HEIC or other formats as JPEG or PNG, then try again.'), { code: 'INVALID_IMAGE', status: 400 });
const unavailable = () => Object.assign(new Error('Image verification could not finish safely. Please retry later or use a smaller JPEG or PNG.'), { code: 'IMAGE_VERIFICATION_UNAVAILABLE', status: 503 });
let active = 0;
export async function verifyImageIntegrity(bytes, mimeType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 10 * 1024 * 1024 || !types[mimeType]) throw invalid();
  const signature = mimeType === 'image/png' ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    : mimeType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.subarray(-2).toString('hex') === 'ffd9'
      : bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length;
  if (!signature) throw invalid();
  if (mimeType === 'image/png') {
    let offset = 8, data = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      if (offset + size + 12 > bytes.length || type === 'acTL') throw invalid();
      if (type === 'IDAT' && size > 0) data = true;
      offset += size + 12;
      if (type === 'IEND') { ended = size === 0 && offset === bytes.length; break; }
    }
    if (!data || !ended) throw invalid();
  }
  // No unbounded queue of compressed images or native decoders in the API.
  if (active >= 2) throw Object.assign(new Error('Image verification is busy. Please retry shortly.'), { code: 'IMAGE_VERIFICATION_BUSY', status: 503 });
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const keys = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'];
      const child = spawn(process.execPath, ['--max-old-space-size=64', fileURLToPath(new URL('./image-decoder-process.js', import.meta.url))], {
        env: Object.fromEntries(keys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])),
        stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
      });
      let output = '', failed = false;
      const timer = setTimeout(() => { failed = true; child.kill('SIGKILL'); }, 8000);
      child.stdout.on('data', data => { output += data; if (output.length > 1024) { failed = true; child.kill('SIGKILL'); } });
      child.stdin.on('error', () => { /* Rejection is handled after process exit. */ });
      child.once('error', () => { clearTimeout(timer); reject(unavailable()); });
      // Keep the concurrency slot until close, including after a hard timeout.
      child.once('close', code => {
        clearTimeout(timer);
        if (failed || code === 2 || code === null) { reject(unavailable()); return; }
        try {
          const result = JSON.parse(output);
          if (failed || code !== 0 || result.format !== types[mimeType] || !Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height)) throw invalid();
          resolve({ width: result.width, height: result.height });
        } catch { reject(invalid()); }
      });
      child.stdin.end(bytes);
    });
  } finally { active--; }
}
