import type { QuestionRecord } from "../../Chat/repository";

export interface QuestionResponseValidationContext {
  question: QuestionRecord;
  text: string;
  phone: string;
}

export type QuestionResponseValidationPostrunner = (
  context: QuestionResponseValidationContext
) => Promise<boolean>;
