/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://trend-gadgets-api.netlify.app/api/:path*",
      },
    ];
  },
};

export default nextConfig;
