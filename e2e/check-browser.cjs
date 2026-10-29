#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

async function main() {
  if (!process.env.E2E_ARTIFACTS) throw new Error('Set E2E_ARTIFACTS to the private directory for this test run')
  const { chromium } = require('@playwright/test')
  const playwright = require('@playwright/test/package.json').version
  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {})
    })
    const runtime = {
      node: process.version,
      playwright,
      chromium: browser.version(),
      browserSource: process.env.CHROMIUM_EXECUTABLE ? 'CHROMIUM_EXECUTABLE' : 'Playwright managed'
    }
    const directory = path.resolve(process.env.E2E_ARTIFACTS)
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const descriptor = fs.openSync(path.join(directory, 'runtime.json'), 'w', 0o600)
    try {
      fs.fchmodSync(descriptor, 0o600)
      fs.writeFileSync(descriptor, JSON.stringify(runtime, null, 2) + '\n')
    } finally {
      fs.closeSync(descriptor)
    }
    console.log(`Browser preflight passed: Node ${runtime.node}, Playwright ${runtime.playwright}, Chromium ${runtime.chromium} (${runtime.browserSource})`)
  } finally {
    if (browser) await browser.close()
  }
}

main().catch(error => {
  console.error(`Browser preflight failed: ${error.message}`)
  process.exitCode = 1
})
