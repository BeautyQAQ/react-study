#!/usr/bin/env node
'use strict'

// An isolated, in-memory test inbox. It never relays mail or logs its contents.
const http = require('node:http')
const net = require('node:net')
const { randomUUID } = require('node:crypto')

const MAX_MESSAGES = 200
const MAX_MESSAGE_BYTES = 512 * 1024
const MAX_COMMAND_BYTES = 8192
const MAX_RECIPIENTS = 100
const CRLF = Buffer.from('\r\n')

function port(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`${name} must be an integer between 0 and 65535`)
  }
  return value
}

function address(argument, prefix, allowEmpty) {
  const match = argument.match(new RegExp(`^${prefix}:\\s*<([^<>\\r\\n]*)>(?:\\s+(.*))?$`, 'i'))
  if (!match) return null
  const email = match[1].trim().toLowerCase()
  if ((!email && !allowEmpty) || (email && (!email.includes('@') || /\s/.test(email)))) return null
  return { email, parameters: match[2] || '' }
}

async function startFixture({ smtpPort = port('SMTP_PORT', 2525), httpPort = port('HTTP_PORT', 8025) } = {}) {
  const messages = []
  const sockets = new Set()
  let closing = false

  const smtpServer = net.createServer(socket => {
    sockets.add(socket)
    socket.setTimeout(30_000)
    socket.on('timeout', () => socket.end('421 Connection timed out\r\n'))
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))
    let pending = Buffer.alloc(0)
    let greeted = false
    let ended = false
    let sender = null
    let recipients = []
    let dataMode = false
    let chunks = []
    let bytes = 0
    let oversized = false
    let discardingLine = false

    function reply(value) {
      if (!socket.destroyed && !socket.writableEnded) socket.write(value + '\r\n')
    }

    function reset() {
      sender = null
      recipients = []
      dataMode = false
      chunks = []
      bytes = 0
      oversized = false
      discardingLine = false
    }

    function rejectSize() {
      oversized = true
      chunks = []
    }

    function command(line) {
      const match = line.toString('utf8').match(/^([A-Za-z]+)(?:[ \t]+(.*))?$/)
      if (!match) return reply('500 Invalid command')
      const verb = match[1].toUpperCase()
      const argument = (match[2] || '').trim()
      if (verb === 'QUIT') {
        ended = true
        socket.end('221 Bye\r\n')
      } else if (verb === 'EHLO' || verb === 'HELO') {
        if (!argument) return reply('501 A greeting name is required')
        reset()
        greeted = true
        reply(verb === 'EHLO'
          ? `250-liushao-e2e-smtp\r\n250-SIZE ${MAX_MESSAGE_BYTES}\r\n250 8BITMIME`
          : '250 liushao-e2e-smtp')
      } else if (verb === 'NOOP') {
        reply('250 OK')
      } else if (verb === 'RSET') {
        reset()
        reply('250 OK')
      } else if (!greeted) {
        reply('503 Send EHLO or HELO first')
      } else if (verb === 'MAIL') {
        const parsed = address(argument, 'FROM', true)
        if (!parsed) return reply('501 Expected MAIL FROM:<address>')
        reset()
        const declaredSize = parsed.parameters.match(/(?:^|\s)SIZE=(\d+)(?:\s|$)/i)
        if (declaredSize && Number(declaredSize[1]) > MAX_MESSAGE_BYTES) {
          return reply('552 Message exceeds 512 KiB')
        }
        sender = parsed.email
        reply('250 Sender accepted')
      } else if (verb === 'RCPT') {
        if (sender === null) return reply('503 Send MAIL FROM first')
        const parsed = address(argument, 'TO', false)
        if (!parsed) return reply('501 Expected RCPT TO:<address>')
        if (!recipients.includes(parsed.email)) {
          if (recipients.length >= MAX_RECIPIENTS) return reply('452 Too many recipients')
          recipients.push(parsed.email)
        }
        reply('250 Recipient accepted')
      } else if (verb === 'DATA') {
        if (argument) return reply('501 DATA does not take arguments')
        if (sender === null || !recipients.length) return reply('503 Send MAIL FROM and RCPT TO first')
        if (messages.length >= MAX_MESSAGES) return reply('452 Test inbox is full')
        dataMode = true
        reply('354 End data with <CRLF>.<CRLF>')
      } else {
        reply('502 Command not implemented')
      }
    }

    socket.on('data', chunk => {
      if (ended) return
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
      while (!ended) {
        const newline = pending.indexOf(CRLF)
        if (discardingLine) {
          if (newline < 0) {
            // Keep a possible split CRLF without retaining an overlong line.
            pending = pending.at(-1) === 13 ? Buffer.from('\r') : Buffer.alloc(0)
            break
          }
          pending = pending.subarray(newline + 2)
          discardingLine = false
          continue
        }
        if (newline < 0) {
          if (!dataMode && pending.length > MAX_COMMAND_BYTES) {
            ended = true
            socket.end('500 Command line too long\r\n')
          } else if (dataMode && pending.length > MAX_MESSAGE_BYTES + 2) {
            rejectSize()
            discardingLine = true
            pending = pending.at(-1) === 13 ? Buffer.from('\r') : Buffer.alloc(0)
          }
          break
        }
        let line = pending.subarray(0, newline)
        pending = pending.subarray(newline + 2)
        if (!dataMode) {
          if (line.length > MAX_COMMAND_BYTES) {
            ended = true
            socket.end('500 Command line too long\r\n')
          } else {
            command(line)
          }
          continue
        }
        if (line.length === 1 && line[0] === 46) {
          if (oversized) {
            reply('552 Message exceeds 512 KiB')
          } else if (messages.length >= MAX_MESSAGES) {
            reply('452 Test inbox is full')
          } else {
            messages.push({ id: randomUUID(), to: [...recipients], raw: Buffer.concat(chunks, bytes).toString('utf8') })
            reply('250 Message accepted')
          }
          reset()
        } else if (!oversized) {
          if (line[0] === 46) line = line.subarray(1)
          bytes += line.length + 2
          if (bytes > MAX_MESSAGE_BYTES) rejectSize()
          else chunks.push(Buffer.from(line), CRLF)
        }
      }
    })
    reply('220 liushao-e2e-smtp ready')
  })
  smtpServer.maxConnections = 32

  const httpServer = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    let url
    try {
      url = new URL(request.url, 'http://localhost')
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      return response.end('Invalid request URL\n')
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Method not allowed\n')
    } else if (url.pathname === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('ok\n')
    } else if (url.pathname === '/messages') {
      const recipient = (url.searchParams.get('recipient') || '').trim().toLowerCase()
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(recipient ? messages.filter(message => message.to.includes(recipient)) : messages))
    } else {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found\n')
    }
  })
  httpServer.requestTimeout = 15_000
  httpServer.headersTimeout = 10_000
  httpServer.timeout = 30_000
  httpServer.maxConnections = 32

  async function close() {
    if (closing) return
    closing = true
    for (const socket of sockets) socket.destroy()
    httpServer.closeAllConnections()
    await Promise.all([smtpServer, httpServer].map(server => new Promise(resolve => {
      if (!server.listening) return resolve()
      server.close(resolve)
    })))
  }

  try {
    for (const [server, listenPort] of [[smtpServer, smtpPort], [httpServer, httpPort]]) {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(listenPort, '0.0.0.0', () => {
          server.removeListener('error', reject)
          resolve()
        })
      })
    }
  } catch (error) {
    await close()
    throw error
  }
  return { smtpServer, httpServer, close }
}

if (require.main === module) {
  startFixture().then(fixture => {
    console.log(`SMTP test inbox ready: smtp=${fixture.smtpServer.address().port} http=${fixture.httpServer.address().port}`)
    const stop = () => { fixture.close().catch(() => { process.exitCode = 1 }) }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    for (const server of [fixture.smtpServer, fixture.httpServer]) {
      server.on('error', error => {
        console.error(`SMTP test inbox server error: ${error.code || 'unknown'}`)
        process.exitCode = 1
        stop()
      })
    }
  }).catch(error => {
    console.error(`SMTP test inbox startup failed: ${error.code || error.message}`)
    process.exitCode = 1
  })
}

module.exports = { startFixture }
