// Register before synthetic external adapters: later fixture routes may fulfill
// invented URLs, while unmatched third-party traffic never leaves the browser.
export async function blockExternalRequests(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.abort('blockedbyclient');
    return route.fallback();
  });
}
