const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/**
 * Metro configuration for the pnpm workspace.
 *
 * pnpm does not hoist: each package's dependencies live behind symlinks in
 * .pnpm, and Metro's default resolver only walks node_modules upward from the
 * project. The workspace root has to be watched explicitly or the shared
 * packages (@pathcare/api, @pathcare/design-tokens) resolve to nothing.
 */
const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Symlinked workspace packages must be followed to their real location.
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;


module.exports = config;
