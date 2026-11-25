import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

function renderItem(todo: Todo, busy = false) {
  const callbacks = { onEdit: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn() }
  render(<TodoItem todo={todo} busy={busy} {...callbacks} />)
  return callbacks
}

it('shows a completed task with its description and id', () => {
  renderItem({
    ...todoFixture,
    completed: true,
    priority: 'high',
    description: 'Slides and script',
  })
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.getByText('High')).toBeVisible()
  expect(screen.getByText('Slides and script')).toBeVisible()
  expect(screen.getByText(`#${todoFixture.id}`)).toBeVisible()
  expect(
    screen.getByRole('checkbox', {
      name: `Mark as active: ${todoFixture.title}`,
    }),
  ).toBeChecked()
})

it('forwards toggle and delete requests', async () => {
  const user = userEvent.setup()
  const { onToggle, onDelete, onEdit } = renderItem(todoFixture)
  await user.click(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  )
  expect(onToggle).toHaveBeenCalledTimes(1)
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onEdit).not.toHaveBeenCalled()
})

it('disables every action while busy', () => {
  renderItem(todoFixture, true)
  expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  ).toBeDisabled()
})

it('shows no due date badge for an undated task', () => {
  renderItem(todoFixture)
  expect(screen.queryByText(/overdue/)).toBeNull()
  expect(screen.queryByText(/2026/)).toBeNull()
})

describe('due dates', () => {
  afterEach(() => vi.useRealTimers())

  function freezeToday() {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-10T12:00:00'))
  }

  it('marks a past due date as overdue', () => {
    freezeToday()
    renderItem({ ...todoFixture, due_date: '2026-10-09' })
    expect(screen.getByText('9 Oct 2026 · overdue')).toBeVisible()
  })

  it('shows a future due date without the overdue marker', () => {
    freezeToday()
    renderItem({ ...todoFixture, due_date: '2026-10-20' })
    expect(screen.getByText('20 Oct 2026')).toBeVisible()
    expect(screen.queryByText(/overdue/)).toBeNull()
  })

  it('does not mark a completed past task as overdue', () => {
    freezeToday()
    renderItem({ ...todoFixture, completed: true, due_date: '2026-10-01' })
    expect(screen.getByText('1 Oct 2026')).toBeVisible()
    expect(screen.queryByText(/overdue/)).toBeNull()
  })
})
