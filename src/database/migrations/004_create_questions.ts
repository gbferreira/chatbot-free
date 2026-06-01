import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("questions", (table) => {
    table.increments("id").primary();
    table.text("content");
    table.string("extraction_key");
    table.text("validation_pattern");
    table.string("response_validation_postrunner_code");
    table.text("invalid_answer_message");
    table
      .integer("next_question_id")
      .nullable()
      .references("id")
      .inTable("questions")
      .onDelete("SET NULL");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("questions");
}
