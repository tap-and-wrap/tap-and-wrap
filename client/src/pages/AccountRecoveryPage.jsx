import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import PageShell from '../components/PageShell.jsx';
import { safePost } from '../services/api.js';
import { commerceError } from '../commerce/api.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { newPasswordError } from '../auth/password.js';
import { FieldError, fieldErrorProps, focusInvalidField, nativeFieldErrors, validationFieldErrors } from '../components/FormFeedback.jsx';

export default function AccountRecoveryPage({ verify = false, reset = false }) {
  const session = useSession();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const prefix = useId();
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    const existing = document.head.querySelector('meta[name="referrer"]');
    const node = existing || document.createElement('meta'); const previous = node.getAttribute('content');
    node.setAttribute('name', 'referrer'); node.setAttribute('content', 'no-referrer'); if (!existing) document.head.append(node);
    return () => { if (existing) node.setAttribute('content', previous || 'strict-origin-when-cross-origin'); else node.remove(); };
  }, []);
  const mutation = useMutation({ mutationFn: async () => {
    if (reset && newPasswordError(password)) throw new Error(newPasswordError(password));
    const path = verify ? '/auth/verify-email' : reset ? '/auth/reset-password' : '/auth/forgot-password';
    const payload = verify ? { token } : reset ? { token, newPassword: password } : { email };
    return (await (reset ? session.authenticate(path, payload) : safePost(path, payload))).data.data;
  }, onError: (error) => setFieldErrors(validationFieldErrors(error)) });
  function submit(event) {
    event.preventDefault();
    const errors = nativeFieldErrors(event.currentTarget);
    if (reset && newPasswordError(password)) errors.password = newPasswordError(password);
    setFieldErrors(errors);
    if (Object.keys(errors).length) { focusInvalidField(event.currentTarget); return; }
    mutation.mutate();
  }
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  const title = verify ? 'Verify Your Email' : reset ? 'Reset Your Password' : 'Forgot Your Password?';
  return <div className="website-recovery"><PageShell eyebrow="CUSTOMER ACCOUNT" title={title}>{mutation.isSuccess ? <p role="status">{verify ? 'Your email has been verified.' : reset ? 'Your password has been reset. Sign in again to continue.' : mutation.data.message}</p> : (verify || reset) && !validToken ? <p role="alert">This link is missing or invalid. Request a new email link.</p> : <form className="auth-form" onSubmit={submit} noValidate aria-busy={mutation.isPending}>{!verify && <div className="auth-field"><label htmlFor={`${prefix}-${reset ? 'password' : 'email'}`}>{reset ? 'New password' : 'Email address'}</label>{reset ? <input id={`${prefix}-password`} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} disabled={mutation.isPending} onChange={(event) => setPassword(event.target.value)} {...fieldErrorProps(`${prefix}-password`, fieldErrors.password || fieldErrors.newPassword)}/> : <input id={`${prefix}-email`} name="email" type="email" autoComplete="email" required maxLength={254} value={email} disabled={mutation.isPending} onChange={(event) => setEmail(event.target.value)} {...fieldErrorProps(`${prefix}-email`, fieldErrors.email)}/>}<FieldError id={`${prefix}-${reset ? 'password' : 'email'}`}>{reset ? fieldErrors.password || fieldErrors.newPassword : fieldErrors.email}</FieldError></div>}<button className="button button-dark" disabled={mutation.isPending}>{mutation.isPending ? 'Processing…' : verify ? 'Verify email' : reset ? 'Reset password' : 'Request reset link'}</button>{mutation.error && <p role="alert">{commerceError(mutation.error)}</p>}</form>}<div className="website-account-actions"><Link to="/login">Log In</Link>{(verify || reset) && <Link to="/forgot-password">Request a password reset</Link>}</div><p className="website-referrer-note">Account links are single use and expire. Email delivery requires the configured backend provider.</p></PageShell></div>;
}
