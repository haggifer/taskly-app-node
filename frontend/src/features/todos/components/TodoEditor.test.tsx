import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    onSubmit,
    initial,
    error,
  }: {
    onSubmit: (input: TodoInput) => Promise<void>
    initial?: TodoInput
    error: string | null
  }) => (
    <>
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
      {initial && <output aria-label="Initial title">{initial.title}</output>}
      {error && <output aria-label="Form error">{error}</output>}
    </>
  ),
}))

beforeEach(() => vi.clearAllMocks())

function mockMutations({
  create = vi.fn(),
  update = vi.fn(),
  createPending = false,
  updatePending = false,
  createError = null,
  updateError = null,
}: {
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  createPending?: boolean
  updatePending?: boolean
  createError?: Error | null
  updateError?: Error | null
}) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: createPending,
    error: createError,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: updatePending,
    error: updateError,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
}

it('updates an existing task and reports the saved changes', async () => {
  const user = userEvent.setup()
  const create = vi.fn()
  const update = vi.fn().mockResolvedValue(todoFixture)
  mockMutations({ create, update })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(
    screen.getByRole('status', { name: 'Initial title' }),
  ).toHaveTextContent(todoFixture.title)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: todoFixture,
  })
  expect(create).not.toHaveBeenCalled()
})

it('keeps the editor open when saving fails', async () => {
  const user = userEvent.setup()
  const update = vi.fn().mockRejectedValue(new Error('Could not save.'))
  mockMutations({ update })
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onSaved={onSaved}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
})

it('passes the error of the active mutation to the form', () => {
  mockMutations({
    createError: new Error('Create failed.'),
    updateError: new Error('Update failed.'),
  })
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  expect(screen.getByRole('status', { name: 'Form error' })).toHaveTextContent(
    'Update failed.',
  )
})

it('does not save while the mutation is pending', async () => {
  const user = userEvent.setup()
  const create = vi.fn()
  mockMutations({ create, createPending: true })
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('does not save while another task operation is running', async () => {
  const user = userEvent.setup()
  const update = vi.fn()
  mockMutations({ update })
  const onClose = vi.fn()
  render(
    <TodoEditor todo={todoFixture} busy onClose={onClose} onSaved={vi.fn()} />,
  )
  expect(screen.queryByRole('status', { name: 'Form error' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(update).not.toHaveBeenCalled()
})

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})
