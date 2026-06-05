import * as ChatRepository from "../models/Chat/repository";
import * as Sql from "../services/Sql";
import * as llm from "../LLMa";
import { logFlow } from "../services/Logs";

export const MAX_INVALID_ATTEMPTS_PER_QUESTION = 3;

export interface QuestionResponseAnalysis {
  isValid: boolean;
  extractedData: Record<string, string> | null;
  rejectedByStep: "llm_validation" | "sql_verification" | null;
  extractedValue: string | null;
}

export async function collectExtractionData(chatQuestionRunnedId: number): Promise<Record<string, string>> {
  const responses = await ChatRepository.getResponsesForChatQuestionRunned(chatQuestionRunnedId);
  logFlow("extraction", "collecting extraction data from previous responses", {
    chatQuestionRunnedId,
    responsesCount: responses.length,
  });

  const extracted: Record<string, string> = {};

  for (const response of responses) {
    if (response.extracted_data) {
      Object.assign(extracted, response.extracted_data);
      continue;
    }
    const question = await ChatRepository.getQuestionById(response.question_id);
    const key = question?.extraction_key?.trim();
    const value = (response.content ?? "").trim();
    if (key && value) extracted[key] = value;
  }

  logFlow("extraction", "extraction data collected from responses", {
    chatQuestionRunnedId,
    extractedKeys: Object.keys(extracted),
    extractedPairs: extracted,
  });

  return extracted;
}

export function parseJsonFromLlmText(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

const LLM_MAX_RETRIES = 3;

async function extractWithLlm(
  prompt: string,
  userText: string,
  extractionKey: string | null
): Promise<string | null> {
  const keyHint = extractionKey
    ? `\nThe field to extract is: "${extractionKey}". Return the complete value without truncating.`
    : "";
  const fullPrompt = `${prompt}${keyHint}\n\nResposta do usuario: ${userText}`;
  logFlow("extraction", "sending extraction prompt to LLM", {
    promptLength: fullPrompt.length,
    dbPrompt: prompt,
    extractionKey,
    userText: userText.slice(0, 120),
    fullPromptSent: fullPrompt,
    maxRetries: LLM_MAX_RETRIES,
  });

  for (let attempt = 1; attempt <= LLM_MAX_RETRIES; attempt++) {
    const startMs = Date.now();
    const result = await llm.ask(fullPrompt);
    const elapsedMs = Date.now() - startMs;

    if (!result.ok || !result.value?.trim()) {
      logFlow("extraction", `LLM extraction attempt ${attempt}/${LLM_MAX_RETRIES} returned no usable value`, {
        attempt,
        llmOk: result.ok,
        llmRawValue: result.value?.slice(0, 80) ?? null,
        elapsedMs,
        willRetry: attempt < LLM_MAX_RETRIES,
      });
      continue;
    }

    const value = result.value.trim();
    if (value.toLowerCase() === "null" || !value) {
      logFlow("extraction", `LLM extraction attempt ${attempt}/${LLM_MAX_RETRIES} returned 'null' literal`, {
        attempt,
        elapsedMs,
        willRetry: attempt < LLM_MAX_RETRIES,
      });
      continue;
    }

    logFlow("extraction", "LLM extraction succeeded", {
      extractedValue: value.slice(0, 120),
      originalUserText: userText.slice(0, 120),
      extractionKey,
      attempt,
      elapsedMs,
    });
    return value;
  }

  logFlow("extraction", "LLM extraction failed after all retries", {
    extractionKey,
    userText: userText.slice(0, 120),
    totalAttempts: LLM_MAX_RETRIES,
  });
  return null;
}

async function validateWithLlm(
  prompt: string,
  extractedValue: string,
  originalUserText: string
): Promise<boolean> {
  const fullPrompt = prompt
    .replace(/:value/g, extractedValue)
    .replace(/:original/g, originalUserText);

  logFlow("validation", "sending validation prompt to LLM", {
    extractedValue: extractedValue.slice(0, 120),
    originalUserText: originalUserText.slice(0, 120),
    fullPromptSent: fullPrompt,
    maxRetries: LLM_MAX_RETRIES,
  });

  for (let attempt = 1; attempt <= LLM_MAX_RETRIES; attempt++) {
    const startMs = Date.now();
    const result = await llm.ask(fullPrompt);
    const elapsedMs = Date.now() - startMs;
    if (!result.ok || !result.value?.trim()) {
      logFlow("validation", `LLM validation attempt ${attempt}/${LLM_MAX_RETRIES} returned no response`, {
        attempt,
        llmOk: result.ok,
        elapsedMs,
        willRetry: attempt < LLM_MAX_RETRIES,
      });
      continue;
    }

    const answer = result.value.trim().toLowerCase();
    const isClearAnswer = answer === "true" || answer === "false";

    if (!isClearAnswer && attempt < LLM_MAX_RETRIES) {
      logFlow("validation", `LLM validation attempt ${attempt}/${LLM_MAX_RETRIES} returned ambiguous answer, retrying`, {
        attempt,
        llmAnswer: answer.slice(0, 80),
        elapsedMs,
      });
      continue;
    }

    const isValid = answer !== "false";
    logFlow("validation", "LLM validation completed", {
      extractedValue: extractedValue.slice(0, 120),
      originalUserText: originalUserText.slice(0, 120),
      llmAnswer: answer.slice(0, 80),
      isClearAnswer,
      isValid,
      attempt,
      elapsedMs,
    });
    return isValid;
  }

  logFlow("validation", "LLM validation failed after all retries, defaulting to valid", {
    extractedValue: extractedValue.slice(0, 120),
    totalAttempts: LLM_MAX_RETRIES,
  });
  return true;
}

export async function analyzeQuestionResponse(
  question: ChatRepository.QuestionRecord,
  text: string,
  phone: string,
  extractionContext: Record<string, string>
): Promise<QuestionResponseAnalysis> {
  const trimmedText = text.trim();
  const extractionKey = question.extraction_key?.trim();
  let rejectedByStep: "llm_validation" | "sql_verification" | null = null;

  const pipelineSteps = [
    question.llm_prompt_extraction_data ? "llm_extraction" : null,
    question.llm_prompt_validation_data ? "llm_validation" : null,
    question.sql_verification_of_data ? "sql_verification" : null,
  ].filter(Boolean);

  logFlow("analysis", "=== PIPELINE START === question response analysis", {
    phone,
    questionId: question.id,
    extractionKey: extractionKey ?? null,
    userText: trimmedText,
    pipelineSteps,
    extractionContextKeys: Object.keys(extractionContext),
    extractionContext,
  });

  let extractedValue: string = trimmedText;
  if (question.llm_prompt_extraction_data) {
    const llmExtracted = await extractWithLlm(
      question.llm_prompt_extraction_data,
      trimmedText,
      extractionKey ?? null
    );
    if (llmExtracted) {
      extractedValue = llmExtracted;
    }

    logFlow("analysis", "[STEP 1/3] LLM extraction completed", {
      questionId: question.id,
      extractionKey: extractionKey ?? null,
      originalUserText: trimmedText,
      extractedValue,
      llmChanged: extractedValue !== trimmedText,
    });
  } else {
    logFlow("analysis", "[STEP 1/3] LLM extraction SKIPPED (no prompt configured)", {
      questionId: question.id,
    });
  }

  let isValid = true;
  if (question.llm_prompt_validation_data) {
    isValid = await validateWithLlm(question.llm_prompt_validation_data, extractedValue, trimmedText);
    if (!isValid) rejectedByStep = "llm_validation";
    logFlow("analysis", `[STEP 2/3] LLM validation completed => ${isValid ? "PASSED" : "REJECTED"}`, {
      questionId: question.id,
      isValid,
      extractedValue,
      originalUserText: trimmedText,
      rejectedByStep,
    });
  } else {
    logFlow("analysis", "[STEP 2/3] LLM validation SKIPPED (no prompt configured)", {
      questionId: question.id,
    });
  }

  if (isValid && question.sql_verification_of_data) {
    const cleanValue = extractedValue;

    let normalizedPhone = phone.replace(/\D/g, "");
    if (normalizedPhone.startsWith("55") && normalizedPhone.length >= 12) {
      normalizedPhone = normalizedPhone.slice(2);
    } else if (normalizedPhone.length > 11) {
      normalizedPhone = normalizedPhone.slice(-11);
    }

    const sqlParams: Record<string, string> = {
      ...extractionContext,
      phone: normalizedPhone,
    };
    if (extractionKey) {
      sqlParams[extractionKey] = cleanValue;
    }
    sqlParams["value"] = cleanValue;

    logFlow("analysis", "[STEP 3/3] SQL verification starting (exact match)", {
      questionId: question.id,
      extractionKey: extractionKey ?? null,
      valueBeingVerified: cleanValue,
      originalUserText: trimmedText,
      sqlParams,
      requiredPlaceholders: Sql.findPlaceholders(question.sql_verification_of_data),
      sqlQuery: question.sql_verification_of_data,
    });

    try {
      isValid = await Sql.runVerification(question.sql_verification_of_data, sqlParams);

      if (!isValid) {
        logFlow("analysis", "[STEP 3/3] exact match failed, trying LIKE fallback", {
          questionId: question.id,
          valueBeingVerified: cleanValue,
        });
        isValid = await Sql.runVerificationLike(question.sql_verification_of_data, sqlParams);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logFlow("analysis", "[STEP 3/3] SQL verification THREW, defaulting to valid", {
        questionId: question.id,
        error: errMsg,
        sqlPreview: question.sql_verification_of_data.slice(0, 120),
        params: Object.keys(sqlParams),
      });
      isValid = true;
    }

    if (!isValid) rejectedByStep = "sql_verification";
    logFlow("analysis", `[STEP 3/3] SQL verification completed => ${isValid ? "PASSED" : "REJECTED"}`, {
      questionId: question.id,
      isValid,
      valueChecked: cleanValue,
      rejectedByStep,
    });
  } else if (!isValid) {
    logFlow("analysis", "[STEP 3/3] SQL verification SKIPPED (previous step already rejected)", {
      questionId: question.id,
      rejectedByStep,
    });
  } else {
    logFlow("analysis", "[STEP 3/3] SQL verification SKIPPED (no SQL configured)", {
      questionId: question.id,
    });
  }

  let extractedData: Record<string, string> | null = null;
  if (extractionKey && extractedValue) {
    extractedData = { [extractionKey]: extractedValue };
  }

  logFlow("analysis", `=== PIPELINE END === result: ${isValid ? "VALID" : "INVALID"}`, {
    phone,
    questionId: question.id,
    isValid,
    rejectedByStep,
    extractedData,
    extractionKey: extractionKey ?? null,
    originalUserText: trimmedText,
    finalExtractedValue: extractedValue,
  });

  return { isValid, extractedData, rejectedByStep, extractedValue };
}

export function buildRetryMessage(
  question: ChatRepository.QuestionRecord,
  analysis: QuestionResponseAnalysis,
  userText: string
): string {
  const extractionKey = question.extraction_key?.trim();
  const displayValue = analysis.extractedValue ?? userText.trim();
  const originalQuestion = question.content?.trim();

  let explanation: string;

  if (analysis.rejectedByStep === "llm_validation") {
    explanation = `Sorry, I couldn't understand your response "${userText.trim()}". Please try again.`;
  } else if (analysis.rejectedByStep === "sql_verification") {
    const fieldLabel = extractionKey ?? "value";
    explanation = `We couldn't find "${displayValue}" for field "${fieldLabel}" in our system. Please check and try again.`;
  } else {
    explanation = question.invalid_answer_message ?? "Invalid response.";
  }

  const fullMessage = originalQuestion
    ? `${explanation}\n\n${originalQuestion}`
    : explanation;

  logFlow("analysis", "built step-specific retry message", {
    questionId: question.id,
    rejectedByStep: analysis.rejectedByStep,
    extractionKey: extractionKey ?? null,
    displayValue: displayValue.slice(0, 80),
    explanation: explanation.slice(0, 120),
    originalQuestion: originalQuestion?.slice(0, 80) ?? null,
  });

  return fullMessage;
}
