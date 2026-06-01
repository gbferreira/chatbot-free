import type { ActionCodeContext } from "../types";
import * as ChatRepository from "../../Chat/repository";

export const END_MESSAGE = "Chat ended. Goodbye!";

export async function run(ctx: ActionCodeContext): Promise<void> {
  await ChatRepository.endChat(ctx.chatRunnedId);
  ctx.stopChat?.();
}
