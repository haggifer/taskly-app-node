import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { TodosHeader } from './components/TodosHeader'
import { useClearCompletedMutation } from './hooks/useClearCompletedMutation'
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
  useClearCompletedMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({ TodosHeader: vi.fn(() => null) }))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({ TodoList: () => null }))
vi.mock('./components/TodoEditor', () => ({ TodoEditor: () => null }))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: () => null,
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

const notify = vi.fn()
const clearMutateAsync = vi.fn()
const clearReset = vi.fn()
const toggleReset = vi.fn()
const refetch = vi.fn()
const completed = { ...todoFixture, id: 2, completed: true }

function mockQuery(overrides: Record<string, unknown> = {}) {
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todoFixture, completed, { ...completed, id: 3 }],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useTodosQuery>)
}

function mockClear(error: Error | null = null) {
  vi.mocked(useClearCompletedMutation).mockReturnValue({
    error,
    reset: clearReset,
    mutateAsync: clearMutateAsync,
  } as unknown as ReturnType<typeof useClearCompletedMutation>)
}

function mockToggle(error: Error | null = null) {
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error,
    reset: toggleReset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
}

const headerProps = () => vi.mocked(TodosHeader).mock.lastCall![0]

beforeEach(() => {
  vi.clearAllMocks()
  mockQuery()
  mockClear()
  mockToggle()
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
})

it('passes the number of completed tasks to the header', () => {
  render(<TodosPage />)
  expect(headerProps().completedCount).toBe(2)
})

it('passes zero completed tasks while the list is loading', () => {
  mockQuery({ data: undefined, isPending: true })
  render(<TodosPage />)
  expect(headerProps().completedCount).toBe(0)
})

it.each([
  [2, '2 completed tasks deleted.'],
  [1, '1 completed task deleted.'],
  [0, '0 completed tasks deleted.'],
])(
  'clears completed tasks and notifies (%i deleted)',
  async (deleted, notice) => {
    clearMutateAsync.mockResolvedValue({ deleted })
    render(<TodosPage />)
    act(() => headerProps().onClearCompleted!())
    await waitFor(() => expect(notify).toHaveBeenCalledWith(notice))
    expect(clearMutateAsync).toHaveBeenCalledTimes(1)
  },
)

it('does not notify when clearing fails', async () => {
  clearMutateAsync.mockRejectedValue(new Error('Could not clear.'))
  render(<TodosPage />)
  act(() => headerProps().onClearCompleted!())
  await waitFor(() => expect(clearMutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('ignores clearing while a task operation is running', () => {
  vi.mocked(useTodosBusy).mockReturnValue(true)
  render(<TodosPage />)
  act(() => headerProps().onClearCompleted!())
  expect(clearMutateAsync).not.toHaveBeenCalled()
})

it('shows the clear error before the query error', () => {
  mockQuery({ error: new Error('Query failed.'), isError: true })
  mockClear(new Error('Could not clear.'))
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not clear.')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('Query failed.')
})

it('shows the toggle error before the clear error', () => {
  mockToggle(new Error('Could not update.'))
  mockClear(new Error('Could not clear.'))
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not update.')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('Could not clear.')
})

it('resets the clear error before retrying', async () => {
  const user = userEvent.setup()
  refetch.mockResolvedValue(undefined)
  mockClear(new Error('Could not clear.'))
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(clearReset).toHaveBeenCalledTimes(1)
  expect(toggleReset).toHaveBeenCalledTimes(1)
  expect(clearReset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})
