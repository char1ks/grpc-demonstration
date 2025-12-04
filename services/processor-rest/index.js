import express from 'express'
import prom from 'prom-client'
import http from 'http'

const app = express()
app.use(express.json())

prom.collectDefaultMetrics()
const sendBytes = new prom.Counter({ name: 'app_send_bytes_total', help: 'total sent bytes', labelNames: ['protocol', 'service'] })
const recvBytes = new prom.Counter({ name: 'app_recv_bytes_total', help: 'total received bytes', labelNames: ['protocol', 'service'] })
const connections = new prom.Counter({ name: 'http_connections_total', help: 'total tcp connections', labelNames: ['service'] })

const serviceLabel = { service: 'processor-rest' }

app.use((req, res, next) => { res.set('Connection', 'close'); next() })
app.post('/process', (req, res) => {
  const bodyStr = JSON.stringify(req.body || {})
  const inLen = Buffer.byteLength(bodyStr)
  recvBytes.inc({ protocol: 'rest', ...serviceLabel }, inLen)
  const value = Number(req.body?.value || 0)
  const processed = value * value
  const response = { processed }
  const respStr = JSON.stringify(response)
  const outLen = Buffer.byteLength(respStr)
  sendBytes.inc({ protocol: 'rest', ...serviceLabel }, outLen)
  res.json(response)
})

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prom.register.contentType)
  res.end(await prom.register.metrics())
})

const port = process.env.PORT || 3000
const server = http.createServer(app)
server.on('connection', () => { connections.inc({ service: 'processor-rest' }) })
server.keepAliveTimeout = 0
server.headersTimeout = 0
server.listen(port)
