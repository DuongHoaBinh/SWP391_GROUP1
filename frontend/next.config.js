/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/escort',
        destination: '/driver',
      },
      {
        source: '/escort/:path*',
        destination: '/driver/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
