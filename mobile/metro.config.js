// Metro config: Expo defaults + the repo-root `shared/` folder (D24), imported as `@shared/*`.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const sharedDir = path.resolve(__dirname, "../shared");
config.watchFolders = [...(config.watchFolders ?? []), sharedDir];

// shared/ is also compiled by the backend as Node ESM, so its relative imports name the output file ("./week.js").
// Metro doesn't map that to the .ts source, so for imports from inside shared/ try the path without ".js" first.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (
    moduleName.startsWith(".") &&
    moduleName.endsWith(".js") &&
    path.resolve(context.originModulePath).startsWith(sharedDir + path.sep)
  ) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      // Not a TS source: fall through to the name as written.
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
