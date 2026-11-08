import { useEffect } from 'react';

/** Start the existing pre-paint overlay once the interactive homepage mounts. */
export default function RibbonOpening() {
  useEffect(() => { window.__twRibbon?.start(); }, []);
  return null;
}
