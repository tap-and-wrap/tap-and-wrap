// Dedicated decoder process: no environment files, database, network or storage.
let sharp;
try { ({ default: sharp } = await import('sharp')); }
catch { process.exit(2); } // Missing native runtime is an operational outage.
sharp.cache(false);
sharp.concurrency(1);
const chunks = [];
let size = 0;
try {
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw Error('size');
    chunks.push(chunk);
  }
  const decoder = sharp(Buffer.concat(chunks), { failOn: 'warning', limitInputPixels: 40000000, limitInputChannels: 4, sequentialRead: true });
  const metadata = await decoder.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1
    || metadata.width < 1 || metadata.height < 1 || metadata.width > 12000 || metadata.height > 12000
    || metadata.width * metadata.height > 40000000 || metadata.channels > 4
    || metadata.width * metadata.height * metadata.channels * (metadata.depth === 'ushort' ? 2 : 1) > 160000000) throw Error('limits');
  // Force every pixel to decode, not just metadata. At most 160 MB raw 8-bit
  // output; no resize, metadata stripping, file write or evidence replacement.
  await decoder.timeout({ seconds: 3 }).raw({ depth: 'uchar' }).toBuffer();
  process.stdout.write(JSON.stringify({ format: metadata.format, width: metadata.width, height: metadata.height }));
} catch {
  process.exitCode = 1; // Never emit decoder internals or file contents.
}
