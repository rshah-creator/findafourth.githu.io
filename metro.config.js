const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Force @supabase/supabase-js to resolve to its CommonJS build.
// Its ESM build (dist/index.mjs) ships a dynamic `import(OTEL_PKG)` for optional
// OpenTelemetry support. Hermes cannot parse that expression and release iOS
// builds fail with "Invalid expression encountered". The CJS build (dist/index.cjs)
// uses require() instead and compiles cleanly. Scoped to this one package so all
// other package-exports resolution is left untouched.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@supabase/supabase-js') {
    return {
      type: 'sourceFile',
      filePath: require.resolve('@supabase/supabase-js/dist/index.cjs'),
    };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
