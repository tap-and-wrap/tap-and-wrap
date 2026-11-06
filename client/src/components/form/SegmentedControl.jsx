import { useId } from 'react';

export default function SegmentedControl({ label, value, onChange, options, disabled, name }) {
  const id = useId();
  return <fieldset className="tw-segmented" disabled={disabled}><legend>{label}</legend><div>{options.map(option => <label key={option.value}><input type="radio" name={name || id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}/><span>{option.label}</span></label>)}</div></fieldset>;
}
