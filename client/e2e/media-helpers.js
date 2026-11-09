import { expect } from '@playwright/test';

// Exercise the required UI boundary, not a hidden input shortcut.
export async function chooseImageFiles(page, scope, name, files) {
  const escaped = typeof name === 'string' ? name.replace(/\s*\*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const trigger = scope.getByRole('button', { name: escaped ? new RegExp(`^${escaped}(?:$|:)`) : name });
  await expect(trigger).toHaveCount(1);
  const native = page.waitForEvent('filechooser');
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Choose image source', exact: true })).toHaveCount(0);
  const chooser = await native;
  await chooser.setFiles(files);
  await expect.poll(()=>chooser.element().evaluate(node=>node.files.length)).toBe(0);
}
