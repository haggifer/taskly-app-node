import { readFileSync } from 'node:fs'
import { REPO_ROOT } from '../lib/tools.mjs'
import { getWriteDecision } from '../lib/write-guard.mjs'

const deny = (reason) => {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
}

const readEvent = () => {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return null
  }
}

const event = readEvent()

if (!event) {
  deny('The write guard could not read the tool call.')
} else {
  const { isAllowed, reason } = getWriteDecision({
    filePath: event.tool_input?.file_path ?? event.tool_input?.notebook_path,
    cwd: event.cwd ?? process.cwd(),
    repoRoot: REPO_ROOT,
    runDir: process.env.TEST_AGENT_RUN_DIR,
  })

  if (!isAllowed) deny(reason)
}
