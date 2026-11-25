import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { SuccessNotice } from '../../components/SuccessNotice'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { DeleteTodoDialog } from './components/DeleteTodoDialog'
import { TodoEditor } from './components/TodoEditor'
import { TodoFilters } from './components/TodoFilters'
import { TodoList } from './components/TodoList'
import { TodosHeader } from './components/TodosHeader'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./hooks/useClearCompletedMutation', () => ({
  useClearCompletedMutation: () => ({ error: null, reset: vi.fn() }),
}))
vi.mock('./components/TodosHeader', () => ({ TodosHeader: vi.fn(() => null) }))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: vi.fn(() => null) }))
vi.mock('./components/TodoList', () => ({ TodoList: vi.fn(() => null) }))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: vi.fn(() => <p>Editor open</p>),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: vi.fn(() => <p>Delete dialog open</p>),
}))
vi.mock('../../components/SuccessNotice', () => ({
  SuccessNotice: vi.fn(() => null),
}))

const notify = vi.fn()
const mutateAsync = vi.fn()
const filters = {
  filter: 'all' as const,
  search: '',
  sort: 'newest' as const,
  visible: [todoFixture],
  setFilter: vi.fn(),
  setSearch: vi.fn(),
  setSort: vi.fn(),
}

function mockQuery(overrides: Record<string, unknown> = {}) {
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todoFixture],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTodosQuery>)
}

function mockToggle(error: Error | null = null) {
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error,
    reset: vi.fn(),
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
}

const listProps = () => vi.mocked(TodoList).mock.lastCall![0]
const headerProps = () => vi.mocked(TodosHeader).mock.lastCall![0]

beforeEach(() => {
  vi.clearAllMocks()
  mockQuery()
  mockToggle()
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: 'Saved!', notify })
  vi.mocked(useTodoFilters).mockReturnValue(filters)
})

it('passes the query and filter state to the page sections', () => {
  render(<TodosPage />)
  expect(useTodoFilters).toHaveBeenCalledWith([todoFixture])
  expect(headerProps().disabled).toBe(false)
  expect(vi.mocked(TodoFilters).mock.lastCall![0]).toMatchObject({
    filter: 'all',
    search: '',
    sort: 'newest',
    onFilterChange: filters.setFilter,
    onSearchChange: filters.setSearch,
    onSortChange: filters.setSort,
  })
  expect(listProps()).toMatchObject({
    todos: [todoFixture],
    hasTodos: true,
    loading: false,
    failed: false,
    busy: false,
  })
  expect(vi.mocked(SuccessNotice).mock.lastCall![0]).toEqual({
    message: 'Saved!',
  })
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
})

it('treats missing data as an empty list while loading', () => {
  mockQuery({ data: undefined, isPending: true })
  render(<TodosPage />)
  expect(useTodoFilters).toHaveBeenCalledWith([])
  expect(headerProps().disabled).toBe(true)
  expect(listProps()).toMatchObject({ hasTodos: false, loading: true })
})

it('disables creation and retry while a task operation is running', () => {
  vi.mocked(useTodosBusy).mockReturnValue(true)
  mockToggle(new Error('Could not update.'))
  render(<TodosPage />)
  expect(headerProps().disabled).toBe(true)
  expect(listProps().busy).toBe(true)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('shows the toggle error before the query error', () => {
  mockQuery({ error: new Error('Query failed.'), isError: true })
  mockToggle(new Error('Could not update.'))
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not update.')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('Query failed.')
})

it('disables retry while the list is refetching', () => {
  mockQuery({ error: new Error('Query failed.'), isFetching: true })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('completes a task and celebrates it', async () => {
  mutateAsync.mockResolvedValue({ ...todoFixture, completed: true })
  render(<TodosPage />)
  act(() => listProps().onToggle(todoFixture))
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Another task complete. Well done!'),
  )
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: true },
  })
})

it('reactivates a completed task', async () => {
  const completed = { ...todoFixture, completed: true }
  mutateAsync.mockResolvedValue(todoFixture)
  render(<TodosPage />)
  act(() => listProps().onToggle(completed))
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Task marked as active.'),
  )
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: false },
  })
})

it('does not notify when toggling fails', async () => {
  mutateAsync.mockRejectedValue(new Error('Could not update.'))
  render(<TodosPage />)
  act(() => listProps().onToggle(todoFixture))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggles while a task operation is running', () => {
  vi.mocked(useTodosBusy).mockReturnValue(true)
  render(<TodosPage />)
  act(() => listProps().onToggle(todoFixture))
  expect(mutateAsync).not.toHaveBeenCalled()
})

it('opens the editor for a new task from the header and closes it after saving', () => {
  render(<TodosPage />)
  expect(screen.queryByText('Editor open')).not.toBeInTheDocument()
  act(() => headerProps().onCreate())
  expect(screen.getByText('Editor open')).toBeVisible()
  const editor = vi.mocked(TodoEditor).mock.lastCall![0]
  expect(editor).toMatchObject({ todo: 'new', busy: false })
  act(() => editor.onSaved('New task added.'))
  expect(notify).toHaveBeenCalledWith('New task added.')
  expect(screen.queryByText('Editor open')).not.toBeInTheDocument()
})

it('opens the editor for a new task from the empty list', () => {
  render(<TodosPage />)
  act(() => listProps().onCreate())
  expect(vi.mocked(TodoEditor).mock.lastCall![0].todo).toBe('new')
})

it('opens the editor for an existing task and closes it on cancel', () => {
  render(<TodosPage />)
  act(() => listProps().onEdit(todoFixture))
  const editor = vi.mocked(TodoEditor).mock.lastCall![0]
  expect(editor.todo).toBe(todoFixture)
  act(() => editor.onClose())
  expect(screen.queryByText('Editor open')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('confirms deletion and notifies once the task is deleted', () => {
  render(<TodosPage />)
  expect(screen.queryByText('Delete dialog open')).not.toBeInTheDocument()
  act(() => listProps().onDelete(todoFixture))
  const dialog = vi.mocked(DeleteTodoDialog).mock.lastCall![0]
  expect(dialog).toMatchObject({ todo: todoFixture, busy: false })
  act(() => dialog.onDeleted())
  expect(notify).toHaveBeenCalledWith('Task deleted.')
  expect(screen.queryByText('Delete dialog open')).not.toBeInTheDocument()
})

it('closes the delete confirmation without notifying', () => {
  render(<TodosPage />)
  act(() => listProps().onDelete(todoFixture))
  act(() => vi.mocked(DeleteTodoDialog).mock.lastCall![0].onClose())
  expect(screen.queryByText('Delete dialog open')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
