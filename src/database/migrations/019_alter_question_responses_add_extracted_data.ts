import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasExtractedData = await knex.schema.hasColumn("question_responses", "extracted_data");
  if (!hasExtractedData) {
    await knex.schema.alterTable("question_responses", (table) => {
      table.jsonb("extracted_data");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasExtractedData = await knex.schema.hasColumn("question_responses", "extracted_data");
  if (hasExtractedData) {
    await knex.schema.alterTable("question_responses", (table) => {
      table.dropColumn("extracted_data");
    });
  }
}
