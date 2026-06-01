import db from "../../database/configuration";

export async function create(
  chatQuestionRunnedId: number,
  questionId: number,
  content: string
): Promise<number> {
  const [row] = await db("question_responses")
    .insert({ chat_question_runned_id: chatQuestionRunnedId, question_id: questionId, content })
    .returning("id");
  return row.id;
}
