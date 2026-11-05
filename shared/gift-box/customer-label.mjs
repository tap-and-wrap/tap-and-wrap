// Normalize only generic legacy labels for display; never rewrite merchant data.
export function customerGiftComponentName(component) {
  const name=component?.displayName || '';
  if (component?.category !== 'plush' && !component?.componentId?.startsWith('plush-')) return name;
  const generic=/^plush(?:\s+(toys?))?(?:\s+(\d+))?$/i.exec(name.trim());
  return generic ? `Soft ${generic[1]?.toLowerCase() === 'toys' && !generic[2] ? 'Toys' : 'Toy'}${generic[2] ? ` ${generic[2]}` : ''}` : name;
}
