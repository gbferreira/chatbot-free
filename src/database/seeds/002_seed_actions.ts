import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  await knex("action_questions").del();
  const hasResultSuggestions = await knex.schema.hasTable("action_result_suggestions");
  if (hasResultSuggestions) await knex("action_result_suggestions").del();
  await knex("action_llm_runned").del();
  await knex("chat_question_runned").del();
  await knex("action_llm").del();
  await knex("actions").del();
  await knex("question_responses").del();
  await knex("questions").del();

  const actionRows = [
    { type: "code", name: "end", question_id: null },
    { type: "llm", name: "greet", question_id: null },
  ];

  const [end, greet] = await knex("actions").insert(actionRows).returning("id");

  await knex("action_llm").insert([
    { action_id: greet.id, model: "gemini", config: { temperature: 0.7 } },
  ]);
}
