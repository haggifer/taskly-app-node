import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

const older = { ...todoFixture, id: 3, title: 'Older task' }

it('creates a task and puts it first in the cached list', async () => {
  const saved = { ...todoFixture, id: 8, title: 'New task' }
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData(todoKeys.list, [older])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture))
  expect(todosApi.create).toHaveBeenCalledWith(todoFixture)
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, older])
})

it('does not duplicate a task already present in the cache', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData(todoKeys.list, [
    older,
    { ...todoFixture, title: 'Stale copy' },
  ])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, older])
})

it('starts a list when nothing is cached yet', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { client, wrapper } = createQueryClientWrapper()
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('exposes the error and leaves the cache unchanged on failure', async () => {
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Could not save.'))
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData(todoKeys.list, [older])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  act(() => result.current.mutate(todoFixture))
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('Could not save.')
  expect(client.getQueryData(todoKeys.list)).toEqual([older])
})
