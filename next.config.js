/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['yahoo-finance2'],
    outputFileTracingExcludes: {
      '*': ['node_modules/yahoo-finance2/esm/tests/**'],
    },
  },
  webpack: (config, { isServer }) => {
    // yahoo-finance2 ships Deno-runtime test/cache files that don't
    // exist in a Node/Vercel environment. Webpack tries to resolve
    // them anyway during the build and fails. These files are never
    // actually executed at runtime (they're test fixtures), so it's
    // safe to tell webpack to ignore them outright rather than try
    // to resolve them.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@gadicc/fetch-mock-cache/runtimes/deno.ts': false,
      '@gadicc/fetch-mock-cache/stores/fs.ts': false,
    }
    if (isServer) {
      config.externals = [...(config.externals || []), 'yahoo-finance2']
    }
    return config
  },
}

module.exports = nextConfig
