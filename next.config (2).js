/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['yahoo-finance2'],
    outputFileTracingExcludes: {
      '*': ['node_modules/yahoo-finance2/esm/tests/**'],
    },
  },
  webpack: (config, { isServer }) => {
    // yahoo-finance2 ships an internal tests/ directory containing
    // Deno-runtime fixtures (fetchCache.js and friends) that reference
    // dependencies which only exist in Deno, never in a Node/Vercel
    // environment: @gadicc/fetch-mock-cache, @std/testing, etc. These
    // files are never imported or executed at runtime — they're test
    // fixtures bundled by mistake into the published npm package.
    //
    // Piecemeal aliasing of each individual missing module (the
    // previous approach) is fragile: every time yahoo-finance2's test
    // fixtures reference a new Deno-only dependency, the build breaks
    // again with a new "module not found" error. Instead, tell webpack
    // to never even attempt to parse anything inside that tests/
    // directory in the first place.
    //
    // Implemented as an inline loader function (no new dependency —
    // avoids adding a package + npm install risk under time pressure)
    // that returns an empty module body for any file under
    // yahoo-finance2/esm/tests/, so webpack never walks its imports.
    config.module.rules.push({
      test: /node_modules[\\/]yahoo-finance2[\\/]esm[\\/]tests[\\/]/,
      use: [{ loader: require.resolve('./empty-loader.js') }],
    })

    // Belt-and-braces: also alias the two specific modules we've seen
    // fail so far, in case the rule above doesn't catch every resolve
    // path (e.g. if webpack resolves before applying module rules in
    // some edge case).
    config.resolve.alias = {
      ...config.resolve.alias,
      '@gadicc/fetch-mock-cache/runtimes/deno.ts': false,
      '@gadicc/fetch-mock-cache/stores/fs.ts': false,
      '@std/testing/mock': false,
      '@std/testing/bdd': false,
    }

    if (isServer) {
      config.externals = [...(config.externals || []), 'yahoo-finance2']
    }
    return config
  },
}

module.exports = nextConfig
