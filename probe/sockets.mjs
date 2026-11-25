import { readdirSync, statSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOTS = ['/run', '/var/run', '/tmp']

const findSockets = (dir, depth = 0, found = []) => {
  if (depth > 4) return found

  let entries = []

  try {
    entries = readdirSync(dir)
  } catch (error) {
    console.log(`${dir}: unreadable (${error.code})`)
    return found
  }

  for (const entry of entries) {
    const path = join(dir, entry)

    try {
      const stats = statSync(path)

      if (stats.isSocket()) found.push(path)
      else if (stats.isDirectory()) findSockets(path, depth + 1, found)
    } catch {
      // Dangling links and permission errors are not sockets we can reach.
    }
  }

  return found
}

const tryConnect = (path) =>
  new Promise((resolvePromise) => {
    const socket = connect(path)
    const done = (result) => {
      socket.destroy()
      resolvePromise(result)
    }

    socket.once('connect', () => done('CONNECTED'))
    socket.once('error', (error) => done(`refused (${error.code})`))
    setTimeout(() => done('timeout'), 1500)
  })

const sockets = [...new Set(ROOTS.flatMap((root) => findSockets(root)))]

console.log(`sockets visible: ${sockets.length}`)

for (const path of sockets) {
  console.log(`${path}: ${await tryConnect(path)}`)
}
