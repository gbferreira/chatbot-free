import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("question_responses", (table) => {
    table.increments("id").primary();
    table
      .integer("question_id")
      .references("id")
      .inTable("questions")
      .onDelete("CASCADE");
    table.text("content");
    table.jsonb("extracted_data");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("question_responses");
}
