import path from "path";

interface DbConfig {
  host?: string;
  port: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}

interface EnvConfig {
  database: DbConfig;
}

function buildConnection(env: string) {
  const config: EnvConfig = require(path.join(
    __dirname,
    "../common/environments",
    env
  )).default;
  const db = config.database;
  return {
    client: "pg",
    connection: {
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      ssl: db.ssl ? { rejectUnauthorized: false } : false,
    },
    migrations: {
      directory: path.join(__dirname, "migrations"),
      tableName: "knex_migrations",
      loadExtensions: [".ts"],
      extension: "ts",
    },
    seeds: {
      directory: path.join(__dirname, "seeds"),
      loadExtensions: [".ts"],
      extension: "ts",
    },
  };
}

export default {
  development: buildConnection("development"),
  staging: buildConnection("staging"),
  production: buildConnection("production"),
};
