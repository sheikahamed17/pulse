export type BackfillPage = { processed: number; next_after: string | null; done: boolean; errors: unknown[] }

/**
 * Drive the chunked backfill to completion. `postPage(after)` performs one
 * POST /api/admin/backfill and returns its JSON. Loops until `done` or the
 * iteration cap (runaway guard). Pure w.r.t. the injected postPage.
 */
export async function runBackfill(
  postPage: (after: string | undefined) => Promise<BackfillPage>,
  maxIterations = 200,
): Promise<{ totalProcessed: number; totalErrors: number; completed: boolean; iterations: number }> {
  let after: string | undefined = undefined
  let totalProcessed = 0, totalErrors = 0, iterations = 0
  while (iterations < maxIterations) {
    const page = await postPage(after)
    iterations++
    totalProcessed += page.processed
    totalErrors += page.errors.length
    if (page.done || !page.next_after) return { totalProcessed, totalErrors, completed: true, iterations }
    after = page.next_after
  }
  return { totalProcessed, totalErrors, completed: false, iterations }
}
