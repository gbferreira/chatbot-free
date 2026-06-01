import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("users_institutions", (table) => {
    table.increments("id").primary();
    table.integer("user_id").references("id").inTable("users").onDelete("CASCADE");
    table
      .integer("institution_id")
      .references("id")
      .inTable("institutions")
      .onDelete("CASCADE");
    table.string("role");
    table.timestamps(true, true);
    table.unique(["user_id", "institution_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("users_institutions");
}
