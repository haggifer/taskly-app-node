import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

const done = {
  ...todoFixture,
  id: 1,
  title: 'Write report',
  completed: true,
  priority: 'high' as const,
  created_at: '2026-09-01T12:00:00Z',
}
const active = {
  ...todoFixture,
  id: 2,
  title: 'Buy milk',
  priority: 'low' as const,
  created_at: '2026-10-05T12:00:00Z',
}
const todos = [done, active]

it('shows all tasks, newest first, by default', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toEqual([active, done])
})

it('filters by status', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.filter).toBe('completed')
  expect(result.current.visible).toEqual([done])
  act(() => result.current.setFilter('active'))
  expect(result.current.visible).toEqual([active])
})

it('filters by search text', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSearch('MILK'))
  expect(result.current.search).toBe('MILK')
  expect(result.current.visible).toEqual([active])
})

it('changes the sort order', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible).toEqual([done, active])
})
