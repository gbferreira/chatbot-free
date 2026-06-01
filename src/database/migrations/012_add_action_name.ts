import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("actions", (table) => {
    table.string("name");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("actions", (table) => {
    table.dropColumn("name");
  });
}
