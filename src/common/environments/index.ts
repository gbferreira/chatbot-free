const env = process.env.NODE_ENV || "development";
// Dynamic import for env-specific config
// eslint-disable-next-line @typescript-eslint/no-require-imports
const envConfig = require(`./${env}`);
export default envConfig.default ?? envConfig;
