import db from "../../database/configuration";

interface QuestionSchemaFlags {
  extractionKey: boolean;
  llmPromptExtractionData: boolean;
  llmPromptValidationData: boolean;
  sqlVerificationOfData: boolean;
  invalidAnswerMessage: boolean;
  nextQuestionId: boolean;
}

interface ChatQuestionRunnedSchemaFlags {
  questionContent: boolean;
}

interface QuestionResponsesSchemaFlags {
  extractedData: boolean;
}

let questionSchemaFlagsPromise: Promise<QuestionSchemaFlags> | null = null;
let chatQuestionRunnedSchemaFlagsPromise: Promise<ChatQuestionRunnedSchemaFlags> | null = null;
let questionResponsesSchemaFlagsPromise: Promise<QuestionResponsesSchemaFlags> | null = null;

async function getQuestionSchemaFlags(): Promise<QuestionSchemaFlags> {
  if (!questionSchemaFlagsPromise) {
    questionSchemaFlagsPromise = (async () => {
      const [
        extractionKey,
        llmPromptExtractionData,
        llmPromptValidationData,
        sqlVerificationOfData,
        invalidAnswerMessage,
        nextQuestionId,
      ] =
        await Promise.all([
          db.schema.hasColumn("questions", "extraction_key"),
          db.schema.hasColumn("questions", "llm_prompt_extraction_data"),
          db.schema.hasColumn("questions", "llm_prompt_validation_data"),
          db.schema.hasColumn("questions", "sql_verification_of_data"),
          db.schema.hasColumn("questions", "invalid_answer_message"),
          db.schema.hasColumn("questions", "next_question_id"),
        ]);
      return {
        extractionKey,
        llmPromptExtractionData,
        llmPromptValidationData,
        sqlVerificationOfData,
        invalidAnswerMessage,
        nextQuestionId,
      };
    })();
  }
  return questionSchemaFlagsPromise;
}

async function getChatQuestionRunnedSchemaFlags(): Promise<ChatQuestionRunnedSchemaFlags> {
  if (!chatQuestionRunnedSchemaFlagsPromise) {
    chatQuestionRunnedSchemaFlagsPromise = (async () => {
      const questionContent = await db.schema.hasColumn("chat_question_runned", "question_content");
      return { questionContent };
    })();
  }
  return chatQuestionRunnedSchemaFlagsPromise;
}

async function getQuestionResponsesSchemaFlags(): Promise<QuestionResponsesSchemaFlags> {
  if (!questionResponsesSchemaFlagsPromise) {
    questionResponsesSchemaFlagsPromise = (async () => {
      const extractedData = await db.schema.hasColumn("question_responses", "extracted_data");
      return { extractedData };
    })();
  }
  return questionResponsesSchemaFlagsPromise;
}

export interface UserContext {
  userId: number;
}

function stripDdi(digits: string): string {
  if (digits.startsWith("55") && digits.length >= 12) {
    return digits.slice(2);
  }
  if (digits.length > 11) {
    return digits.slice(-11);
  }
  return digits;
}

export async function findUserByPhone(phone: string): Promise<UserContext | null> {
  const raw = (phone ?? "").replace(/\D/g, "");
  if (!raw) return null;
  const normalized = stripDdi(raw);

  const row = await db("users")
    .whereRaw(
      `RIGHT(REGEXP_REPLACE(COALESCE(users.phone, ''), '\\D', '', 'g'), 11) = ?`,
      [normalized]
    )
    .select("users.id as userId")
    .first();

  if (!row) return null;
  return { userId: row.userId };
}

export async function findOrCreateUserByPhone(phone: string): Promise<UserContext> {
  const existing = await findUserByPhone(phone);
  if (existing) return existing;

  const raw = (phone ?? "").replace(/\D/g, "");
  const [row] = await db("users").insert({ phone: raw }).returning("id");
  return { userId: row.id };
}

export interface ChatRunnedRecord {
  id: number;
  user_id: number | null;
  started_at: Date;
  ended_at: Date | null;
}

export async function create(userId: number | null = null): Promise<number> {
  const [row] = await db("chat_runned")
    .insert({ user_id: userId })
    .returning("id");

  return row.id;
}

export async function findByChatRunnedId(
  id: number
): Promise<ChatRunnedRecord | null> {
  return db("chat_runned").where("id", id).first();
}

export interface LastActionRunnedRecord {
  action_id: number;
  question_id: number | null;
  created_at: Date;
}

export async function getLastActionRunnedForChat(
  chatRunnedId: number
): Promise<LastActionRunnedRecord | null> {
  const row = await db("chat_question_runned")
    .where("chat_runned_id", chatRunnedId)
    .orderBy("created_at", "desc")
    .select("action_id", "question_id", "created_at")
    .first();

  return row ?? null;
}

export interface ActionRecord {
  id: number;
  type: string;
  name: string | null;
  question_id: number | null;
}

export async function getActionById(actionId: number): Promise<ActionRecord | null> {
  return db("actions")
    .where("id", actionId)
    .select("id", "type", "name", "question_id")
    .first();
}

export interface ActionResultSuggestionRecord {
  next_action_name: string;
  result_previous_action: Record<string, unknown> | null;
}

export async function getNextActionSuggestions(
  previousActionId: string | number | null
): Promise<ActionResultSuggestionRecord[]> {
  const query = db("action_result_suggestions")
    .select("next_action_name", "result_previous_action")
    .orderBy("created_at", "asc");

  if (previousActionId === null) {
    query.whereNull("previous_action_id");
  } else {
    query.where("previous_action_id", previousActionId);
  }

  return query;
}

export async function endChat(chatRunnedId: number): Promise<void> {
  await db("chat_runned")
    .where("id", chatRunnedId)
    .update({ ended_at: db.fn.now() });
}

export async function updateChatUser(chatRunnedId: number, userId: number): Promise<void> {
  await db("chat_runned").where("id", chatRunnedId).update({ user_id: userId });
}

export async function getLastChatRunnedForUser(
  userId: number
): Promise<ChatRunnedRecord | null> {
  return db("chat_runned")
    .where("user_id", userId)
    .whereNull("ended_at")
    .orderBy("started_at", "desc")
    .first();
}

export async function getActionByName(name: string): Promise<ActionRecord | null> {
  return db("actions").where("name", name).select("id", "type", "name", "question_id").first();
}

export interface ActionLlmRecord {
  id: number;
  action_id: number;
  model: string | null;
  config: Record<string, unknown> | null;
}

export async function getActionLlmByActionId(
  actionId: number
): Promise<ActionLlmRecord | null> {
  const row = await db("action_llm")
    .where("action_id", actionId)
    .select("id", "action_id", "model", "config")
    .first();
  return row ?? null;
}

export async function recordActionLlmRun(
  actionLlmId: number,
  status: string,
  output: string | null
): Promise<void> {
  await db("action_llm_runned").insert({
    action_llm_id: actionLlmId,
    status,
    output,
  });
}

export interface ChatQuestionRunnedRecord {
  id: number;
  chat_runned_id: number;
  action_id: number;
  question_id: number | null;
  created_at: Date;
}

export async function recordActionRun(
  chatRunnedId: number,
  actionId: number,
  questionId?: number | null,
  questionContent?: string | null
): Promise<number> {
  const flags = await getChatQuestionRunnedSchemaFlags();
  const payload: Record<string, number | string | null> = {
    chat_runned_id: chatRunnedId,
    action_id: actionId,
    question_id: questionId ?? null,
  };
  if (flags.questionContent) {
    payload.question_content = questionContent ?? null;
  }

  const [row] = await db("chat_question_runned").insert(payload).returning("id");
  return row.id;
}

export interface QuestionRecord {
  id: number;
  content: string | null;
  extraction_key: string | null;
  llm_prompt_extraction_data: string | null;
  llm_prompt_validation_data: string | null;
  sql_verification_of_data: string | null;
  invalid_answer_message: string | null;
  next_question_id: number | null;
}

export async function getQuestionById(questionId: number): Promise<QuestionRecord | null> {
  const flags = await getQuestionSchemaFlags();
  const selectColumns: string[] = ["id", "content"];
  if (flags.extractionKey) selectColumns.push("extraction_key");
  if (flags.llmPromptExtractionData) selectColumns.push("llm_prompt_extraction_data");
  if (flags.llmPromptValidationData) selectColumns.push("llm_prompt_validation_data");
  if (flags.sqlVerificationOfData) selectColumns.push("sql_verification_of_data");
  if (flags.invalidAnswerMessage) selectColumns.push("invalid_answer_message");
  if (flags.nextQuestionId) selectColumns.push("next_question_id");

  const row = await db("questions")
    .where("id", questionId)
    .select(...selectColumns)
    .first();

  if (!row) return null;
  return {
    id: row.id,
    content: row.content ?? null,
    extraction_key: flags.extractionKey ? (row.extraction_key ?? null) : null,
    llm_prompt_extraction_data: flags.llmPromptExtractionData ? (row.llm_prompt_extraction_data ?? null) : null,
    llm_prompt_validation_data: flags.llmPromptValidationData ? (row.llm_prompt_validation_data ?? null) : null,
    sql_verification_of_data: flags.sqlVerificationOfData ? (row.sql_verification_of_data ?? null) : null,
    invalid_answer_message: flags.invalidAnswerMessage ? (row.invalid_answer_message ?? null) : null,
    next_question_id: flags.nextQuestionId ? (row.next_question_id ?? null) : null,
  };
}

export interface ActionQuestionRecord {
  question_id: number;
  sort_order: number;
}

export async function getQuestionsForAction(actionId: number): Promise<ActionQuestionRecord[]> {
  return db("action_questions")
    .where("action_id", actionId)
    .select("question_id", "sort_order")
    .orderBy("sort_order", "asc");
}

export async function getResponsesForChatQuestionRunned(
  chatQuestionRunnedId: number
): Promise<{ question_id: number; content: string | null; extracted_data: Record<string, string> | null }[]> {
  const flags = await getQuestionResponsesSchemaFlags();
  const selectColumns: string[] = ["question_id", "content"];
  if (flags.extractedData) selectColumns.push("extracted_data");

  const rows = await db("question_responses")
    .where("chat_question_runned_id", chatQuestionRunnedId)
    .select(...selectColumns)
    .orderBy("created_at", "asc");

  return rows.map((row) => ({
    question_id: row.question_id,
    content: row.content ?? null,
    extracted_data: flags.extractedData ? (row.extracted_data ?? null) : null,
  }));
}

export async function saveQuestionResponse(
  chatQuestionRunnedId: number,
  questionId: number,
  content: string,
  extractedData?: Record<string, string> | null
): Promise<void> {
  const flags = await getQuestionResponsesSchemaFlags();
  const payload: Record<string, unknown> = {
    chat_question_runned_id: chatQuestionRunnedId,
    question_id: questionId,
    content,
  };
  if (flags.extractedData) {
    payload.extracted_data = extractedData ?? null;
  }

  await db("question_responses").insert(payload);
}

