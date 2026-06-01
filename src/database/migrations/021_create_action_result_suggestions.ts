import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("action_result_suggestions", (table) => {
    table.increments("id").primary();
    table
      .uuid("previous_action_id")
      .nullable()
      .references("id")
      .inTable("actions")
      .onDelete("CASCADE");
    table.text("next_action_name").notNullable();
    table.jsonb("result_previous_action");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.dropTableIfExists("action_suggestions");
  await knex.schema.dropTableIfExists("action_llm_suggestions");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("action_result_suggestions");

  await knex.schema.createTable("action_suggestions", (table) => {
    table.increments("id").primary();
    table
      .uuid("action_id")
      .references("id")
      .inTable("actions")
      .onDelete("CASCADE");
    table.text("content");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("action_llm_suggestions", (table) => {
    table.increments("id").primary();
    table
      .uuid("action_llm_id")
      .references("id")
      .inTable("action_llm")
      .onDelete("CASCADE");
    table.text("content");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}
