// Loopback is the default because the app serves the full contents of whatever
// repository it has open; --tailnet is the deliberate opt-in to share it.
export function parseOptions(argv) {
  const dev = argv.includes('--dev')
  const tailnet = argv.includes('--tailnet')

  return {
    dev,
    tailnet,
    host: tailnet ? '0.0.0.0' : '127.0.0.1',
    port: dev ? 5174 : 0,
    shouldOpen: !argv.includes('--no-open') && !dev
  }
}
