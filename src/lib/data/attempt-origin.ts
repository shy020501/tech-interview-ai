type OriginTable = 'attempts' | 'message_evaluations';
type QueryError = { code?: string; message?: string } | null;

/** Only an absent DB column permits legacy reads. Never bypass an auth or network failure. */
export function isMissingOriginColumn(error: QueryError, table: OriginTable): boolean {
  if (error?.code !== '42703') return false;
  return error.message === `column ${table}.origin does not exist`
    || error.message === `column public.${table}.origin does not exist`
    || error.message === 'column "origin" does not exist';
}

/** Before the Admin Test migration every saved attempt/evaluation is practice. No cached schema flag. */
export async function readWithOriginFallback<T extends { error: QueryError }>(
  table: OriginTable,
  read: (withOrigin: boolean) => PromiseLike<T>,
): Promise<{ result: T; originAvailable: boolean }> {
  const result = await read(true);
  if (!isMissingOriginColumn(result.error, table)) return { result, originAvailable: true };
  return { result: await read(false), originAvailable: false };
}
