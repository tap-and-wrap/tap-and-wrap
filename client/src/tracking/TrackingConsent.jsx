import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getTrackingConfiguration, globalPrivacyControl, pageTracking, saveTrackingConsent, trackingChoice, publicTrackingPath } from './client.js';

export default function TrackingConsent() {
  const { pathname } = useLocation();
  const [config, setConfig] = useState(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const page = useRef({ pathname: null, id: null });
  const heading = useRef(null);
  const preferences = useRef(null);
  if (page.current.pathname !== pathname) page.current = { pathname, id: crypto.randomUUID() };
  useEffect(() => {
    let cancelled = false;
    getTrackingConfiguration().then(async settings => {
      if (cancelled) return;
      if (globalPrivacyControl() && settings.enabled) {
        try { await saveTrackingConsent(false); } catch { /* Local GPC gate already disables all emission. */ }
        settings = { ...settings, consent: false };
      }
      setConfig(settings);
      setOpen(settings.enabled && !settings.consent && trackingChoice()?.choice !== 'declined' && !globalPrivacyControl());
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (config?.consent && publicTrackingPath(pathname)) void pageTracking(pathname, page.current.id);
  }, [config, pathname]);
  async function choose(granted) {
    setPending(true); setError('');
    try { setConfig(await saveTrackingConsent(granted)); setOpen(false); preferences.current?.focus(); }
    catch { setError(granted ? 'Your tracking preference could not be saved. Optional tracking remains off.' : 'Optional tracking is off in this browser. The server preference could not be saved; please try again.'); if (!granted) setConfig(value => ({ ...value, consent: false })); }
    finally { setPending(false); }
  }
  if (!config?.enabled || !publicTrackingPath(pathname)) return null;
  return <>
    <button className="tracking-preferences" ref={preferences} type="button" onClick={() => { setOpen(true); requestAnimationFrame(() => heading.current?.focus()); }}>Tracking preferences</button>
    {open && <section className="tracking-consent" aria-labelledby="tracking-heading">
      <h2 id="tracking-heading" ref={heading} tabIndex={-1}>Optional marketing cookies</h2>
      <p>With your permission, Meta helps measure visits and completed shopping actions. Payment proofs, artwork and personalization text are never included. <Link to="/privacy-policy">Read our privacy information</Link>.</p>
      {globalPrivacyControl() && <p>Your browser privacy signal keeps optional tracking off.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="button-group">
        {!globalPrivacyControl() && !config.consent && <button className="button button-dark" type="button" disabled={pending} onClick={() => choose(true)}>Accept optional tracking</button>}
        <button className="button button-outline" type="button" disabled={pending} onClick={() => choose(false)}>{config.consent ? 'Turn off optional tracking' : 'Reject optional tracking'}</button>
        <button className="button button-outline" type="button" disabled={pending} onClick={() => { setOpen(false); preferences.current?.focus(); }}>Close</button>
      </div>
      {pending && <p role="status">Saving preference…</p>}
    </section>}
  </>;
}
