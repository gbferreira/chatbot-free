import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("actions", (table) => {
    table.increments("id").primary();
    table
      .integer("question_id")
      .references("id")
      .inTable("questions")
      .onDelete("SET NULL");
    table.string("type");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("actions");
}
