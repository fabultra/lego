module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // three.js (>=0.160) utilise les « static class blocks » ; Metro doit les
    // transformer pour Hermes.
    plugins: ['@babel/plugin-transform-class-static-block'],
  };
};
