/** Close admissions, drain existing HTTP requests, then disconnect within a fixed budget. */
export function createGracefulShutdown({ server, disconnect, beginDrain, abortStartup = () => {},
  timeoutMs = 15000, logger = console } = {}) {
  let pending;
  return function shutdown(reason = 'shutdown') {
    if (pending) return pending;
    pending = (async () => {
      const startedAt = Date.now();
      beginDrain();
      abortStartup();
      logger.log(JSON.stringify({ event: 'shutdown_started', reason: ['SIGINT', 'SIGTERM'].includes(reason) ? reason : 'shutdown' }));
      let timer;
      let idleDrain;
      let forced = false;
      const close = new Promise(resolve => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
        // Requests active when close() starts can later become keep-alive idle sockets.
        // Drain only during this bounded shutdown; never poll during normal operation.
        if (server.closeIdleConnections) idleDrain = setInterval(() => server.closeIdleConnections(), 25);
      });
      const deadline = new Promise(resolve => {
        timer = setTimeout(() => { forced = true; server.closeAllConnections?.(); resolve(); }, timeoutMs);
      });
      await Promise.race([close, deadline]);
      clearTimeout(timer);
      clearInterval(idleDrain);
      let disconnected = false;
      let disconnectTimer;
      await Promise.race([
        Promise.resolve().then(disconnect).then(() => { disconnected = true; }).catch(() => {}),
        new Promise(resolve => { disconnectTimer = setTimeout(resolve, Math.max(1, Math.min(timeoutMs - (Date.now() - startedAt), 5000))); }),
      ]);
      clearTimeout(disconnectTimer);
      const result = { forced, disconnected };
      logger.log(JSON.stringify({ event: 'shutdown_finished', ...result }));
      return result;
    })();
    return pending;
  };
}
