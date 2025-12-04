import grpc from '@grpc/grpc-js'
import protoLoader from '@grpc/proto-loader'
import path from 'path'
import express from 'express'
import prom from 'prom-client'

const protoPath = path.join(process.cwd(), 'services', 'processor-grpc', 'proto', 'processor.proto')
const packageDefinition = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true })
const proto = grpc.loadPackageDefinition(packageDefinition).processor

prom.collectDefaultMetrics()
const sendBytes = new prom.Counter({ name: 'app_send_bytes_total', help: 'total sent bytes', labelNames: ['protocol', 'service'] })
const recvBytes = new prom.Counter({ name: 'app_recv_bytes_total', help: 'total received bytes', labelNames: ['protocol', 'service'] })
const serviceLabel = { service: 'processor-grpc' }

function processStream(call, callback) {
  let count = 0
  let sum = 0
  let recv = 0
  call.on('data', (msg) => {
    count += 1
    sum += Number(msg.value || 0)
    const msgStr = JSON.stringify(msg)
    recv += Buffer.byteLength(msgStr)
  })
  call.on('end', () => {
    recvBytes.inc({ protocol: 'grpc', ...serviceLabel }, recv)
    const mean = count > 0 ? sum / count : 0
    const summary = { count, sum, mean }
    const respStr = JSON.stringify(summary)
    const outLen = Buffer.byteLength(respStr)
    sendBytes.inc({ protocol: 'grpc', ...serviceLabel }, outLen)
    callback(null, summary)
  })
}

const server = new grpc.Server()
server.addService(proto.Processor.service, { ProcessStream: processStream })
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  server.start()
})

const app = express()
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prom.register.contentType)
  res.end(await prom.register.metrics())
})
app.listen(3001, () => {})
