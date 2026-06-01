import type { ActionCodeRunner } from "../types";
import * as endCode from "./end";

const runners: Record<string, ActionCodeRunner> = {
  end: (ctx) => endCode.run(ctx),
};

export function run(name: string, ctx: Parameters<ActionCodeRunner>[0]): Promise<void> {
  const runner = runners[name];
  if (!runner) return Promise.resolve();
  return runner(ctx);
}
