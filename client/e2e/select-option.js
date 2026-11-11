import { expect } from '@playwright/test';
/** Exercise the actual shared-control menu; never set application state from tests. */
export async function chooseOption(locator, selection) {
  const page = locator.page();
  const trigger = locator.and(page.getByRole('combobox')).first();
  await trigger.waitFor({ state: 'visible' });
  if (await trigger.evaluate(element => element.tagName === 'SELECT')) { await trigger.selectOption(selection); return; }
  await trigger.click();
  const id = await trigger.getAttribute('aria-controls');
  const popup = page.locator(`[id=${JSON.stringify(id)}]`);
  const value = typeof selection === 'string' ? selection : selection.value;
  let option;
  if (value !== undefined) option = popup.locator(`[data-option-value=${JSON.stringify(value)}]`);
  else if (selection.label !== undefined) option = popup.getByRole('option', { name: selection.label, exact: true });
  else option = popup.getByRole('option').nth(selection.index);
  await option.click();
}

export async function expectOptions(trigger, labels) {
  if (await trigger.evaluate(element => element.tagName === 'SELECT')) { await expect(trigger.locator('option')).toHaveText(labels); return; }
  await trigger.click();
  const id = await trigger.getAttribute('aria-controls');
  await expect(trigger.page().locator(`[id=${JSON.stringify(id)}]`).getByRole('option')).toHaveText(labels);
  await trigger.page().keyboard.press('Escape');
}
