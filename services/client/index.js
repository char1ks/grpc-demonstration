import express from 'express'
import axios from 'axios'
import clientProm from 'prom-client'
import grpc from '@grpc/grpc-js'
import protoLoader from '@grpc/proto-loader'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json())

clientProm.collectDefaultMetrics()
const sendBytes = new clientProm.Counter({ name: 'app_send_bytes_total', help: 'total sent bytes', labelNames: ['protocol', 'service'] })
const recvBytes = new clientProm.Counter({ name: 'app_recv_bytes_total', help: 'total received bytes', labelNames: ['protocol', 'service'] })
const duration = new clientProm.Histogram({ name: 'app_request_duration_seconds', help: 'request duration seconds', labelNames: ['protocol', 'service'], buckets: [0.05,0.1,0.2,0.5,1,2,5,10,30] })

const serviceLabel = { service: 'client' }

app.get('/trigger/rest', async (req, res) => {
  const count = parseInt(req.query.count || '1000', 10)
  const size = parseInt(req.query.size || '32', 10)
  const pad = 'x'.repeat(size)
  const start = process.hrtime.bigint()
  let totalSend = 0
  let totalRecv = 0
  for (let i = 0; i < count; i++) {
    const body = { value: Math.random(), pad }
    const bodyStr = JSON.stringify(body)
    totalSend += Buffer.byteLength(bodyStr)
    sendBytes.inc({ protocol: 'rest', ...serviceLabel }, Buffer.byteLength(bodyStr))
    const r = await axios.post('http://processor-rest:3000/process', body, { timeout: 30000 })
    const respStr = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
    const respLen = Buffer.byteLength(respStr)
    totalRecv += respLen
    recvBytes.inc({ protocol: 'rest', ...serviceLabel }, respLen)
  }
  const end = process.hrtime.bigint()
  const elapsed = Number(end - start) / 1e9
  duration.observe({ protocol: 'rest', ...serviceLabel }, elapsed)
  res.json({ protocol: 'rest', count, size, send_bytes: totalSend, recv_bytes: totalRecv, elapsed_seconds: elapsed })
})

const protoPath = path.join(__dirname, 'proto', 'processor.proto')
const packageDefinition = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true })
const proto = grpc.loadPackageDefinition(packageDefinition).processor

app.get('/trigger/grpc', async (req, res) => {
  const count = parseInt(req.query.count || '1000', 10)
  const size = parseInt(req.query.size || '32', 10)
  const pad = 'x'.repeat(size)
  const client = new proto.Processor('processor-grpc:50051', grpc.credentials.createInsecure())
  const start = process.hrtime.bigint()
  let totalSend = 0
  let totalRecv = 0
  const call = client.ProcessStream((err, summary) => {
    if (err) {
      res.status(500).json({ error: err.message })
      return
    }
    const respStr = JSON.stringify(summary)
    const respLen = Buffer.byteLength(respStr)
    totalRecv += respLen
    recvBytes.inc({ protocol: 'grpc', ...serviceLabel }, respLen)
    const end = process.hrtime.bigint()
    const elapsed = Number(end - start) / 1e9
    duration.observe({ protocol: 'grpc', ...serviceLabel }, elapsed)
    res.json({ protocol: 'grpc', count, size, send_bytes: totalSend, recv_bytes: totalRecv, elapsed_seconds: elapsed, summary })
  })
  for (let i = 0; i < count; i++) {
    const msg = { value: Math.random(), pad }
    const msgStr = JSON.stringify(msg)
    const len = Buffer.byteLength(msgStr)
    totalSend += len
    sendBytes.inc({ protocol: 'grpc', ...serviceLabel }, len)
    call.write(msg)
  }
  call.end()
})

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', clientProm.register.contentType)
  res.end(await clientProm.register.metrics())
})

const port = process.env.PORT || 8080
app.listen(port, () => {})
