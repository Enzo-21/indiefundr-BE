export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; msg: string } };

export function actionSuccess<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError(
  code: string,
  msg: string
): ActionResult<never> {
  return { ok: false, error: { code, msg } };
}
