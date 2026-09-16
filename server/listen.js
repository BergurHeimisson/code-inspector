export function listenOn(app, host, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host)
    server.once('listening', () => {
      server.removeListener('error', reject)
      resolve(server)
    })
    server.once('error', reject)
  })
}
