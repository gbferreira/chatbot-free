import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("questions_response_postrunners");
  if (!hasTable) {
    await knex.schema.createTable("questions_response_postrunners", (table) => {
      table.increments("id").primary();
      table.string("code").notNullable().unique();
      table.string("label_pt").notNullable();
      table.string("label_en").notNullable();
      table.timestamps(true, true);
    });
  }

  const hasCodeColumn = await knex.schema.hasColumn("questions", "response_validation_postrunner_code");
  if (!hasCodeColumn) {
    await knex.schema.alterTable("questions", (table) => {
      table.string("response_validation_postrunner_code");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCodeColumn = await knex.schema.hasColumn("questions", "response_validation_postrunner_code");
  if (hasCodeColumn) {
    await knex.schema.alterTable("questions", (table) => {
      table.dropColumn("response_validation_postrunner_code");
    });
  }

  await knex.schema.dropTableIfExists("questions_response_postrunners");
}
