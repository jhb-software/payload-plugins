/**
 * Instrumentation for counting database adapter operations.
 *
 * Wraps every data method of a `payload.db` adapter so tests (and the perf bench) can assert
 * which queries an operation issued. Capturing is off until `start()` is called, so the wrapper
 * is free when idle. Optionally injects simulated per-round-trip latency (used by the bench).
 */

export type DbOp = {
  collection?: string
  method: string
  select?: string
  where?: string
}

const DATA_METHODS = [
  'find',
  'findOne',
  'create',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'count',
  'countDistinct',
  'findDistinct',
  'queryDrafts',
  'findVersions',
  'createVersion',
  'updateVersion',
  'deleteVersions',
  'countVersions',
  'upsert',
  'findGlobal',
  'createGlobal',
  'updateGlobal',
  'findGlobalVersions',
  'createGlobalVersion',
  'updateGlobalVersion',
  'countGlobalVersions',
]

const TX_METHODS = ['beginTransaction', 'commitTransaction', 'rollbackTransaction']

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function summarizeWhere(where: unknown): string | undefined {
  if (!where) return undefined
  try {
    return JSON.stringify(where, (_key, value) =>
      typeof value === 'string' && value.length > 24 ? value.slice(0, 24) + '…' : value,
    )
  } catch {
    return '?'
  }
}

export type DbOpsInstrumentation = {
  /** Stops capturing and returns the operations recorded since `start()`. */
  stop: () => DbOp[]
  /** Clears the recorded operations and starts capturing. */
  start: () => void
  /** The number of transaction begin/commit/rollback calls since `start()`. */
  txOps: () => number
}

/**
 * Wraps the adapter's data methods once. Safe to call multiple times on the same adapter —
 * subsequent calls return a handle to the existing instrumentation.
 */
export function instrumentDbOps(
  db: any,
  { latencyMs = 0, onOp }: { latencyMs?: number; onOp?: (op: DbOp) => void } = {},
): DbOpsInstrumentation {
  if (db.__dbOpsInstrumentation) {
    return db.__dbOpsInstrumentation as DbOpsInstrumentation
  }

  const ops: DbOp[] = []
  let txOps = 0
  let capturing = false

  for (const method of DATA_METHODS) {
    if (typeof db[method] !== 'function') continue
    const original = db[method].bind(db)
    db[method] = async (args: any, ...rest: any[]) => {
      if (capturing) {
        const op: DbOp = {
          collection: args?.collection ?? args?.global ?? args?.globalSlug,
          method,
          select: args?.select ? JSON.stringify(args.select) : undefined,
          where: summarizeWhere(args?.where),
        }
        ops.push(op)
        onOp?.(op)
        if (latencyMs > 0) {
          await sleep(latencyMs)
        }
      }
      return original(args, ...rest)
    }
  }

  for (const method of TX_METHODS) {
    if (typeof db[method] !== 'function') continue
    const original = db[method].bind(db)
    db[method] = async (...args: any[]) => {
      if (capturing) txOps++
      return original(...args)
    }
  }

  const instrumentation: DbOpsInstrumentation = {
    start: () => {
      ops.length = 0
      txOps = 0
      capturing = true
    },
    stop: () => {
      capturing = false
      return [...ops]
    },
    txOps: () => txOps,
  }

  db.__dbOpsInstrumentation = instrumentation
  return instrumentation
}
