import { useEffect, useRef, useState } from 'react';

export function useMediaPreference(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query), update = () => setMatches(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export default function useVideoPlayback({ source, visible = true, autoplay = true }) {
  const videoRef = useRef(null), intent = useRef('auto');
  const [playing, setPlaying] = useState(false), [failedSource, setFailedSource] = useState(null);
  const [blocked, setBlocked] = useState(false), [foreground, setForeground] = useState(() => !document.hidden);
  const reducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const update = () => { if (document.hidden) videoRef.current?.pause(); setForeground(!document.hidden); }, hide = () => { videoRef.current?.pause(); setForeground(false); };
    document.addEventListener('visibilitychange', update); window.addEventListener('pagehide', hide); window.addEventListener('pageshow', update);
    return () => { document.removeEventListener('visibilitychange', update); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', update); };
  }, []);
  useEffect(() => {
    const node = videoRef.current;
    if (!node || !source) return;
    let current = true;
    if (!visible || !foreground || reducedMotion || intent.current === 'pause' || !autoplay && intent.current !== 'play') node.pause();
    else void node.play().then(() => { if (current) setBlocked(false); }).catch(() => { if (current) setBlocked(true); });
    return () => { current = false; node.pause(); };
  }, [source, visible, foreground, reducedMotion, autoplay]);
  // A new preference for less motion always pauses, including manual playback.
  // A deliberate later Play is still allowed; preference changes never discard a poster.
  function toggle() {
    const node = videoRef.current;
    if (!node || !source) return;
    if (!node.paused) { intent.current = 'pause'; node.pause(); }
    else {
      intent.current = 'play';
      void node.play().then(() => { if (videoRef.current === node) setBlocked(false); }).catch(() => { if (videoRef.current === node) setBlocked(true); });
    }
  }
  return { videoRef, playing, blocked, failed: Boolean(source && failedSource === source), toggle,
    videoEvents: { onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false), onError: () => { setPlaying(false); setFailedSource(source); } } };
}
