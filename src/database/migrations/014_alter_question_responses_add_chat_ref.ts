import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("question_responses", (table) => {
    table
      .integer("chat_question_runned_id")
      .references("id")
      .inTable("chat_question_runned")
      .onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("question_responses", (table) => {
    table.dropColumn("chat_question_runned_id");
  });
}
