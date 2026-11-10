import { test, expect } from '@playwright/test';
export const api = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_API_PORT}/api/v1`, origin = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_WEB_PORT}`;
test.beforeEach(async ({ context }) => { await context.route('**/*', route => { const url = new URL(route.request().url()); return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort(); }); });
export async function headers(context) { return { Origin: origin, 'x-csrf-token': (await (await context.request.get(`${api}/auth/csrf`)).json()).data.csrfToken }; }
export async function post(context, path, data) { return context.request.post(api + path, { headers: await headers(context), data }); }
export async function image(page, width = 900, height = 600) {
  const base64 = await page.evaluate(({ width, height }) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const c = canvas.getContext('2d'); if (width > 500) { c.fillStyle = '#e9e0d3'; c.fillRect(0, 0, width, height); c.fillStyle = '#faf7f0'; c.fillRect(width*.12,height*.08,width*.76,height*.84); c.strokeStyle='#b4a38d'; c.lineWidth=4; c.strokeRect(width*.12,height*.08,width*.76,height*.84); } else { c.fillStyle = '#ed2019'; c.fillRect(0, 0, width / 2, height); c.fillStyle = '#1663e7'; c.fillRect(width / 2, 0, width / 2, height); } return canvas.toDataURL('image/png').split(',')[1]; }, { width, height });
  return { name: 'synthetic-private.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
export async function choose(page, name, file) { const picker = page.waitForEvent('filechooser'); await page.getByRole('button', { name }).click(); await (await picker).setFiles(file); }
export async function open(page) { await page.goto('/customize/laser-engraving'); await expect(page.getByRole('heading', { name: 'Your piece. Your story.' })).toBeVisible(); await page.getByLabel('Engraving type', { exact: true }).selectOption('perfume'); }
export async function start(page) { await open(page); const surface = await image(page); await choose(page, /Engraving surface: Choose surface photo/, surface); await expect(page.locator('.sv-surface-preview .ve-surface')).toBeVisible(); await page.getByRole('button', { name: 'Design Your Engraving', exact: true }).click(); await expect(page.getByRole('button', { name: 'Add text', exact: true })).toBeVisible(); return surface; }
export async function words(page, value = 'A lasting memory') { await page.getByRole('button', { name: 'Add text', exact: true }).click(); await page.getByLabel('Your text', { exact: true }).fill(value); }
export async function review(page) { await page.getByRole('button', { name: 'Review Your Engraving', exact: true }).click(); await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled(); }
export async function add(page) { await review(page); await page.getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your engraving is in the cart' })).toBeVisible(); }
export async function cart(context) { return (await (await context.request.get(`${api}/commerce/cart`)).json()).data.cart; }
export async function shot(page, info, name, width) { await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready); await page.evaluate(() => window.scrollTo(0, 0)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true }); }


export { test, expect };
