import { readFileSync } from 'node:fs'
import { REPO_ROOT } from '../lib/tools.mjs'
import { getCommandDecision, getWriteDecision } from '../lib/write-guard.mjs'

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

const getDecision = (event) =>
  event.tool_name === 'Bash'
    ? getCommandDecision(event.tool_input?.command)
    : getWriteDecision({
        filePath:
          event.tool_input?.file_path ?? event.tool_input?.notebook_path,
        cwd: event.cwd ?? process.cwd(),
        repoRoot: REPO_ROOT,
        runDir: process.env.TEST_AGENT_RUN_DIR,
      })

const event = readEvent()

if (!event) {
  deny('The guard could not read the tool call.')
} else {
  const { isAllowed, reason } = getDecision(event)

  if (!isAllowed) deny(reason)
}
