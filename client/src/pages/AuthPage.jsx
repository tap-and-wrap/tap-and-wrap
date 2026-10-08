import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import PageShell from '../components/PageShell.jsx';
import { safePost } from '../services/api.js';
import { useCart } from '../commerce/CartContext.jsx';
import { toast } from 'sonner';
import { emitTracking } from '../tracking/client.js';

export default function AuthPage({ signup = false }) {
 const cart = useCart();
 const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
 const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const navigate = useNavigate();
 const [params] = useSearchParams(); const queryClient = useQueryClient();
 async function submit(event) {
  event.preventDefault(); setBusy(true); setError('');
  try {
   const response = await safePost(signup ? '/auth/signup' : '/auth/login', signup ? { name, email, password } : { email, password });
   emitTracking(response.data?.data?.tracking);
   queryClient.removeQueries({ queryKey: ['admin'] });
   await queryClient.invalidateQueries({ queryKey: ['session'] });
   try { await cart.merge(); }
   catch { await cart.refresh(); toast.error('You are signed in. Your guest cart could not be merged; please review your cart.'); }
   const returnTo = params.get('returnTo');
   navigate(returnTo && /^\/admin(?:\/|$)/.test(returnTo) && !returnTo.includes('\\') ? returnTo : '/my-orders');
  } catch (err) { setError(err.response?.data?.error?.message || 'Unable to sign in. Please try again in a moment.'); }
  finally { setBusy(false); }
 }
 return <PageShell eyebrow="CUSTOMER ACCOUNT" title={signup ? 'Create an account' : 'Welcome back'}>
  <form className="auth-form" onSubmit={submit}>{signup && <label>Your Name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required minLength={2}/></label>}<label>Email Address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={signup?'new-password':'current-password'} required/></label><button className="button button-dark" type="submit" disabled={busy}>{busy?'Please wait…':signup?'Create Account':'Log In'}</button>{error && <p role="alert" className="error-text">{error}</p>}</form>
  <p>{signup ? 'Already have an account?' : 'New to Tap & Wrap?'} <Link to={signup?'/login':'/signup'}>{signup?'Log In':'Sign Up'}</Link></p>
  {!signup && <p><Link to="/forgot-password">Forgot your password?</Link></p>}
  <p className="hint">Your account keeps your order history secure.</p>
 </PageShell>;
}
