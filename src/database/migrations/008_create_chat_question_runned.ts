import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("chat_question_runned", (table) => {
    table.increments("id").primary();
    table
      .integer("chat_runned_id")
      .references("id")
      .inTable("chat_runned")
      .onDelete("CASCADE");
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
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("chat_question_runned");
}
