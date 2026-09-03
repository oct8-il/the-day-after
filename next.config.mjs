/** @type {import('next').NextConfig} */
export default {
  output: 'export',          // static site; no server at launch
  trailingSlash: true,       // /item/i13/ → item/i13/index.html on any static host
  images: { unoptimized: true },
  reactStrictMode: true,
};
