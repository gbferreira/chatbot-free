import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasSentContent = await knex.schema.hasColumn("chat_question_runned", "question_content");
  if (!hasSentContent) {
    await knex.schema.alterTable("chat_question_runned", (table) => {
      table.text("question_content");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSentContent = await knex.schema.hasColumn("chat_question_runned", "question_content");
  if (hasSentContent) {
    await knex.schema.alterTable("chat_question_runned", (table) => {
      table.dropColumn("question_content");
    });
  }
}
