import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatDate,
  isOverdue,
  priorityLabels,
  selectTodos,
  validateTodo,
} from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('keeps only completed tasks with the completed filter', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('searches the title as well', () => {
    const other = { ...base, id: 2, title: 'Write docs' }
    expect(selectTodos([base, other], 'all', 'SPRINT', 'newest')).toEqual([
      base,
    ])
  })

  it('orders by priority and then by the newest id', () => {
    const low = { ...base, id: 1, priority: 'low' as const }
    const mediumOld = { ...base, id: 2 }
    const mediumNew = { ...base, id: 3 }
    expect(
      selectTodos([low, mediumOld, mediumNew], 'all', '', 'priority'),
    ).toEqual([mediumNew, mediumOld, low])
  })

  it('orders by due date with undated tasks last and ties by newest id', () => {
    const undated = { ...base, id: 1 }
    const later = { ...base, id: 2, due_date: '2026-11-01' }
    const soonOld = { ...base, id: 3, due_date: '2026-10-05' }
    const soonNew = { ...base, id: 4, due_date: '2026-10-05' }
    expect(
      selectTodos([undated, later, soonOld, soonNew], 'all', '', 'due'),
    ).toEqual([soonNew, soonOld, later, undated])
  })

  it('orders by creation date, newest first, with ties by newest id', () => {
    const older = { ...base, id: 5, created_at: '2026-09-01T12:00:00Z' }
    const sameA = { ...base, id: 1 }
    const sameB = { ...base, id: 2 }
    expect(selectTodos([older, sameA, sameB], 'all', '', 'newest')).toEqual([
      sameB,
      sameA,
      older,
    ])
  })
})

describe('validateTodo', () => {
  const valid: TodoInput = {
    title: 'Plan',
    description: '',
    priority: 'low',
    due_date: null,
    completed: false,
  }

  it('accepts a valid task with or without a due date', () => {
    expect(validateTodo(valid)).toEqual({})
    expect(validateTodo({ ...valid, due_date: '2028-02-29' })).toEqual({})
  })

  it('requires a non-blank title', () => {
    expect(validateTodo({ ...valid, title: '  ' })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it('limits the trimmed title to 120 characters', () => {
    expect(validateTodo({ ...valid, title: ` ${'a'.repeat(120)} ` })).toEqual(
      {},
    )
    expect(validateTodo({ ...valid, title: 'a'.repeat(121) })).toEqual({
      title: 'The title must be at most 120 characters.',
    })
  })

  it('limits the trimmed description to 2000 characters', () => {
    expect(
      validateTodo({ ...valid, description: `${'d'.repeat(2000)}  ` }),
    ).toEqual({})
    expect(validateTodo({ ...valid, description: 'd'.repeat(2001) })).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it.each(['2026/10/10', '2026-13-01', '2026-02-30', 'tomorrow'])(
    'rejects the invalid due date %s',
    (due_date) => {
      expect(validateTodo({ ...valid, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it('reports every invalid field at once', () => {
    expect(
      validateTodo({
        ...valid,
        title: '',
        description: 'd'.repeat(2001),
        due_date: 'nope',
      }),
    ).toEqual({
      title: 'Enter a task title.',
      description: 'The description must be at most 2000 characters.',
      due_date: 'Enter a valid date.',
    })
  })
})

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-10T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('marks an active task due before today as overdue', () => {
    expect(isOverdue({ ...base, due_date: '2026-10-09' })).toBe(true)
  })

  it('does not mark tasks due today or later as overdue', () => {
    expect(isOverdue({ ...base, due_date: '2026-10-10' })).toBe(false)
    expect(isOverdue({ ...base, due_date: '2026-10-11' })).toBe(false)
  })

  it('never marks completed or undated tasks as overdue', () => {
    expect(
      isOverdue({ ...base, due_date: '2026-10-01', completed: true }),
    ).toBe(false)
    expect(isOverdue(base)).toBe(false)
  })
})

describe('formatDate', () => {
  it('formats an ISO date as day, short month and year', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })
})

it('labels every priority', () => {
  expect(priorityLabels).toEqual({ low: 'Low', medium: 'Medium', high: 'High' })
})
