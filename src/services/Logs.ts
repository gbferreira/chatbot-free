export function logFlow(scope: string, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  if (meta === undefined) {
    console.log(`[ChatFlow:${scope}] [${ts}] ${message}`);
    return;
  }
  console.log(`[ChatFlow:${scope}] [${ts}] ${message}`, meta);
}

export function logFlowError(scope: string, message: string, error: unknown, meta?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const errMsg = error instanceof Error ? error.message : String(error);
  const errStack = error instanceof Error ? error.stack : undefined;
  const payload = { ...meta, error: errMsg, ...(errStack ? { stack: errStack } : {}) };
  console.error(`[ChatFlow:${scope}] [${ts}] ${message}`, payload);
}
