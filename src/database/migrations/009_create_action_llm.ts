import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("action_llm", (table) => {
    table.increments("id").primary();
    table
      .integer("action_id")
      .references("id")
      .inTable("actions")
      .onDelete("CASCADE");
    table.string("model");
    table.jsonb("config");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("action_llm");
}
