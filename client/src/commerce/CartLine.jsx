import { useId, useRef, useState } from 'react';
import { ChevronDown, Minus, Plus, Trash2 } from 'lucide-react';
import ConfirmationDialog from '../components/ConfirmationDialog.jsx';
import { commerceError, money } from './api.js';
import './cart-v2.css';

function RemoveDialog({ target, pending, remove, onClose }) {
  const busy = useRef(false);
  const [saving,setSaving] = useState(false), [error,setError] = useState('');
  const close = () => { if (!busy.current) onClose(); };
  async function confirm() {
    if (busy.current || pending) return;
    busy.current=true; setSaving(true); setError('');
    try {
      await remove(target.id);
      onClose();
      requestAnimationFrame(()=>document.querySelector('.cart-v2-title, .commerce-heading h1')?.focus({preventScroll:true}));
    } catch (caught) { setError(`${commerceError(caught)} Review your cart before retrying. Retrying removes only this same item.`); }
    finally { busy.current=false; setSaving(false); }
  }
  return <ConfirmationDialog className="cart-remove-dialog" title={`Remove ${target.name}?`} description={`This removes ${target.name} from your cart. Your other items will remain.`} error={error} pending={saving || pending} returnFocus={target.opener} onCancel={close} onConfirm={confirm} cancelLabel="Keep item" confirmLabel="Remove item"/>;
}

export default function CartLine({ item, name, title, image, children, pending, setQuantity, remove, fixed=false, status, edit, recovery, design=true, hasDetails=true }) {
  const id=useId(), request=useRef(false);
  const [open,setOpen]=useState(false), [target,setTarget]=useState(null), [changing,setChanging]=useState(false), [error,setError]=useState('');
  const busy=pending || changing;
  async function change(quantity) {
    if(request.current || busy) return;
    request.current=true; setChanging(true); setError('');
    try { await setQuantity(item.id,quantity); }
    catch(caught) { setError(commerceError(caught)); }
    finally { request.current=false; setChanging(false); }
  }
  return <article className={`cart-v2-line ${!item.valid ? 'is-unavailable' : ''}`} aria-label={name} aria-busy={busy}>
    <div className="cart-v2-photo">{image}</div>
    <div className="cart-v2-main"><header><h2 className="cart-v2-title" tabIndex={-1}>{title || name}</h2><button type="button" className="cart-v2-trash" aria-label={`Remove ${name}`} disabled={busy} onClick={event=>setTarget({id:item.id,name,opener:event.currentTarget})}><Trash2 size={19} aria-hidden="true"/></button></header>
      <p className="cart-v2-unit">{item.valid ? `${money(item.unitPricePiastres)} each` : 'Currently unavailable'}</p>
      {status && <p className="cart-v2-status">{status}</p>}
      {!item.valid && <p className="form-error" role="alert">{item.error || 'Review this item before checkout.'}</p>}
      {item.attachments?.replacementRequired && <p className="form-error" role="alert">Your private files have expired or are unavailable. Edit or replace this item before ordering.</p>}
      {recovery&&<div className="cart-v2-links">{recovery}</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="cart-v2-actions"><div className="cart-v2-quantity" role="group" aria-label={`Quantity for ${name}`}>
        {fixed ? <span className="cart-v2-fixed">1 item</span> : <><button type="button" aria-label={`Decrease quantity for ${name}`} disabled={busy || !item.valid || item.quantity<=1} onClick={()=>change(item.quantity-1)}><Minus size={15} aria-hidden="true"/></button><output aria-live="polite">{item.quantity}</output><button type="button" aria-label={`Increase quantity for ${name}`} disabled={busy || !item.valid || item.quantity>=(item.maxQuantity ?? 99)} onClick={()=>change(item.quantity+1)}><Plus size={15} aria-hidden="true"/></button></>}
      </div><strong className="cart-v2-total"><span>Line total</span>{item.valid ? money(item.lineTotalPiastres) : 'Unavailable'}</strong></div>
      <div className="cart-v2-links">{hasDetails && <button type="button" className="cart-v2-disclosure" aria-expanded={open} aria-controls={`${id}-details`} onClick={()=>setOpen(value=>!value)}>{open ? 'Hide details' : design ? 'View Design Details' : 'View Details'}<ChevronDown size={16} aria-hidden="true"/></button>}{edit}</div>
    </div>
    {hasDetails && <div id={`${id}-details`} className={`cart-v2-expansion ${open ? 'is-open' : ''}`} inert={!open}><div><div className="cart-v2-details" aria-label={`${name} details`}>{typeof children === 'function' ? children(open) : children}</div></div></div>}
    {target && <RemoveDialog target={target} pending={pending} remove={remove} onClose={()=>setTarget(null)}/>}
  </article>;
}
