import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoEmptyState } from './TodoEmptyState'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: vi.fn(() => <p>Empty task list</p>),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      {todo.title}
      <button disabled={busy} onClick={onToggle}>
        Toggle: {todo.title}
      </button>
      <button onClick={onEdit}>Edit: {todo.title}</button>
      <button onClick={onDelete}>Delete: {todo.title}</button>
    </li>
  ),
}))

beforeEach(() => vi.clearAllMocks())

function setup(overrides: Partial<Parameters<typeof TodoList>[0]> = {}) {
  const props = {
    todos: [],
    hasTodos: false,
    loading: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(<TodoList {...props} />)
  return props
}

it('explains that the list is unavailable when loading failed with no tasks', () => {
  setup({ failed: true })
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps showing cached tasks when a refetch failed', () => {
  setup({ failed: true, hasTodos: true, todos: [todoFixture] })
  expect(screen.getByRole('listitem')).toHaveTextContent(todoFixture.title)
  expect(
    screen.queryByText('The task list is temporarily unavailable'),
  ).not.toBeInTheDocument()
})

it('renders each task and passes it to the matching callback', async () => {
  const user = userEvent.setup()
  const second = { ...todoFixture, id: 8, title: 'Review notes' }
  const props = setup({ hasTodos: true, todos: [todoFixture, second] })
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Toggle: Review notes' }))
  expect(props.onToggle).toHaveBeenCalledWith(second)
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(props.onEdit).toHaveBeenCalledWith(todoFixture)
  await user.click(screen.getByRole('button', { name: 'Delete: Review notes' }))
  expect(props.onDelete).toHaveBeenCalledWith(second)
})

it('passes the busy state to each task', () => {
  setup({ hasTodos: true, todos: [todoFixture], busy: true })
  expect(
    screen.getByRole('button', { name: `Toggle: ${todoFixture.title}` }),
  ).toBeDisabled()
})

it('shows the empty state with the filter context and busy state', () => {
  const props = setup({ hasTodos: true, busy: true })
  expect(screen.getByText('Empty task list')).toBeVisible()
  expect(vi.mocked(TodoEmptyState).mock.calls[0][0]).toEqual({
    hasTodos: true,
    disabled: true,
    onCreate: props.onCreate,
  })
})
