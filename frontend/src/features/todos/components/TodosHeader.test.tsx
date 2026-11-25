import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodosHeader } from './TodosHeader'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('invokes creation when enabled and blocks it when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const { rerender } = render(
    <TodosHeader disabled={false} onCreate={onCreate} />,
  )
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  expect(
    screen.getByText('Create, organize, and complete tasks.'),
  ).toBeVisible()
  const button = screen.getByRole('button', { name: 'New task' })
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
  rerender(<TodosHeader disabled onCreate={onCreate} />)
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('shows the completed count and clears completed tasks when enabled', async () => {
  const user = userEvent.setup()
  const onClearCompleted = vi.fn()
  const { rerender } = render(
    <TodosHeader
      disabled={false}
      onCreate={vi.fn()}
      completedCount={3}
      onClearCompleted={onClearCompleted}
    />,
  )
  const button = screen.getByRole('button', { name: 'Clear completed (3)' })
  await user.click(button)
  expect(onClearCompleted).toHaveBeenCalledTimes(1)
  rerender(
    <TodosHeader
      disabled
      onCreate={vi.fn()}
      completedCount={3}
      onClearCompleted={onClearCompleted}
    />,
  )
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onClearCompleted).toHaveBeenCalledTimes(1)
})

it.each([
  { completedCount: 0, onClearCompleted: vi.fn() },
  { completedCount: 2, onClearCompleted: undefined },
  { completedCount: undefined, onClearCompleted: vi.fn() },
])(
  'hides the clear button without completed tasks or a handler: %o',
  (props) => {
    render(<TodosHeader disabled={false} onCreate={vi.fn()} {...props} />)
    expect(
      screen.queryByRole('button', { name: /Clear completed/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New task' })).toBeVisible()
  },
)
