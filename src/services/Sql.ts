import db from "../database/configuration";
import { logFlow } from "./Logs";

const PLACEHOLDER_REGEX = /:([a-zA-Z_]\w*)/g;

export function findPlaceholders(sql: string): string[] {
  const matches = sql.match(PLACEHOLDER_REGEX);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

function bindParams(
  sql: string,
  params: Record<string, string>
): { bound: string; orderedParams: string[] } {
  const orderedParams: string[] = [];
  const tokens = sql.split(/(:[a-zA-Z_]\w*)/g);
  let bound = "";
  for (const token of tokens) {
    if (token.startsWith(":") && token.length > 1) {
      const name = token.slice(1);
      bound += "?";
      orderedParams.push(params[name]);
    } else {
      bound += token;
    }
  }
  return { bound, orderedParams };
}

async function executeAndCheck(
  bound: string,
  orderedParams: string[]
): Promise<{ isValid: boolean; rowCount: number }> {
  const result = await db.raw(bound, orderedParams);
  const rows = result.rows ?? result;
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  return { isValid: rowCount > 0, rowCount };
}

export async function runVerification(
  sql: string,
  params: Record<string, string>
): Promise<boolean> {
  const required = findPlaceholders(sql);
  const missing = required.filter((name) => !(name in params));

  if (missing.length > 0) {
    logFlow("sql", "missing params for SQL verification, skipping", {
      missing,
      available: Object.keys(params),
    });
    return true;
  }

  const { bound, orderedParams } = bindParams(sql, params);

  logFlow("sql", "executing verification query", {
    placeholders: required,
    paramValues: Object.fromEntries(required.map((name) => [name, params[name]?.slice(0, 40)])),
    sql: sql.slice(0, 120),
    boundSql: bound.slice(0, 120),
  });

  const startMs = Date.now();
  const { isValid, rowCount } = await executeAndCheck(bound, orderedParams);
  const elapsedMs = Date.now() - startMs;

  logFlow("sql", "verification query completed", {
    isValid,
    rowCount,
    elapsedMs,
    sql: sql.slice(0, 80),
  });

  return isValid;
}

export async function runVerificationLike(
  sql: string,
  params: Record<string, string>
): Promise<boolean> {
  const required = findPlaceholders(sql);
  const missing = required.filter((name) => !(name in params));
  if (missing.length > 0) return true;

  const words = (params.value ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  const likePattern = `%${words.join("%")}%`;
  const likeParams = { ...params, value: likePattern };

  const likeSql = sql
    .replace(
      /LOWER\(REGEXP_REPLACE\([^)]+\)\)\s*=\s*LOWER\(:value\)/gi,
      "LOWER(name) LIKE LOWER(:value)"
    )
    .replace(
      /LOWER\((\w+(?:\.\w+)?)\)\s*=\s*LOWER\(:value\)/gi,
      "LOWER($1) LIKE LOWER(:value)"
    );

  const { bound, orderedParams } = bindParams(likeSql, likeParams);

  logFlow("sql", "executing LIKE fallback verification query", {
    originalSql: sql.slice(0, 120),
    likeSql: likeSql.slice(0, 120),
    likePattern,
    words,
    boundSql: bound.slice(0, 120),
  });

  const startMs = Date.now();
  const { isValid, rowCount } = await executeAndCheck(bound, orderedParams);
  const elapsedMs = Date.now() - startMs;

  logFlow("sql", "LIKE fallback verification completed", {
    isValid,
    rowCount,
    elapsedMs,
    likePattern,
  });

  return isValid;
}
