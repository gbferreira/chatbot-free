import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("action_suggestions", (table) => {
    table.increments("id").primary();
    table
      .integer("action_id")
      .references("id")
      .inTable("actions")
      .onDelete("CASCADE");
    table.text("content");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("action_suggestions");
}
