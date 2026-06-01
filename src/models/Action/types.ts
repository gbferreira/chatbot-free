export interface ActionCodeContext {
  chatRunnedId: number;
  userId?: number;
  stopChat?: () => void;
}

export type ActionCodeRunner = (ctx: ActionCodeContext) => Promise<void>;
