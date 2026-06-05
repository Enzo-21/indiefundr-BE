import type { UserServiceResult } from "@/services/users/user";
import { jsonError } from "./route";

export function toUserResponse<T>(
  result: UserServiceResult<T>,
  onSuccess: (data: T) => Response
): Response {
  if (!result.ok) {
    return jsonError(result.status, result.body);
  }
  return onSuccess(result.data);
}
