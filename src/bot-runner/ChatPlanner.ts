import { Chat, ActionExecutionType, type RunningAction } from "../models/Chat/entity";
import * as ChatRepository from "../models/Chat/repository";
import * as ActionCodes from "../models/Action/codes";
import * as endCode from "../models/Action/codes/end";
import * as llm from "../LLMa";
import { logFlow, logFlowError } from "../services/Logs";

export interface PlannerContext {
  chatRunnedId: number;
  lastActionName?: string;
  lastActionId?: string | number;
  lastActionResult?: Record<string, unknown>;
  userContext?: { userId: number };
  stopChat?: () => void;
}

export interface PlannerResult {
  actionName: string;
  runCode: boolean;
}

export async function buildPlannerContext(
  chat: Chat,
  phone: string
): Promise<PlannerContext> {
  let lastActionName: string | undefined;
  let lastActionId: number | undefined;
  let lastActionResult: Record<string, unknown> | undefined;
  if (chat.chatRunnedId) {
    const last = await ChatRepository.getLastActionRunnedForChat(chat.chatRunnedId);
    if (last) {
      const action = await ChatRepository.getActionById(last.action_id);
      lastActionName = action?.name ?? undefined;
      lastActionId = action?.id ?? undefined;
      lastActionResult = { status: "completed" };
    }
    logFlow("planner", "built planner context from chat history", {
      phone,
      chatRunnedId: chat.chatRunnedId,
      hasLastAction: Boolean(lastActionName),
      lastActionName: lastActionName ?? null,
      lastActionId: lastActionId ?? null,
    });
  }
  const userContext = await ChatRepository.findUserByPhone(phone);
  logFlow("planner", "resolved user context for planner", {
    phone,
    hasUserContext: Boolean(userContext),
    userId: userContext?.userId ?? null,
  });
  return {
    chatRunnedId: chat.chatRunnedId!,
    lastActionName,
    lastActionId,
    lastActionResult,
    userContext: userContext ?? undefined,
    stopChat: () => chat.stop(),
  };
}

function matchesResult(
  suggestionResult: Record<string, unknown> | null,
  actualResult: Record<string, unknown> | undefined
): boolean {
  if (!suggestionResult || Object.keys(suggestionResult).length === 0) return true;
  if (!actualResult) return false;

  return Object.entries(suggestionResult).every(
    ([key, value]) => actualResult[key] === value
  );
}

export async function suggestNext(
  ctx: PlannerContext
): Promise<PlannerResult> {
  const previousActionId = ctx.lastActionId ?? null;
  const suggestions = await ChatRepository.getNextActionSuggestions(previousActionId);

  logFlow("planner", "looked up action suggestions from DB", {
    previousActionId,
    suggestionsCount: suggestions.length,
    suggestions: suggestions.map((s) => s.next_action_name),
    lastActionResult: ctx.lastActionResult,
  });

  const matched = suggestions.filter((s) =>
    matchesResult(s.result_previous_action, ctx.lastActionResult)
  );

  if (matched.length > 0) {
    logFlow("planner", "matched suggestion by result", {
      picked: matched[0].next_action_name,
      matchedCount: matched.length,
    });
    return { actionName: matched[0].next_action_name, runCode: true };
  }

  if (suggestions.length > 0) {
    logFlow("planner", "no result match, falling back to first suggestion", {
      picked: suggestions[0].next_action_name,
    });
    return { actionName: suggestions[0].next_action_name, runCode: true };
  }

  logFlow("planner", "no suggestions found for previous action, defaulting to 'end'", {
    previousActionId,
  });
  return { actionName: "end", runCode: true };
}

export async function runCodeAction(
  name: string,
  ctx: PlannerContext
): Promise<void> {
  logFlow("planner", "executing code action handler", {
    actionName: name,
    chatRunnedId: ctx.chatRunnedId,
    userId: ctx.userContext?.userId ?? null,
  });
  const startMs = Date.now();
  await ActionCodes.run(name, {
    chatRunnedId: ctx.chatRunnedId,
    userId: ctx.userContext?.userId,
    stopChat: ctx.stopChat,
  });
  logFlow("planner", "code action handler completed", {
    actionName: name,
    chatRunnedId: ctx.chatRunnedId,
    elapsedMs: Date.now() - startMs,
  });
}

export interface LlmActionResult {
  output?: string;
}

export async function runLlmAction(
  actionName: string,
  actionId: number,
  ctx: PlannerContext
): Promise<LlmActionResult | null> {
  const actionLlm = await ChatRepository.getActionLlmByActionId(actionId);
  if (!actionLlm) {
    logFlow("planner", "no LLM config found for action, skipping LLM execution", {
      actionName,
      actionId,
      chatRunnedId: ctx.chatRunnedId,
    });
    return null;
  }

  const prompt = buildLlmPrompt(actionName, ctx);
  logFlow("planner", "sending prompt to LLM for action", {
    actionName,
    actionId,
    actionLlmId: actionLlm.id,
    model: actionLlm.model ?? "default",
    promptLength: prompt.length,
    promptPreview: prompt.slice(0, 120),
  });

  const startMs = Date.now();
  const result = await llm.ask(prompt);
  const elapsedMs = Date.now() - startMs;

  const output = result.ok && result.value ? result.value : null;
  const status = result.ok ? "success" : "failed";

  logFlow("planner", "LLM action response received", {
    actionName,
    actionId,
    status,
    elapsedMs,
    hasOutput: Boolean(output),
    outputLength: output?.length ?? 0,
    outputPreview: output?.slice(0, 120) ?? null,
  });

  await ChatRepository.recordActionLlmRun(actionLlm.id, status, output);

  return { output: output ?? undefined };
}

function buildLlmPrompt(actionName: string, ctx: PlannerContext): string {
  const contextStr = JSON.stringify({
    chatRunnedId: ctx.chatRunnedId,
    lastActionName: ctx.lastActionName,
    userContext: ctx.userContext,
  });
  return `Execute action "${actionName}". Context: ${contextStr}. Provide a helpful, contextual response for the user.`;
}

export async function runNextAction(
  chat: Chat,
  phone: string,
  text: string
): Promise<string> {
  logFlow("planner", "starting runNextAction", {
    phone,
    chatRunnedId: chat.chatRunnedId,
    hasIncomingText: Boolean(text?.trim()),
    hasRunningAction: Boolean(chat.currentRunningAction),
  });
  if (!chat.chatRunnedId) return "Unable to start session.";

  let lastSuggestedAction: string | null = null;

  for (let step = 0; step < 10; step += 1) {
    logFlow("planner", "planner loop iteration started", { phone, chatRunnedId: chat.chatRunnedId, step });

    let ctx: PlannerContext;
    try {
      ctx = await buildPlannerContext(chat, phone);
    } catch (error) {
      logFlowError("planner", "buildPlannerContext threw during planner loop", error, { phone, step, chatRunnedId: chat.chatRunnedId ?? undefined });
      return "Internal error. Please try again.";
    }

    let actionName: string;
    let runCode: boolean;
    try {
      const suggestion = await suggestNext(ctx);
      actionName = suggestion.actionName;
      runCode = suggestion.runCode;
    } catch (error) {
      logFlowError("planner", "suggestNext threw during planner loop", error, { phone, step, chatRunnedId: chat.chatRunnedId ?? undefined });
      return "Internal error. Please try again.";
    }

    logFlow("planner", "planner suggested next action", {
      phone,
      chatRunnedId: chat.chatRunnedId,
      step,
      actionName,
      runCode,
      lastActionName: ctx.lastActionName ?? null,
    });

    if (actionName === lastSuggestedAction && actionName !== "end") {
      logFlow("planner", "detected repeated suggestion, breaking loop", {
        phone,
        chatRunnedId: chat.chatRunnedId,
        repeatedAction: actionName,
        step,
      });
      console.error(`[Planner] Loop detected: action "${actionName}" suggested twice in a row`);
      return "Flow error. Please try again.";
    }
    lastSuggestedAction = actionName;

    if (!runCode) {
      logFlow("planner", "planner instructed to not execute action code", {
        phone,
        chatRunnedId: chat.chatRunnedId,
        actionName,
      });
      return Chat.GetMessageReturn(chat, text, { lastActionName: actionName, suggestions: [] });
    }

    const action = await ChatRepository.getActionByName(actionName);
    if (!action) {
      logFlow("planner", "suggested action not found in repository", {
        phone,
        chatRunnedId: chat.chatRunnedId,
        actionName,
      });
      return Chat.GetMessageReturn(chat, text, {});
    }

    const executionType = action.type as ActionExecutionType;
    console.log(
      `[Action:status] starting ${actionName} (${executionType}) for chat ${chat.chatRunnedId}`
    );
    logFlow("planner", "action execution started", {
      phone,
      chatRunnedId: chat.chatRunnedId,
      actionName,
      actionId: action.id,
      executionType,
    });

    if (executionType === ActionExecutionType.Code) {
      try {
        await ChatRepository.recordActionRun(chat.chatRunnedId, action.id, null, null);
        await runCodeAction(actionName, ctx);
      } catch (error) {
        logFlowError("planner", "code action threw during execution", error, { phone, actionName, chatRunnedId: chat.chatRunnedId ?? undefined });
        return "Internal error. Please try again.";
      }
      console.log(`[Action:status] finished ${actionName} (${executionType})`);
      logFlow("planner", "code action finished", { phone, chatRunnedId: chat.chatRunnedId, actionName });
      if (actionName === "end") return endCode.END_MESSAGE;
      continue;
    }

    const actionQuestions = await ChatRepository.getQuestionsForAction(action.id);
    const firstQuestionId = actionQuestions.length > 0 ? actionQuestions[0].question_id : null;
    logFlow("planner", "loaded questions for action", {
      phone,
      chatRunnedId: chat.chatRunnedId,
      actionName,
      actionId: action.id,
      executionType,
      questionsCount: actionQuestions.length,
      questionIds: actionQuestions.map((q) => q.question_id),
      firstQuestionId,
      willAskUser: Boolean(firstQuestionId),
    });

    if (firstQuestionId) {
      const question = await ChatRepository.getQuestionById(firstQuestionId);
      if (question?.content) {
        const chatQuestionRunnedId = await ChatRepository.recordActionRun(
          chat.chatRunnedId,
          action.id,
          firstQuestionId,
          question.content
        );

        const running: RunningAction = {
          actionId: action.id,
          actionName,
          chatQuestionRunnedId,
          currentQuestionId: firstQuestionId,
          invalidAttempts: 0,
        };
        chat.setRunningAction(running);
        console.log(`[Action:status] waiting response for ${actionName} question ${firstQuestionId}`);
        logFlow("planner", "action moved to waiting user response", {
          phone,
          chatRunnedId: chat.chatRunnedId,
          actionName,
          actionId: action.id,
          questionId: firstQuestionId,
          chatQuestionRunnedId,
        });
        return question.content;
      }
    }

    try {
      await ChatRepository.recordActionRun(chat.chatRunnedId, action.id, null, null);
      logFlow("planner", "executing llm action without direct question", {
        phone,
        chatRunnedId: chat.chatRunnedId,
        actionName,
        actionId: action.id,
      });
      const result = await runLlmAction(actionName, action.id, ctx);
      console.log(`[Action:status] finished ${actionName} (${executionType})`);
      logFlow("planner", "llm action execution finished", {
        phone,
        chatRunnedId: chat.chatRunnedId,
        actionName,
        hasOutput: Boolean(result?.output),
      });
      if (result?.output) return result.output;
    } catch (error) {
      logFlowError("planner", "LLM action threw during execution", error, { phone, actionName, actionId: action.id, chatRunnedId: chat.chatRunnedId ?? undefined });
    }
  }

  logFlow("planner", "planner loop reached safety limit", {
    phone,
    chatRunnedId: chat.chatRunnedId,
  });
  return "Unable to continue the action flow.";
}
