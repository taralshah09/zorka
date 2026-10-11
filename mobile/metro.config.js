// Metro config: Expo defaults + the repo-root `shared/` folder (D24), imported as `@shared/*`.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../shared")];

module.exports = config;
