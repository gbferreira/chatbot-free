import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasValidationPattern = await knex.schema.hasColumn("questions", "validation_pattern");
  const hasPostrunnerCode = await knex.schema.hasColumn("questions", "response_validation_postrunner_code");
  const hasLlmExtraction = await knex.schema.hasColumn("questions", "llm_prompt_extraction_data");
  const hasLlmValidation = await knex.schema.hasColumn("questions", "llm_prompt_validation_data");
  const hasSqlVerification = await knex.schema.hasColumn("questions", "sql_verification_of_data");
  const hasExpectedResult = await knex.schema.hasColumn("actions", "expected_result");

  await knex.schema.alterTable("questions", (table) => {
    if (!hasLlmExtraction) table.text("llm_prompt_extraction_data");
    if (!hasLlmValidation) table.text("llm_prompt_validation_data");
    if (!hasSqlVerification) table.text("sql_verification_of_data");
    if (hasValidationPattern) table.dropColumn("validation_pattern");
    if (hasPostrunnerCode) table.dropColumn("response_validation_postrunner_code");
  });

  if (!hasExpectedResult) {
    await knex.schema.alterTable("actions", (table) => {
      table.jsonb("expected_result");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLlmExtraction = await knex.schema.hasColumn("questions", "llm_prompt_extraction_data");
  const hasLlmValidation = await knex.schema.hasColumn("questions", "llm_prompt_validation_data");
  const hasSqlVerification = await knex.schema.hasColumn("questions", "sql_verification_of_data");
  const hasValidationPattern = await knex.schema.hasColumn("questions", "validation_pattern");
  const hasPostrunnerCode = await knex.schema.hasColumn("questions", "response_validation_postrunner_code");
  const hasExpectedResult = await knex.schema.hasColumn("actions", "expected_result");

  await knex.schema.alterTable("questions", (table) => {
    if (hasLlmExtraction) table.dropColumn("llm_prompt_extraction_data");
    if (hasLlmValidation) table.dropColumn("llm_prompt_validation_data");
    if (hasSqlVerification) table.dropColumn("sql_verification_of_data");
    if (!hasValidationPattern) table.text("validation_pattern");
    if (!hasPostrunnerCode) table.string("response_validation_postrunner_code");
  });

  if (hasExpectedResult) {
    await knex.schema.alterTable("actions", (table) => {
      table.dropColumn("expected_result");
    });
  }
}
