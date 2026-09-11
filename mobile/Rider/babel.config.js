/**
 * Expo's Babel preset. Metro needs this to transform JSX and the Expo module
 * system; without it the entrypoint fails to resolve @babel/runtime helpers.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
