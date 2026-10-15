// Read-only aliases. Stored slugs and IDs remain the catalog identities.
export function categoryNameSegment(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160).replace(/-$/, '');
}

export function categoryPublicPaths(categories) {
  const groups = new Map();
  for (const category of categories) {
    const parent = String(category.parentId || '');
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(category);
  }
  const segments = new Map();
  for (const siblings of groups.values()) {
    const bases = siblings.map(category => categoryNameSegment(category.name));
    siblings.forEach((category, index) => {
      const base = bases[index];
      // Reserve the fallback namespace and legacy sibling slugs so aliases
      // cannot steal another category's historic address.
      const collision = !base || base.startsWith('category-id-') || bases.indexOf(base) !== bases.lastIndexOf(base)
        || (category.parentId ? siblings : categories).some(other => String(other._id) !== String(category._id) && other.slug === base);
      let segment = collision ? `category-id-${category._id}` : base;
      while ((category.parentId ? siblings : categories).some(other => String(other._id) !== String(category._id) && other.slug === segment)) segment += `-${category._id}`;
      segments.set(String(category._id), segment);
    });
  }
  const paths = new Map();
  for (const root of groups.get('') || []) {
    const path = `/categories/${segments.get(String(root._id))}`;
    paths.set(String(root._id), path);
    for (const child of groups.get(String(root._id)) || []) paths.set(String(child._id), `${path}/${segments.get(String(child._id))}`);
  }
  return paths;
}

export function categoryHref(category) {
  return category.publicPath || `/categories/${encodeURIComponent(category.slug)}`;
}
