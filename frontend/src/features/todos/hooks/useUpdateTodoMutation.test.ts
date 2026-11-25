import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { update: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

const other = { ...todoFixture, id: 3, title: 'Other task' }

it('updates a task and replaces it in the cached list', async () => {
  const saved = { ...todoFixture, completed: true }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData(todoKeys.list, [other, todoFixture])
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(() =>
    result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    }),
  )
  expect(todosApi.update).toHaveBeenCalledWith(todoFixture.id, {
    completed: true,
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([other, saved])
})

it('leaves an empty cache empty', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { client, wrapper } = createQueryClientWrapper()
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(() =>
    result.current.mutateAsync({ id: todoFixture.id, input: { title: 'x' } }),
  )
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('exposes the error and leaves the cache unchanged on failure', async () => {
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Could not update.'))
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData(todoKeys.list, [todoFixture])
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  act(() =>
    result.current.mutate({ id: todoFixture.id, input: { completed: true } }),
  )
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('Could not update.')
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
