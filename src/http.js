
'use strict'

const axios = require('axios')

module.exports = class HttpWrapper {
  constructor (opts) {
    opts.baseURL = opts.API_URL || 'https://api.keymetrics.io'
    this.tokens = {
      refresh_token: null,
      access_token: null
    }
    this.authenticated = false
    this.queue = []
    this._axios = axios.create(opts)
    this._queueWorker = setInterval(this.queueUpdater.bind(this), 100)
  }

  queueUpdater () {
    if (this.authenticated === false) return

    // when we are authenticated we can clear the queue
    while (this.queue.length > 0) {
      let promise = this.queue.shift()
      // make the request
      this.request(promise.request).then(promise.resolve, promise.reject)
    }
  }

  request (httpOpts) {
    return new Promise((resolve, reject) => {
      if (this.authenticated === false && httpOpts.authentication === true) {
        console.log(`Queued request to ${httpOpts.url}`)
        this.queue.push({
          resolve,
          reject,
          request: httpOpts
        })
      } else {
        this._axios.request(httpOpts).then(resolve, reject)
      }
    })
  }

  /**
   * Update the access token used by the http client
   * @param {String} accessToken the token you want to use
   */
  updateTokens (data) {
    if (!data || !data.access_token) throw new Error('Missing access token')
    this.authenticated = true
    this._axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
  }
}