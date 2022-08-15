import varint from 'varint'
import { Transform } from 'streamx'

function concat (packet) {
  const buf = new Uint8Array(packet.byteLength)
  let offset = 0
  packet.chunks.forEach(chunk => {
    buf.set(chunk.data, offset)
    offset += chunk.data.length
  })
  return buf
}

const sort = (a, b) => a.index - b.index

const toBuffer = typeof Buffer !== 'undefined' ? data => Buffer.from(data) : null
let map
if (toBuffer) {
  map = data => data ? toBuffer(data) : data
}

export class Merge extends Transform {
  constructor (opts = {}) {
    const { timeout = 5_000, ...streamOpts } = opts
    super({ map, ...streamOpts })

    this._timeout = timeout
    this._packets = new Map()
  }

  _open (cb) {
    if (this._timeout) {
      this._timestamp = Date.now()

      this._interval = setInterval(() => {
        this._packets.forEach(packet => {
          if (Math.abs(packet.timestamp - this._timestamp) > this._timeout) {
            this._packets.delete(packet.id)
          }
        })

        this._timestamp = Date.now()
      }, this._timeout)
    }

    cb(null)
  }

  _destroy (cb) {
    this._interval && clearInterval(this._interval)
    cb(null)
  }

  _transform (data, cb) {
    try {
      const buf = this._decodePacket(data)
      if (buf) this.push(buf)
      cb(null)
    } catch (err) {
      cb(err)
    }
  }

  _decodePacket (data) {
    let offsetDecoder = 0
    const timestamp = varint.decode(data, offsetDecoder)
    offsetDecoder += varint.decode.bytes
    const offset = varint.decode(data, offsetDecoder)
    offsetDecoder += varint.decode.bytes
    const size = varint.decode(data, offsetDecoder)
    offsetDecoder += varint.decode.bytes
    const index = varint.decode(data, offsetDecoder)
    offsetDecoder += varint.decode.bytes
    data = data.slice(offsetDecoder)

    const id = timestamp + '/' + offset

    let packet = this._packets.get(id)
    if (!packet) {
      packet = { id, chunks: [], size, byteLength: 0, timestamp: Date.now() }
      this._packets.set(id, packet)
    }

    const chunk = { index, data }
    packet.chunks.push(chunk)
    packet.byteLength += chunk.data.byteLength

    if (packet.chunks.length === packet.size) {
      packet.chunks.sort(sort)
      this._packets.delete(id)
      return concat(packet)
    }

    return null
  }
}
