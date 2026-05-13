import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* يسمح لأجهزة الشبكة المحلية (مثل التابلت على 192.168.x.x) بطلب dev server */
  allowedDevOrigins: ["192.168.8.67"],
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
};

export default nextConfig;
