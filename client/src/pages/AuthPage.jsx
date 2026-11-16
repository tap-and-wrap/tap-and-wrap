import { useId, useState } from 'react';
import PasswordInput from '../components/PasswordInput.jsx';
import { accountDestination, authenticationError } from '../auth/feedback.mjs';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageShell from '../components/PageShell.jsx';
import { useCart } from '../commerce/CartContext.jsx';
import { commercePost } from '../commerce/api.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { newPasswordError } from '../auth/password.js';
import { toast } from 'sonner';
import { emitTracking } from '../tracking/client.js';
import { FieldError, fieldErrorProps, focusInvalidField, nativeFieldErrors, validationFieldErrors } from '../components/FormFeedback.jsx';

export default function AuthPage({ signup = false }) {
 const cart = useCart();
 const session = useSession();
 const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
 const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const navigate = useNavigate();
 const [fieldErrors, setFieldErrors] = useState({});
 const prefix = useId();
 const [params] = useSearchParams();
 async function submit(event) {
  event.preventDefault(); setError('');
  const form = event.currentTarget;
  const errors = nativeFieldErrors(form);
  if (signup && newPasswordError(password)) errors.password = newPasswordError(password);
  setFieldErrors(errors);
  if (Object.keys(errors).length) { focusInvalidField(form); return; }
  setBusy(true);
  try {
   if (signup && newPasswordError(password)) throw new Error(newPasswordError(password));
   const response = await session.authenticate(signup ? '/auth/signup' : '/auth/login', signup ? { name, email, password } : { email, password });
   emitTracking(response.data?.data?.tracking);
   let cartNotice = false;
   try {
    const merged = await commercePost('/cart/merge', {});
    await cart.refresh();
    if (Number.isSafeInteger(merged.skipped) && merged.skipped > 0) { cartNotice = true; toast(`You are signed in. ${merged.skipped} unavailable guest ${merged.skipped === 1 ? 'item could' : 'items could'} not be transferred. Review your cart.`, { id: 'auth-cart-merge' }); }
   }
   catch { cartNotice = true; await cart.refresh(); toast.error('You are signed in. Your guest cart could not be merged; please review your cart.', { id: 'auth-cart-merge' }); }
   const returnTo = params.get('returnTo');
   const administrator = response.data?.data?.user?.role === 'admin';
   if (!cartNotice) toast.success(signup ? 'Your account is ready. Welcome to Tap & Wrap.' : 'You are signed in.', { id: 'auth-result' });
   navigate(accountDestination(administrator, returnTo), { replace: true });
  } catch (err) { const message = authenticationError(err); setFieldErrors(validationFieldErrors(err)); setError(message); toast.error(message, { id: 'auth-result' }); }
  finally { setBusy(false); }
 }
 return <PageShell account eyebrow="CUSTOMER ACCOUNT" title={signup ? 'Create an account' : 'Welcome back'}>
  <p className="auth-introduction">{signup ? 'Keep your thoughtful gifts and order updates together.' : 'Sign in to follow your orders and continue shopping.'}</p>
  <form className="auth-form" onChange={event=>{setError('');setFieldErrors(previous=>({...previous,[event.target.name]:undefined}));}} onBlur={event=>{const field=event.target;if(!field.matches('input'))return;const message=signup && field.name==='password' ? newPasswordError(field.value) : field.validity.valid ? '' : field.validationMessage;setFieldErrors(previous=>({...previous,[field.name]:message}));}} onSubmit={submit} noValidate aria-busy={busy} aria-describedby={error ? `${prefix}-form-error` : undefined}>
   {signup && <div className="auth-field"><label htmlFor={`${prefix}-name`}>Your Name</label><input id={`${prefix}-name`} name="name" value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={100} disabled={busy} {...fieldErrorProps(`${prefix}-name`, fieldErrors.name)}/><FieldError id={`${prefix}-name`}>{fieldErrors.name}</FieldError></div>}
   <div className="auth-field"><label htmlFor={`${prefix}-email`}>Email Address</label><input id={`${prefix}-email`} name="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={254} disabled={busy} {...fieldErrorProps(`${prefix}-email`, fieldErrors.email)}/><FieldError id={`${prefix}-email`}>{fieldErrors.email}</FieldError></div>
   <div className="auth-field"><label htmlFor={`${prefix}-password`}>Password</label><PasswordInput requirements={signup} id={`${prefix}-password`} name="password" minLength={signup ? 12 : undefined} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={signup?'new-password':'current-password'} required disabled={busy} {...fieldErrorProps(`${prefix}-password`, fieldErrors.password, signup ? `${prefix}-password-requirements` : '')}/><FieldError id={`${prefix}-password`}>{fieldErrors.password}</FieldError></div>
   <button className="button button-dark" type="submit" disabled={busy}>{busy?'Please wait…':signup?'Create Account':'Log In'}</button>{error && <p id={`${prefix}-form-error`} role="alert" className="error-text">{error}</p>}
  </form>
  <div className="auth-links"><p>{signup ? 'Already have an account?' : 'New to Tap & Wrap?'} <Link to={signup?'/login':'/signup'}>{signup?'Log In':'Sign Up'}</Link></p>
  {!signup && <Link to="/forgot-password">Forgot your password?</Link>}</div>
  <p className="hint">Your account keeps your order history secure.</p>
 </PageShell>;
}
