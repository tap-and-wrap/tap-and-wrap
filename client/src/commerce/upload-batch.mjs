// Two complete sign/PUT/verify pipelines at a time. Preserve source ordering,
// stop scheduling after failure, and await siblings before a retry can start.
export const PRIVATE_UPLOAD_CONCURRENCY = 2;
export async function mapUploads(items, upload, { signal, concurrency = PRIVATE_UPLOAD_CONCURRENCY, onProgress } = {}) {
  const result = new Array(items.length);
  let next = 0, completed = 0, failure;
  async function worker() {
    while (!failure && next < items.length) {
      if (signal?.aborted) { failure = signal.reason || new Error('Upload cancelled.'); break; }
      const index = next++;
      try {
        result[index] = await upload(items[index], index);
        completed++; onProgress?.(`Preparing your files (${completed}/${items.length})`);
      } catch (error) { failure ||= error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failure) throw failure;
  if (signal?.aborted) throw signal.reason || new Error('Upload cancelled.');
  return result;
}
