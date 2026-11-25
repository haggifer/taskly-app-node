import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { ClearCompletedResult, Todo } from '../types'

export function useClearCompletedMutation(): UseMutationResult<
  ClearCompletedResult,
  Error,
  void
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: todoKeys.clearCompleted,
    mutationFn: () => todosApi.clearCompleted(),
    onSuccess: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.list })
      queryClient.setQueryData<Todo[]>(todoKeys.list, (current) =>
        current?.filter((todo) => !ids.includes(todo.id)),
      )
    },
  })
}
