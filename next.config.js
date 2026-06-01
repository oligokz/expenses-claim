/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Serve /index.html at the root / path
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/index.html',
      },
    ]
  },
}

module.exports = nextConfig
