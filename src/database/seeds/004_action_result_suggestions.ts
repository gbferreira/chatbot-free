import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("action_result_suggestions");
  if (!hasTable) return;

  await knex("action_result_suggestions").del();

  const greet = await knex("actions").where("name", "greet").select("id").first();

  const rows: Array<{
    previous_action_id: string | null;
    next_action_name: string;
    result_previous_action: Record<string, unknown>;
  }> = [
    { previous_action_id: null, next_action_name: "greet", result_previous_action: {} },
  ];

  if (greet) {
    rows.push({
      previous_action_id: greet.id,
      next_action_name: "end",
      result_previous_action: { status: "completed" },
    });
  }

  await knex("action_result_suggestions").insert(rows);
}
