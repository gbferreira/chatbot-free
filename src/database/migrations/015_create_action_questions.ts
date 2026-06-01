import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("action_questions", (table) => {
    table.increments("id").primary();
    table
      .integer("action_id")
      .references("id")
      .inTable("actions")
      .onDelete("CASCADE");
    table
      .integer("question_id")
      .references("id")
      .inTable("questions")
      .onDelete("CASCADE");
    table.integer("sort_order").defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("action_questions");
}
