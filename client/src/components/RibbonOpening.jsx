import { useEffect, useState } from 'react';
import './RibbonOpening.css';

const SESSION_KEY = 'tapwrap-ribbon-opening-v1';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const DURATION_MS = 2050;

function shouldOpenRibbon() {
  try {
    if (window.matchMedia(REDUCED_MOTION).matches) return false;
    if (new URLSearchParams(window.location.search).get('previewRibbon') === '1') return true;
    return window.sessionStorage.getItem(SESSION_KEY) !== 'seen';
  } catch {
    // Never obscure the storefront if session state or media preferences are unavailable.
    return false;
  }
}

/** Decorative, noninteractive homepage reveal. The storefront renders beneath it. */
export default function RibbonOpening() {
  const [visible, setVisible] = useState(shouldOpenRibbon);

  useEffect(() => {
    if (!visible) return;
    try { window.sessionStorage.setItem(SESSION_KEY, 'seen'); } catch { /* Preview still works. */ }

    const finish = () => setVisible(false);
    const timer = window.setTimeout(finish, DURATION_MS);
    const motion = window.matchMedia(REDUCED_MOTION);
    const preferenceChanged = () => { if (motion.matches) finish(); };
    const pageHidden = () => { if (document.hidden) finish(); };
    motion.addEventListener('change', preferenceChanged);
    document.addEventListener('visibilitychange', pageHidden);
    window.addEventListener('pagehide', finish);
    return () => {
      window.clearTimeout(timer);
      motion.removeEventListener('change', preferenceChanged);
      document.removeEventListener('visibilitychange', pageHidden);
      window.removeEventListener('pagehide', finish);
    };
  }, [visible]);

  if (!visible) return null;
  return <div className="tw-ribbon-opening" data-testid="ribbon-opening" aria-hidden="true">
    <div className="tw-ribbon-opening__paper tw-ribbon-opening__paper--left" />
    <div className="tw-ribbon-opening__paper tw-ribbon-opening__paper--right" />
    <div className="tw-ribbon-opening__shine" />
    <div className="tw-ribbon-opening__center">
      <svg className="tw-ribbon-opening__bow" viewBox="0 0 260 164" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <linearGradient id="tw-ribbon-v2-satin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f8ebe2"/>
            <stop offset=".22" stopColor="#c99d94"/>
            <stop offset=".48" stopColor="#f0cfc5"/>
            <stop offset=".76" stopColor="#98645c"/>
            <stop offset="1" stopColor="#e7c0b6"/>
          </linearGradient>
          <linearGradient id="tw-ribbon-v2-knot" x1="0" y1="0" x2="1" y2=".9">
            <stop offset="0" stopColor="#f5ded3"/>
            <stop offset=".46" stopColor="#b78176"/>
            <stop offset="1" stopColor="#7f504b"/>
          </linearGradient>
        </defs>
        <g className="tw-ribbon-opening__loop tw-ribbon-opening__loop--left">
          <path d="M113 83C74 31 38 22 18 38 0 55 32 106 116 92c-66-13-80-42-72-51 10-11 42 11 69 42Z" fill="url(#tw-ribbon-v2-satin)" stroke="#9e746c" strokeWidth="1.5"/>
          <path d="M28 40C42 31 67 44 93 69" stroke="#fff7f0" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".42"/>
        </g>
        <g className="tw-ribbon-opening__loop tw-ribbon-opening__loop--right">
          <path d="M144 83c43-53 78-60 98-42 18 18-13 66-94 51 61-12 80-41 70-51-13-11-43 13-74 42Z" fill="url(#tw-ribbon-v2-satin)" stroke="#9e746c" strokeWidth="1.5"/>
          <path d="M227 39c-18-5-41 8-64 33" stroke="#fff7f0" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".42"/>
        </g>
        <g className="tw-ribbon-opening__tail tw-ribbon-opening__tail--left">
          <path d="M119 96c-14 22-33 44-64 61 27-5 43-11 60-17l12 19 5-59Z" fill="url(#tw-ribbon-v2-satin)" stroke="#9e746c" strokeWidth="1.5"/>
        </g>
        <g className="tw-ribbon-opening__tail tw-ribbon-opening__tail--right">
          <path d="M137 98c15 24 36 42 70 61-24-5-44-12-61-20l-12 17-8-57Z" fill="url(#tw-ribbon-v2-satin)" stroke="#9e746c" strokeWidth="1.5"/>
        </g>
        <g className="tw-ribbon-opening__knot">
          <path d="M113 76c8-12 26-13 35-1 8 10 2 29-13 32-19 4-33-13-22-31Z" fill="url(#tw-ribbon-v2-knot)" stroke="#8a5952" strokeWidth="2"/>
          <path d="M121 81c6-6 12-7 18-5" stroke="#f5dacf" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".7"/>
        </g>
      </svg>
    </div>
  </div>;
}
