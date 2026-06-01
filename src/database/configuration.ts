import knex from "knex";
import knexConfig from "./knexfile";

const env = process.env.NODE_ENV || "development";
const config =
  knexConfig[env as keyof typeof knexConfig] ?? knexConfig.development;

export default knex(config);
