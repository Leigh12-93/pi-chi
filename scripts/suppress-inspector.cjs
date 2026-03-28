// Preloaded via --require BEFORE tsx/ESM imports resolve.
// Prevents SIGUSR1 from activating the Node inspector during the
// import phase, which would bind :9229 and cause "address already
// in use" errors on subsequent attempts.
process.debugPort = 0
process.on('SIGUSR1', () => {
  try { require('inspector').close() } catch {}
})
