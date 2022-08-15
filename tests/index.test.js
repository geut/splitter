import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { Readable, Writable, Transform, pipeline } from 'streamx'
import { Split, Merge } from '../src/index.js'

const split = (opts) => new Split(opts)
const merge = (opts) => new Merge(opts)

test('send the raw data if length <= chunkSize', async () => {
  let result
  let checkSize
  const data = Buffer.from('123456789!')

  const rs = new Readable({
    read (cb) {
      this.push(data)
      this.push(null)
      cb(null)
    }
  })

  const ws = new Writable({
    write (data, cb) {
      result = Buffer.from(data).toString()
      return cb(null)
    }
  })

  const check = new Transform({
    transform (data, cb) {
      checkSize = data.length
      this.push(data)
      cb()
    }
  })

  await new Promise((resolve, reject) => pipeline(rs, split(), check, merge(), ws, err => {
    if (err) return reject(err)
    resolve()
  }))

  assert.is(result, data.toString())
  assert.is(checkSize, data.length)
})

test('split by 3 bytes', async () => {
  let result

  const rs = new Readable({
    read (cb) {
      this.push(Buffer.from('123456789!'))
      this.push(null)
      cb(null)
    }
  })

  const ws = new Writable({
    write (data, cb) {
      result = Buffer.from(data).toString()
      return cb(null)
    }
  })

  await new Promise((resolve, reject) => pipeline(rs, split({ chunkSize: 3 }), merge({ chunkSize: 3 }), ws, err => {
    if (err) return reject(err)
    resolve()
  }))

  assert.is(result, '123456789!')
})

test('merge: timeout', async () => {
  let result

  let next = false
  const rs = new Readable({
    read (cb) {
      if (next) {
        return setTimeout(() => {
          this.push(null)
          cb()
        }, 2_000)
      }
      this.push(Buffer.from('123456789!'))
      next = true
      cb()
    }
  })

  const ws = new Writable({
    write (data, cb) {
      result = Buffer.from(data).toString()
      return cb()
    }
  })

  const error = new Transform({
    transform (data, cb) {
      if (!this._init) {
        this._init = true
        this.push(data)
      }
      cb()
    }
  })

  const res = merge({ chunkSize: 3, timeout: 500 })

  const stream = new Promise((resolve, reject) => pipeline(rs, split({ chunkSize: 3 }), error, res, ws, err => {
    if (err) return reject(err)
    resolve()
  }))

  await new Promise(resolve => setTimeout(resolve, 1))

  assert.is(res._packets.size, 1)

  await stream

  assert.is(res._packets.size, 0)
  assert.is(result, undefined)
})

test.run()
