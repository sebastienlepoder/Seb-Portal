/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['argon2', 'ssh2'],
    // The custom server (server.js at repo root) requires ssh2 and ws at
    // runtime, but Next's trace only follows imports it sees in the app
    // graph. Force them — plus their optional native bits — into the
    // standalone bundle so node_modules is complete.
    outputFileTracingIncludes: {
      '/*': [
        './node_modules/ssh2/**/*',
        './node_modules/ws/**/*',
        './node_modules/cpu-features/**/*',
        './node_modules/sshpk/**/*',
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.openai.com https://api.anthropic.com https://*.nabu.casa https://api.open-meteo.com https://geocoding-api.open-meteo.com https://openweathermap.org https://api.openweathermap.org wss: ws:",
              "frame-src 'self' https://chat.openai.com https://chatgpt.com https://claude.ai https://*.nabu.casa *",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
