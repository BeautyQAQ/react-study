const { defineConfig } = require('@playwright/test')
const path = require('node:path')

const artifacts = process.env.E2E_ARTIFACTS || path.join(__dirname, '.artifacts', 'manual')

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(artifacts, 'screenshots'),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(artifacts, 'results.json') }],
    ['html', { outputFolder: path.join(artifacts, 'report'), open: 'never' }]
  ],
  use: {
    browserName: 'chromium',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    // Traces and video can contain login bodies and mailbox verification codes.
    trace: 'off',
    video: 'off',
    launchOptions: process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 } }
  ]
})
