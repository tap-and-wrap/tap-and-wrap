import { expect } from '@playwright/test';

// Exercise the required UI boundary, not a hidden input shortcut.
export async function chooseImageFiles(page, scope, name, files, source = 'Choose from Gallery') {
  const escaped = typeof name === 'string' ? name.replace(/\s*\*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const trigger = scope.getByRole('button', { name: escaped ? new RegExp(`^${escaped}(?:$|:)`) : name });
  await expect(trigger).toHaveCount(1);
  await trigger.click();
  const chooser = page.getByRole('dialog', { name: 'Choose image source', exact: true });
  await expect(chooser).toBeVisible();
  const native = page.waitForEvent('filechooser');
  await chooser.getByRole('button', { name: source, exact: true }).click();
  await (await native).setFiles(files);
  await expect(chooser).toHaveCount(0);
}
