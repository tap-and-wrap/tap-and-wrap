export default function PersonalizationSummary({ values, definitions = [] }) {
  const entries = Object.entries(values || {}).filter(([, value]) => typeof value === 'string' || Array.isArray(value));
  if (!entries.length) return null;
  return <dl className="commerce-personalization-summary">{entries.map(([key, value]) => <div key={key}><dt>{definitions.find(field => field.key === key)?.label || 'Personalization'}</dt><dd>{Array.isArray(value) ? `${value.length} private photo${value.length === 1 ? '' : 's'}` : value}</dd></div>)}</dl>;
}
