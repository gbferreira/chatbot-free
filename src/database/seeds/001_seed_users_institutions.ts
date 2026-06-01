import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  await knex("chat_question_runned").del();
  await knex("chat_runned").del();
  await knex("users").del();
}
