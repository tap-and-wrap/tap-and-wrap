// Test-only Vite entry. This page is not an application route or build entry.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from '../src/auth/SessionProvider.jsx';
import Select, { Combobox } from '../src/components/form/Select.jsx';
import SegmentedControl from '../src/components/form/SegmentedControl.jsx';
import BrandToaster from '../src/components/BrandToaster.jsx';
import AdminForm from '../src/admin/AdminForm.jsx';
import useModalDialog from '../src/components/useModalDialog.js';
import { toast } from 'sonner';
import '../src/styles.css';
import '../src/design-system.css';
import '../src/admin.css';
import '../src/owner-dashboard.css';

function Dialog({ onClose }) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose });
  return <dialog ref={dialogRef} {...dialogProps} aria-label="Control dialog"><label>Dialog choice<Select defaultValue="one"><option value="one">First option</option><option value="two">Second option</option></Select></label><button onClick={onClose}>Close dialog</button></dialog>;
}
function Harness() {
  const [size, setSize] = useState(''), [category, setCategory] = useState(''), [segment, setSegment] = useState('one');
  const [error, setError] = useState(null), [result, setResult] = useState(''), [dialog, setDialog] = useState(false);
  return <><main className="admin-shell admin-layout"><h1>Shared form controls</h1><AdminForm error={error} onSubmit={event => { event.preventDefault(); setResult(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))); toast.success('Changes saved.', { id: 'fixture-save' }); }}>
    <label>Size<Select name="size" required value={size} onChange={event => setSize(event.target.value)}><option value="">Choose a size</option><option value="small">Small</option><option value="large">Large</option><option value="unavailable" disabled>Unavailable</option></Select></label>
    <label>Category<Combobox name="category" value={category} onChange={event => setCategory(event.target.value)}><option value="">Choose a category</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={`category-${index + 1}`}>Fixture category {index + 1}</option>)}</Combobox></label>
    <label>Disabled choice<Select name="disabled" disabled value="one"><option value="one">Unavailable to edit</option></Select></label>
    <SegmentedControl label="Simple choice" name="segment" value={segment} onChange={setSegment} options={[{ value: 'one', label: 'First' }, { value: 'two', label: 'Second' }]}/>
    <div className="admin-save-row"><button className="admin-button">Save</button><button type="button" className="admin-button admin-button-secondary" onClick={() => setError({ details: [{ field: 'size', message: 'Select an available size.' }] })}>Server validation</button></div>
  </AdminForm><output aria-label="Submitted fields">{result}</output><div className="admin-save-row"><button className="admin-button admin-button-secondary" onClick={() => setDialog(true)}>Open control dialog</button><button className="admin-button admin-button-secondary" onClick={() => toast.error('Could not save. Your entries are still here.', { id: 'fixture-error', duration: 10000 })}>Show error toast</button><button onClick={()=>toast.info('A little information.',{id:'fixture-info'})}>Show info toast</button><button onClick={()=>toast.warning('Review your changes.',{id:'fixture-warning'})}>Show warning toast</button></div></main>{dialog && <Dialog onClose={() => setDialog(false)}/>}<BrandToaster/></>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><SessionProvider><Harness/></SessionProvider></QueryClientProvider>);
