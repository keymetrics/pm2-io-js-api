/* eslint-env mocha */

'use strict'

const Keymetrics = require('..')
const assert = require('assert')

describe('Keymetrics Integration', () => {
  let km = null
  it('should instanciate keymetrics', () => {
    km = new Keymetrics().use('standalone', {
      refresh_token: process.env.KEYMETRICS_TOKEN
    })

    assert(km.user !== null)
    assert(km.bucket !== null)
    assert(km.data !== null)
  })

  it('should succesfully retrieve user data', (done) => {
    km.user.isLogged().then((res) => {
      assert(res.status === 200)
      assert(typeof res.data.username === 'string')
      assert(typeof res.data._id === 'string')
      assert(res.data.authorized_bucket instanceof Array)
      return done()
    }).catch(done)
  })

  it('should succesfully retrieve user buckets', (done) => {
    km.bucket.retrieveAll().then((res) => {
      assert(res.status === 200)
      assert(res.data instanceof Array)
      let bucket = res.data[0]
      assert(res.data.length > 0)
      assert(typeof bucket._id === 'string')
      assert(typeof bucket.name === 'string')
      assert(typeof bucket.public_id === 'string')
      assert(typeof bucket.secret_id === 'string')
      return done()
    }).catch(done)
  })
})
