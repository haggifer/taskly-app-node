import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useClearCompletedMutation } from './useClearCompletedMutation'

vi.mock('../api/todos', () => ({ todosApi: { clearCompleted: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

const completed = { ...todoFixture, id: 3, title: 'Done', completed: true }

it('clears completed tasks and keeps only active ones in the cached list', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData(todoKeys.list, [completed, todoFixture])
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  const cleared = await act(() => result.current.mutateAsync())
  expect(cleared).toEqual({ deleted: 1 })
  expect(todosApi.clearCompleted).toHaveBeenCalledTimes(1)
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('leaves an empty cache untouched', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { client, wrapper } = createQueryClientWrapper()
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  await act(() => result.current.mutateAsync())
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('exposes the error and keeps completed tasks on failure', async () => {
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(
    new Error('Could not clear.'),
  )
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData(todoKeys.list, [completed, todoFixture])
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  act(() => result.current.mutate())
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('Could not clear.')
  expect(client.getQueryData(todoKeys.list)).toEqual([completed, todoFixture])
})
