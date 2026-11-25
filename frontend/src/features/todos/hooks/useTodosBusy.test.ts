import { useMutation } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function useBusyWithMutation(
  mutationKey: readonly string[],
  wait: Promise<void>,
) {
  const busy = useTodosBusy()
  const mutation = useMutation({ mutationKey, mutationFn: () => wait })
  return { busy, mutation }
}

it('is idle when no mutation is running', () => {
  const { wrapper } = createQueryClientWrapper()
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  expect(result.current).toBe(false)
})

it('is busy while a task mutation is pending', async () => {
  const pending = deferred()
  const { wrapper } = createQueryClientWrapper()
  const { result } = renderHook(
    () => useBusyWithMutation(todoKeys.update, pending.promise),
    { wrapper },
  )
  act(() => result.current.mutation.mutate())
  await waitFor(() => expect(result.current.busy).toBe(true))
  act(() => pending.resolve())
  await waitFor(() => expect(result.current.busy).toBe(false))
})

it('ignores mutations outside the task feature', async () => {
  const pending = deferred()
  const { wrapper } = createQueryClientWrapper()
  const { result } = renderHook(
    () => useBusyWithMutation(['settings', 'save'], pending.promise),
    { wrapper },
  )
  act(() => result.current.mutation.mutate())
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
  act(() => pending.resolve())
  await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))
})
