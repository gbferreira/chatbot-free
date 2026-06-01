import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasExtractionKey = await knex.schema.hasColumn("questions", "extraction_key");
  const hasValidationPattern = await knex.schema.hasColumn("questions", "validation_pattern");
  const hasResponseValidationPostrunnerCode = await knex.schema.hasColumn(
    "questions",
    "response_validation_postrunner_code"
  );
  const hasInvalidAnswerMessage = await knex.schema.hasColumn("questions", "invalid_answer_message");
  const hasNextQuestionId = await knex.schema.hasColumn("questions", "next_question_id");

  await knex.schema.alterTable("questions", (table) => {
    if (!hasExtractionKey) table.string("extraction_key");
    if (!hasValidationPattern) table.text("validation_pattern");
    if (!hasResponseValidationPostrunnerCode) table.string("response_validation_postrunner_code");
    if (!hasInvalidAnswerMessage) table.text("invalid_answer_message");
    if (!hasNextQuestionId) {
      table
        .integer("next_question_id")
        .nullable()
        .references("id")
        .inTable("questions")
        .onDelete("SET NULL");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasNextQuestionId = await knex.schema.hasColumn("questions", "next_question_id");
  const hasInvalidAnswerMessage = await knex.schema.hasColumn("questions", "invalid_answer_message");
  const hasResponseValidationPostrunnerCode = await knex.schema.hasColumn(
    "questions",
    "response_validation_postrunner_code"
  );
  const hasValidationPattern = await knex.schema.hasColumn("questions", "validation_pattern");
  const hasExtractionKey = await knex.schema.hasColumn("questions", "extraction_key");

  await knex.schema.alterTable("questions", (table) => {
    if (hasNextQuestionId) table.dropColumn("next_question_id");
    if (hasInvalidAnswerMessage) table.dropColumn("invalid_answer_message");
    if (hasResponseValidationPostrunnerCode) table.dropColumn("response_validation_postrunner_code");
    if (hasValidationPattern) table.dropColumn("validation_pattern");
    if (hasExtractionKey) table.dropColumn("extraction_key");
  });
}
