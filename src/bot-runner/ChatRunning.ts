import { Chat, type RunningAction } from "../models/Chat/entity";
import * as endCode from "../models/Action/codes/end";
import * as ChatRepository from "../models/Chat/repository";
import * as ChatPlanner from "./ChatPlanner";
import * as ActionRunning from "./ActionRunning";
import { logFlow, logFlowError } from "../services/Logs";

const chats = new Map<string, Chat>();
const phoneLocks = new Map<string, Promise<string>>();

function getOrCreateChat(number: string, chatRunnedId: number): Chat {
  let chat = chats.get(number);
  if (!chat) {
    chat = new Chat(number, "running", chatRunnedId);
    chats.set(number, chat);
    logFlow("chat", "created in-memory chat instance", { number, chatRunnedId });
  } else if (!chat.isRunning()) {
    chat.start();
    logFlow("chat", "restarted previously stopped chat instance", { number, chatRunnedId });
  } else {
    logFlow("chat", "reused existing running chat instance", { number, chatRunnedId });
  }
  return chat;
}

async function resolveChatSession(
  phone: string
): Promise<{ id: number; userContext: { userId: number } }> {
  const userContext = await ChatRepository.findOrCreateUserByPhone(phone);
  logFlow("session", "resolved user context by phone", { phone, userId: userContext.userId });

  const last = await ChatRepository.getLastChatRunnedForUser(userContext.userId);
  logFlow("session", "checked last session for user", {
    phone,
    userId: userContext.userId,
    hasLastChat: Boolean(last),
    lastChatEnded: last?.ended_at != null,
  });
  if (last && !last.ended_at) {
    logFlow("session", "reusing open session", { phone, chatRunnedId: last.id });
    return { id: last.id, userContext };
  }
  const id = await ChatRepository.create(userContext.userId);
  logFlow("session", "created new session for user", { phone, userId: userContext.userId, chatRunnedId: id });
  return { id, userContext };
}

export function getChats(): Map<string, Chat> {
  return chats;
}

export function findChatByNumber(number: string): Chat | undefined {
  return chats.get(number);
}

async function completeRunningAction(
  chat: Chat,
  running: RunningAction,
  phone: string
): Promise<string> {
  if (!chat.chatRunnedId) return "Unable to start session.";

  console.log(`[Action:status] completing ${running.actionName} for chat ${chat.chatRunnedId}`);
  logFlow("complete", "completing running action", {
    phone,
    chatRunnedId: chat.chatRunnedId,
    actionName: running.actionName,
    actionId: running.actionId,
    chatQuestionRunnedId: running.chatQuestionRunnedId,
  });

  logFlow("complete", "action completed, returning to planner for next action", {
    phone,
    chatRunnedId: chat.chatRunnedId,
    completedAction: running.actionName,
    completedActionId: running.actionId,
  });
  console.log(`[Action:status] completed ${running.actionName} for chat ${chat.chatRunnedId}`);
  return ChatPlanner.runNextAction(chat, phone, "");
}

async function resetChatAfterMaxTrials(chat: Chat): Promise<string> {
  if (chat.chatRunnedId) {
    await ChatRepository.endChat(chat.chatRunnedId);
    logFlow("reset", "ended chat_runned after max invalid attempts", {
      number: chat.number,
      chatRunnedId: chat.chatRunnedId,
    });
  }
  chat.stop();
  chats.delete(chat.number);
  console.log(
    `[Action:status] max invalid attempts reached, chat reset for number ${chat.number}`
  );
  return `${endCode.END_MESSAGE} Session reset. Send "hi" to start again.`;
}

async function handleRunningActionResponse(
  chat: Chat,
  text: string,
  phone: string
): Promise<string> {
  const running = chat.currentRunningAction;
  if (!running || !chat.chatRunnedId) return Chat.GetMessageReturn(chat, text, {});
  logFlow("response", "handling response for running action", {
    phone,
    chatRunnedId: chat.chatRunnedId,
    actionName: running.actionName,
    actionId: running.actionId,
    currentQuestionId: running.currentQuestionId,
    invalidAttempts: running.invalidAttempts,
    textLength: text.length,
  });

  const currentQuestion = await ChatRepository.getQuestionById(running.currentQuestionId);
  if (!currentQuestion?.content) {
    logFlow("response", "current question has no content, falling back to default", {
      phone,
      chatRunnedId: chat.chatRunnedId,
      questionId: running.currentQuestionId,
    });
    return Chat.GetMessageReturn(chat, text, {});
  }

  logFlow("response", "loaded current question for analysis", {
    phone,
    chatRunnedId: chat.chatRunnedId,
    questionId: currentQuestion.id,
    questionContentPreview: currentQuestion.content.slice(0, 80),
    hasExtractionKey: Boolean(currentQuestion.extraction_key),
    extractionKey: currentQuestion.extraction_key ?? null,
    hasLlmExtraction: Boolean(currentQuestion.llm_prompt_extraction_data),
    hasLlmValidation: Boolean(currentQuestion.llm_prompt_validation_data),
    hasSqlVerification: Boolean(currentQuestion.sql_verification_of_data),
    hasNextQuestion: Boolean(currentQuestion.next_question_id),
  });

  const extractionContext = await ActionRunning.collectExtractionData(running.chatQuestionRunnedId);
  logFlow("response", "collected previous extraction context for analysis", {
    phone,
    chatRunnedId: chat.chatRunnedId,
    chatQuestionRunnedId: running.chatQuestionRunnedId,
    extractedKeys: Object.keys(extractionContext),
    extractedPairs: extractionContext,
  });

  const analysis = await ActionRunning.analyzeQuestionResponse(currentQuestion, text, phone, extractionContext);
  if (!analysis.isValid) {
    logFlow("response", "user response considered INVALID by analysis pipeline", {
      phone,
      chatRunnedId: chat.chatRunnedId,
      actionName: running.actionName,
      questionId: currentQuestion.id,
      rejectedByStep: analysis.rejectedByStep,
      userTextPreview: text.slice(0, 80),
      extractedValue: analysis.extractedValue,
      extractedData: analysis.extractedData,
      invalidAttemptsBefore: running.invalidAttempts,
      maxAttempts: ActionRunning.MAX_INVALID_ATTEMPTS_PER_QUESTION,
      willReset: running.invalidAttempts + 1 >= ActionRunning.MAX_INVALID_ATTEMPTS_PER_QUESTION,
    });
    await ChatRepository.saveQuestionResponse(
      running.chatQuestionRunnedId,
      currentQuestion.id,
      text,
      analysis.extractedData
    );

    const attempts = running.invalidAttempts + 1;
    chat.setRunningAction({
      ...running,
      invalidAttempts: attempts,
    });
    if (attempts >= ActionRunning.MAX_INVALID_ATTEMPTS_PER_QUESTION) {
      logFlow("response", "max invalid attempts reached for question", {
        phone,
        chatRunnedId: chat.chatRunnedId,
        actionName: running.actionName,
        questionId: currentQuestion.id,
        rejectedByStep: analysis.rejectedByStep,
        attempts,
      });
      return resetChatAfterMaxTrials(chat);
    }

    const retryMessage = ActionRunning.buildRetryMessage(currentQuestion, analysis, text);

    const retryRunId = await ChatRepository.recordActionRun(
      chat.chatRunnedId,
      running.actionId,
      currentQuestion.id,
      retryMessage
    );

    chat.setRunningAction({
      ...running,
      chatQuestionRunnedId: retryRunId,
      invalidAttempts: attempts,
    });
    logFlow("response", "sending retry message for invalid response", {
      phone,
      chatRunnedId: chat.chatRunnedId,
      actionName: running.actionName,
      questionId: currentQuestion.id,
      rejectedByStep: analysis.rejectedByStep,
      retryMessage,
      retryRunId,
      attempts,
    });

    return retryMessage;
  }

  logFlow("response", "user response considered VALID by analysis pipeline", {
    phone,
    chatRunnedId: chat.chatRunnedId,
    actionName: running.actionName,
    questionId: currentQuestion.id,
    userTextPreview: text.slice(0, 80),
    extractedData: analysis.extractedData,
    hasNextQuestion: Boolean(currentQuestion.next_question_id),
    nextQuestionId: currentQuestion.next_question_id ?? null,
  });
  await ChatRepository.saveQuestionResponse(
    running.chatQuestionRunnedId,
    currentQuestion.id,
    text,
    analysis.extractedData
  );

  const nextQuestionId = currentQuestion.next_question_id;
  if (nextQuestionId) {
    const nextQuestion = await ChatRepository.getQuestionById(nextQuestionId);
    if (nextQuestion?.content) {
      await ChatRepository.recordActionRun(
        chat.chatRunnedId,
        running.actionId,
        nextQuestionId,
        nextQuestion.content
      );
      console.log(`[Action:status] waiting response for ${running.actionName} question ${nextQuestionId}`);
      chat.setRunningAction({
        ...running,
        currentQuestionId: nextQuestionId,
        invalidAttempts: 0,
      });
      logFlow("response", "moving to next question in same action", {
        phone,
        chatRunnedId: chat.chatRunnedId,
        actionName: running.actionName,
        nextQuestionId,
      });
      return nextQuestion.content;
    }
  }

  chat.setRunningAction(null);
  logFlow("response", "no further questions, completing running action", {
    phone,
    chatRunnedId: chat.chatRunnedId,
    actionName: running.actionName,
  });
  return completeRunningAction(chat, running, phone);
}

async function processMessage(
  number: string,
  text: string
): Promise<string> {
  let chat = findChatByNumber(number);

  if (chat && !chat.isRunning()) {
    logFlow("incoming", "clearing previously stopped chat before new session", {
      number,
      previousChatRunnedId: chat.chatRunnedId,
      previousStartedAt: chat.startedAt.toISOString(),
    });
    chats.delete(number);
    chat = undefined;
    console.log(`[Action:status] previous stopped chat cleared for number ${number}`);
  }

  if (!chat) {
    const session = await resolveChatSession(number);
    chat = getOrCreateChat(number, session.id);
    logFlow("incoming", "chat initialized for incoming message", {
      number,
      chatRunnedId: chat.chatRunnedId,
    });
  }

  if (chat.currentRunningAction) {
    logFlow("incoming", "routing message to running action response handler", {
      number,
      chatRunnedId: chat.chatRunnedId,
      runningAction: chat.currentRunningAction.actionName,
      currentQuestionId: chat.currentRunningAction.currentQuestionId,
    });
    return handleRunningActionResponse(chat, text, number);
  }

  logFlow("incoming", "routing message to planner for next action", {
    number,
    chatRunnedId: chat.chatRunnedId,
  });

  return ChatPlanner.runNextAction(chat, number, text);
}

export async function handleIncomingMessage(
  number: string,
  text: string
): Promise<string> {
  logFlow("incoming", "received incoming message for processing", {
    number,
    textLength: text.length,
    hasText: Boolean(text.trim()),
  });

  const previous = phoneLocks.get(number) ?? Promise.resolve("");
  const current = previous.then(
    () => processMessage(number, text),
    () => processMessage(number, text)
  );

  const guarded = current.catch((error) => {
    logFlowError("incoming", "unhandled error in message processing pipeline", error, {
      number,
      textLength: text.length,
    });
    console.error(`[ChatRunning] Error processing message for ${number}:`, error);
    return "Could not process your message. Please try again.";
  });

  phoneLocks.set(number, guarded);
  guarded.finally(() => {
    if (phoneLocks.get(number) === guarded) {
      phoneLocks.delete(number);
    }
  });

  return guarded;
}

export { Chat };
