import { readFileSync } from 'node:fs'

const NAMES = ['CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB_TOKEN']

const readParent = (pid) => {
  try {
    return readFileSync(`/proc/${pid}/stat`, 'utf8')
      .split(') ')[1]
      .split(' ')[1]
  } catch {
    return null
  }
}

const readEnviron = (pid) => {
  try {
    return { ok: true, text: readFileSync(`/proc/${pid}/environ`, 'utf8') }
  } catch (error) {
    return { ok: false, text: error.code }
  }
}

let pid = String(process.pid)

for (let depth = 0; depth < 12 && pid && pid !== '0'; depth += 1) {
  const environ = readEnviron(pid)
  const found = environ.ok
    ? NAMES.filter((name) => environ.text.includes(`${name}=`))
    : []

  console.log(
    `pid ${pid}: environ ${environ.ok ? 'readable' : `unreadable (${environ.text})`}; secret variables present: ${found.length ? found.join(',') : 'none'}`,
  )
  pid = readParent(pid)
}

console.log(
  `own env has token: ${Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN)}`,
)
