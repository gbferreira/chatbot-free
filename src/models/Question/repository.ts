import db from "../../database/configuration";

export async function findById(id: number): Promise<{ id: number; content: string | null } | null> {
  return db("questions").where("id", id).select("id", "content").first();
}
