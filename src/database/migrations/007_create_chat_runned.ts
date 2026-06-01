import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("chat_runned", (table) => {
    table.increments("id").primary();
    table.integer("user_id").references("id").inTable("users").onDelete("CASCADE");
    table
      .integer("institution_id")
      .references("id")
      .inTable("institutions")
      .onDelete("SET NULL");
    table.timestamp("started_at").defaultTo(knex.fn.now());
    table.timestamp("ended_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("chat_runned");
}
