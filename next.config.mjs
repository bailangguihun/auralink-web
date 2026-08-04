/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: false,
    workerThreads: false,
    webpackBuildWorker: false,
    webpackMemoryOptimizations: true,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
  },
  eslint: {
    // 允许在生产构建中无视ESLint错误
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.auralinks.top',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '',
        pathname: '/**',
      },
    ],
    domains: ['api.auralinks.top', 'localhost'],
  },
  async headers() {
    return [
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
