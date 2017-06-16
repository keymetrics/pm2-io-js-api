
'use strict'

const axios = require('axios')
const AuthStrategy = require('./auth_strategies/strategy')
const constants = require('../constants')
const logger = require('debug')('kmjs:network')
const loggerHttp = require('debug')('kmjs:network:http')
const loggerWS = require('debug')('kmjs:network:ws')
const WS = require('./utils/websocket')
const EventEmitter = require('eventemitter2')
const km = require('./keymetrics')

module.exports = class NetworkWrapper {
  constructor (opts) {
    logger('init network manager')
    opts.baseURL = opts.API_URL || 'https://api.keymetrics.io'
    this.opts = opts
    this.tokens = {
      refresh_token: null,
      access_token: null
    }
    this._buckets = []
    this._queue = []
    this._axios = axios.create(opts)
    this._queueWorker = setInterval(this._queueUpdater.bind(this), 100)
    this._websockets = []

    this.realtime = new EventEmitter({
      wildcard: true,
      delimiter: ':',
      newListener: false,
      maxListeners: 20
    })
    this.realtime.subscribe = this.subscribe.bind(this)
    this.realtime.unsubscribe = this.unsubscribe.bind(this)
    this.authenticated = false
  }

  _queueUpdater () {
    if (this.authenticated === false) return

    if (this._queue.length > 0) {
      logger(`Emptying requests queue (size: ${this._queue.length})`)
    }

    // when we are authenticated we can clear the queue
    while (this._queue.length > 0) {
      let promise = this._queue.shift()
      // make the request
      this.request(promise.request).then(promise.resolve, promise.reject)
    }
  }

  /**
   * Send a http request
   * @param {Object} opts
   * @param {String} [opts.method=GET] http method
   * @param {String} opts.url the full URL
   * @param {Object} [opts.data] body data
   * @param {Object} [opts.params] url params
   */
  request (httpOpts) {
    if (httpOpts.url.match(/bucket/)) {
      let bucketID = httpOpts.url.split('/')[3]
      let node = this._buckets.filter(bucket => bucket._id === bucketID).map(bucket => bucket.node_cache)[0]
      if (node && node.endpoints) {
        httpOpts.baseURL = node.endpoints.web
      }
    }

    return new Promise((resolve, reject) => {
      if (this.authenticated === false && httpOpts.authentication === true) {
        loggerHttp(`Queued request to ${httpOpts.url}`)
        this._queue.push({
          resolve,
          reject,
          request: httpOpts
        })
      } else {
        this._axios.request(httpOpts).then(resolve).catch(reject)
      }
    })
  }

  /**
   * Update the access token used by all the networking clients
   * @param {Error} err if any erro
   * @param {String} accessToken the token you want to use
   * @private
   */
  _updateTokens (err, data) {
    if (err) {
      console.error(`Error while retrieving tokens : ${err.message}`)
      return console.error(err.response ? err.response.data : err.stack)
    }
    if (!data || !data.access_token || !data.refresh_token) throw new Error('Invalid tokens')

    this.tokens = data
    this._axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
    this._axios.request({ url: '/api/bucket', method: 'GET' })
      .then((res) => {
        this._buckets = res.data
        this.authenticated = true
      }).catch((err) => {
        console.error('Error while retrieving buckets')
        console.error(err.response ? err.response.data : err)
      })
  }

  /**
   * Specify a strategy to use when authenticating to server
   * @param {String|Function} flow the name of the flow to use or a custom implementation
   * @param {Object} [opts]
   * @param {String} [opts.client_id] the OAuth client ID to use to identify the application
   *  default to the one defined when instancing Keymetrics and fallback to 795984050 (custom tokens)
   * @throws invalid use of this function, either the flow don't exist or isn't correctly implemented
   */
  useStrategy (flow, opts) {
    if (!opts) opts = {}
    // if client not provided here, use the one given in the instance
    if (!opts.client_id) {
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
      throw new Error(`The flow ${flow} is reserved for ${flowMeta.condition} environ sment`)
    }
    let FlowImpl = flowMeta.nodule
    this.oauth_flow = new FlowImpl(opts)
    return this.oauth_flow.retrieveTokens(this._updateTokens.bind(this))
  }

  /**
   * Subscribe to realtime from bucket
   * @param {String} bucketId bucket id
   * @param {Object} [opts]
   *
   * @return {Promise}
   */
  subscribe (bucketId, opts) {
    return new Promise((resolve, reject) => {
      logger(`Request endpoints for ${bucketId}`)
      km.bucket.retrieve(bucketId)
        .then((res) => {
          let bucket = res.data

          let endpoint = bucket.node_cache.endpoints.realtime || bucket.node_cache.endpoints.web
          endpoint = endpoint.replace('http', 'ws')
          if (this.opts.IS_DEBUG) {
            endpoint = endpoint.replace(':3000', ':4020')
          }
          loggerWS(`Found endpoint for ${bucketId} : ${endpoint}`)

          // connect websocket client to the realtime endpoint
          let socket = new WS(`${endpoint}/primus/?token=${this.tokens.access_token}`)
          socket.connected = false
          socket.bucket = bucketId

          let onConnect = () => {
            logger(`Connected to ws endpoint : ${endpoint} (bucket: ${bucketId})`)
            socket.connected = true
            this.realtime.emit(`${bucket.public_id}:connected`)

            socket.send(JSON.stringify({
              action: 'active',
              public_id: bucket.public_id
            }))
          }
          socket.onopen = onConnect
          socket.onreconnect = onConnect

          socket.onerror = (err) => {
            loggerWS(`Error on ${endpoint} (bucket: ${bucketId})`)
            loggerWS(err)

            this.realtime.emit(`${bucket.public_id}:error`, err)
          }

          socket.onclose = () => {
            logger(`Closing ws connection ${endpoint} (bucket: ${bucketId})`)
            socket.connected = false
            this.realtime.emit(`${bucket.public_id}:disconnected`)
          }

          // broadcast in the bus
          socket.onmessage = (data) => {
            loggerWS(`Received message for bucket ${bucketId} (${(data.data.length / 1000).toFixed(1)} Kb)`)
            data = JSON.parse(data.data)
            let packet = data.data[1]
            Object.keys(packet).forEach((event) => {
              if (event === 'server_name') return
              this.realtime.emit(`${bucket.public_id}:${data.server_name || 'none'}:${event}`, packet[event])
            })
          }

          this._websockets.push(socket)
          return resolve(socket)
        }).catch(reject)
    })
  }

  /**
   * Unsubscribe realtime from bucket
   * @param {String} bucketId bucket id
   * @param {Object} [opts]
   *
   * @return {Promise}
   */
  unsubscribe (bucketId, opts) {
    return new Promise((resolve, reject) => {
      logger(`Unsubscribe from realtime for ${bucketId}`)
      let socket = this._websockets.find(socket => socket.bucket === bucketId)
      if (!socket) {
        return reject(new Error(`Realtime wasn't connected to ${bucketId}`))
      }
      socket.close(1000, 'Disconnecting')
      logger(`Succesfully unsubscribed from realtime for ${bucketId}`)
      return resolve()
    })
  }
}
