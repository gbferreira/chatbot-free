import { questionsResponseValidationPostrunners } from "./questions_response_validation_postrunners";
import type { QuestionResponseValidationPostrunner } from "./types";

export function getQuestionResponseValidationPostrunner(
  role: string | null | undefined
): QuestionResponseValidationPostrunner | null {
  if (!role) return null;
  return questionsResponseValidationPostrunners[role] ?? null;
}

export type { QuestionResponseValidationContext, QuestionResponseValidationPostrunner } from "./types";
