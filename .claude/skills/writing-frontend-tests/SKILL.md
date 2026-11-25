---
name: writing-frontend-tests
description: Writes Vitest + React Testing Library unit tests for the React front end in the repository's own style, isolating each unit with the design-system mocks. Use when the unit-test agent has a write or update decision for a file under frontend/src.
---

# Writing front-end tests

Read two or three neighbouring `*.test.tsx` files before writing: they are the style guide. Match them over anything
here.

## Files and style

- Put the test next to its source: `TodoItem.tsx` → `TodoItem.test.tsx`, `http.ts` → `http.test.ts`. One test file
  per module: extend the existing one rather than adding `X.something.test.tsx`. Its mocks are already set up, and
  a second file duplicates them and drifts.
- Prettier formats front-end code (no semicolons, single quotes, trailing commas). Run Prettier on every file you
  write (see `verifying-tests`).
- Import explicitly, as the existing tests do: `import { expect, it, vi } from 'vitest'`,
  `import { render, screen } from '@testing-library/react'`, `import userEvent from '@testing-library/user-event'`.
- Use `todoFixture` from `src/test/todoFixture` and spread it for variations: `{ ...todoFixture, completed: true }`.
- Name tests after what the user sees or what the unit returns: `it('marks overdue tasks with a warning badge')`.

## Isolating the unit

- **Design system:** always mock it with the shared mocks, using the right relative path:
  `vi.mock('../../../design-system', () => import('../../../design-system/mocks'))`.
- **Children and hooks:** a page or container test mocks its child components and data hooks, as
  `TodosPage.test.tsx` does, and asserts the props and callbacks it passes. Test each child in its own file.
- **API layer:** hooks mock `../api/todos` (`vi.mock('../api/todos', () => ({ todosApi: { … } }))`). The API module
  mocks `../../../lib/http`.

## Patterns

**Components:** query by role, label or text (`screen.getByRole('button', { name: 'Delete: Plan' })`). Drive
interactions with `const user = userEvent.setup()` and `await user.click(…)`. Assert the visible result and the
callback calls.

**TanStack Query hooks:** render with a fresh client per test and no retries:

```tsx
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
```

Seed the cache with `client.setQueryData(todoKeys.list, [todoFixture])`, run the mutation inside `act`, wait with
`waitFor`, then assert the API call and the cache (`client.getQueryData(todoKeys.list)`). Cover the error path.

**`lib/http.ts`:** stub fetch with `vi.stubGlobal('fetch', vi.fn())`, and call `vi.unstubAllGlobals()` in
`afterEach`. Answer with real `Response` objects: `new Response(JSON.stringify(body), { status: 422 })`. Cover each
error message, 204, a network error and an aborted request.

**Time:** use `vi.useFakeTimers()` with `vi.setSystemTime(new Date('2026-10-10T12:00:00'))` for dates (`isOverdue`)
and `act(() => vi.advanceTimersByTime(4000))` for timeouts (`useNotice`). Restore with `vi.useRealTimers()` in
`afterEach`. A test must never depend on today's date.

## Avoid

- Snapshot tests, styled-components class names, and component internals such as state or refs.
- Real network calls, or relying on test order. `src/test/setup.ts` already runs `cleanup`. Add
  `beforeEach(() => vi.clearAllMocks())` when module mocks are shared between tests.
- Testing the design system itself: it's excluded from coverage and has Storybook stories.
