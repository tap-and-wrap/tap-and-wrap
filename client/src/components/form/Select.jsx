import { Children, Fragment, isValidElement, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Check, ChevronDown, Search } from 'lucide-react';

const text = value => Children.toArray(value).map(child => isValidElement(child) ? text(child.props.children) : String(child)).join('');
function optionsFrom(children, group = '') {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) return optionsFrom(child.props.children, group);
    if (child.type === 'optgroup') return optionsFrom(child.props.children, child.props.label);
    if (child.type !== 'option') return [];
    return [{ value: String(child.props.value ?? text(child.props.children)), label: text(child.props.children), disabled: child.props.disabled, group }];
  });
}

/** Native option/value adapter; Ariakit owns focus, typeahead, dismissal and positioning. */
export default function Select({ children, value, defaultValue, onChange, className = '', searchable, name, id, required, disabled, onBlur, ...props }) {
  const generated = useId();
  const trigger = useRef(null);
  const field = useRef(null);
  const options = optionsFrom(children);
  const [localValue, setLocalValue] = useState(() => String(defaultValue ?? options.find(option => !option.disabled)?.value ?? ''));
  const [search, setSearch] = useState('');
  const [labelText, setLabelText] = useState();
  const invalid = props['aria-invalid'];
  const describedBy = props['aria-describedby'];
  const selected = String(value ?? localValue);
  const placePortal = useCallback(element => {
    const dialog = trigger.current?.closest('dialog');
    if (element && dialog) dialog.appendChild(element);
  }, []);
  const canSearch = searchable ?? options.length > 10;
  const visible = canSearch && search ? options.filter(option => `${option.group} ${option.label}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) : options;
  useLayoutEffect(() => {
    const label = trigger.current?.closest('label');
    if (label) {
      const copy = label.cloneNode(true);
      copy.querySelectorAll('.tw-select-field,input,select,textarea,button,.admin-help,.gb-help,small,[role="alert"]').forEach(element => element.remove());
      setLabelText(copy.textContent.trim().replace(/\s+/g, ' '));
    }
  }, [generated]);
  useLayoutEffect(() => {
    const native = field.current?.querySelector('select');
    if (!native) return undefined;
    const mirror = () => {
      for (const attribute of ['aria-invalid', 'aria-describedby']) {
        const value = native.getAttribute(attribute);
        if (value) trigger.current?.setAttribute(attribute, value);
        else if (!(attribute === 'aria-invalid' ? invalid : describedBy)) trigger.current?.removeAttribute(attribute);
      }
    };
    const observer = new MutationObserver(mirror);
    observer.observe(native, { attributes: true, attributeFilter: ['aria-invalid', 'aria-describedby'] });
    return () => observer.disconnect();
  }, [name, required, invalid, describedBy]);
  const commit = next => {
    setLocalValue(next);
    onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } });
    (field.current?.querySelector('select') || trigger.current)?.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const change = next => { if (next !== selected) commit(next); };
  return <span ref={field} className="tw-select-field"><Ariakit.ComboboxProvider selectedValue={selected} setSelectedValue={change} inputValue={search} setInputValue={setSearch} setOpen={open => { if (!open) setSearch(''); }}>
    <Ariakit.ComboboxSelect {...props} ref={trigger} id={id} name={name || (required ? `${generated}-required` : undefined)} required={required} disabled={disabled} onBlur={onBlur} aria-label={props['aria-label'] || (!props['aria-labelledby'] ? labelText : undefined)} aria-labelledby={props['aria-labelledby']} data-selected-value={selected} data-validation-field={name} className={`tw-select ${className}`}>
      <span>{options.find(option => option.value === selected)?.label || 'Choose an option'}</span><ChevronDown size={16} aria-hidden="true"/>
    </Ariakit.ComboboxSelect>
    <Ariakit.ComboboxPopover portal portalRef={placePortal} sameWidth gutter={6} className="tw-select-menu" aria-label="Available options" unmountOnHide={false}>
      {canSearch && <div className="tw-select-search"><Search size={16} aria-hidden="true"/><Ariakit.ComboboxInput autoSelect aria-label="Search options" placeholder="Search options…"/></div>}
      <Ariakit.ComboboxList className="tw-select-options">
        {visible.map((option, index) => <Ariakit.ComboboxItem key={`${option.value}:${index}`} value={option.value} data-option-value={option.value} disabled={option.disabled} hideOnClick onClick={() => { if (!option.disabled && option.value === selected) commit(option.value); }} className="tw-select-option"><span>{option.group && <small>{option.group} · </small>}{option.label}</span>{selected === option.value && <Check size={16} aria-hidden="true"/>}</Ariakit.ComboboxItem>)}
        {!visible.length && <p className="tw-select-empty" role="status">No matching options</p>}
      </Ariakit.ComboboxList>
    </Ariakit.ComboboxPopover>
  </Ariakit.ComboboxProvider></span>;
}

export function Combobox(props) { return <Select {...props} searchable/>; }
