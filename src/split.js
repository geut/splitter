import varint from 'varint'
import { Transform } from 'streamx'

function idGenerator () {
  const limit = 10000
  let timestamp = 0
  let offset = 0

  function reset () {
    timestamp = Date.now()
    offset = 0
  }

  reset()

  return function generate () {
    if (offset > limit) {
      reset()
    }

    return { timestamp, offset: offset++ }
  }
}

const idGenerate = idGenerator()

function encodePacket (data, id, index, size) {
  let offsetEncoder = 0

  const buf = new Uint8Array(
    varint.encodingLength(id.timestamp) +
    varint.encodingLength(id.offset) +
    varint.encodingLength(size) +
    varint.encodingLength(index) +
    data.byteLength
  )

  varint.encode(id.timestamp, buf, offsetEncoder)
  offsetEncoder += varint.encode.bytes
  varint.encode(id.offset, buf, offsetEncoder)
  offsetEncoder += varint.encode.bytes
  varint.encode(size, buf, offsetEncoder)
  offsetEncoder += varint.encode.bytes
  varint.encode(index, buf, offsetEncoder)
  offsetEncoder += varint.encode.bytes
  buf.set(data, offsetEncoder)

  return buf
}

export class Split extends Transform {
  constructor (opts = {}) {
    const { chunkSize = 1024, ...streamOpts } = opts

    super(streamOpts)

    this._chunkSize = chunkSize
  }

  _transform (data, cb) {
    let buf
    const id = idGenerate()
    if (data.length <= this._chunkSize) {
      buf = encodePacket(data, id, 0, 1)
      this.push(buf)
    } else {
      let offset = 0
      let end = 0
      let index = 0
      const size = Math.ceil(data.length / this._chunkSize)
      while (offset < data.length) {
        end = offset + this._chunkSize
        if (end > data.length) {
          end = data.length
        }
        buf = encodePacket(data.slice(offset, end), id, index++, size)
        offset = end
        this.push(buf)
      }
    }
    cb(null)
  }
}
