
'use strict'

const axios = require('axios')
const AuthStrategy = require('./auth_strategies/strategy')
const constants = require('../constants')

module.exports = class HttpWrapper {
  constructor (opts) {
    opts.baseURL = opts.API_URL || 'https://api.keymetrics.io'
    this.opts = opts
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
  updateTokens (err, data) {
    if (err) throw err
    if (!data || !data.access_token || !data.refresh_token) throw new Error('Invalid tokens')

    this.tokens = data
    this.authenticated = true
    this._axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
  }

  useStrategy (flow, opts) {
    // if client not provided here, use the one given in the instance
    if (!opts || !opts.client_id) {
      if (!opts) opts = {}
      opts.client_id = this.opts.OAUTH_CLIENT_ID
    }

    // in the case of flow being a custom implementation
    if (typeof flow === 'function') {
      if (!(flow instanceof AuthStrategy)) throw new Error('You must implement the Flow interface to use it')
      let CustomFlow = flow
      this.oauth_flow = new CustomFlow(opts)
      return this.oauth_flow.retrieveTokens(this.updateTokens.bind(this))
    }
    // otherwise fallback on the flow that are implemented
    if (typeof AuthStrategy.implementations(flow) === 'undefined') {
      throw new Error(`The flow named ${flow} doesn't exist`)
    }
    let flowMeta = AuthStrategy.implementations(flow)
    // verify that the environnement condition is meet
    if (flowMeta.condition && constants.ENVIRONNEMENT !== flowMeta.condition) {
      throw new Error(`The flow ${flow} is reserved for ${flowMeta.condition} environement`)
    }
    let FlowImpl = flowMeta.nodule
    this.oauth_flow = new FlowImpl(opts)
    return this.oauth_flow.retrieveTokens(this.updateTokens.bind(this))
  }
}
