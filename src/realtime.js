const loggerWS = require('debug')('kmjs:network:ws')
const WS = require('./utils/websocket')
const EventEmitter = require('eventemitter2')

module.exports = class BucketRealtime extends EventEmitter {
  constructor (bucket) {
    super({
      wildcard: true,
      delimiter: ':',
      newListener: false,
      maxListeners: 20
    })
    this.bucket = bucket
    this.socket = null
    this.filters = []
  }

  /**
   * Connect to realtime server
   */
  connect () {
    return new Promise((resolve, reject) => {
      let connected = false
      const endpoints = this.bucket.node.endpoints || this.bucket.node_cache.endpoints
      let endpoint = endpoints.realtime || endpoints.web
      endpoint = endpoint.replace('http', 'ws')
      loggerWS(`Found endpoint for ${this.bucket.id} : ${endpoint}`)

      // connect websocket client to the realtime endpoint
      let socket = new WS(`${endpoint}/primus`, this.tokens.access_token)
      socket.connected = false
      this.socket = socket

      let keepAliveHandler = function () {
        socket.ping()
      }
      let keepAliveInterval = null

      let onConnect = () => {
        loggerWS(`Connected to ws endpoint : ${endpoint} (bucket: ${this.bucket.id})`)
        socket.connected = true
        this.emit(`${this.bucket.public_id}:connected`)
        this.subscribe()

        if (keepAliveInterval !== null) {
          clearInterval(keepAliveInterval)
          keepAliveInterval = null
        }
        keepAliveInterval = setInterval(keepAliveHandler.bind(this), 5000)
        if (!connected) {
          connected = true
          return resolve(socket)
        }
      }
      socket.onmaxreconnect = _ => {
        if (!connected) {
          connected = true
          return reject(new Error('Connection timeout'))
        }
      }
      socket.onopen = onConnect

      socket.onunexpectedresponse = (req, res) => {
        if (res.statusCode === 401) {
          return this.oauth_flow.retrieveTokens(this.km, (err, data) => {
            if (err) return loggerWS(`Failed to retrieve tokens for ws: ${err.message}`)
            loggerWS(`Succesfully retrieved new tokens for ws`)
            this._updateTokens(null, data, (err, authenticated) => {
              if (err) return loggerWS(`Failed to update tokens for ws: ${err.message}`)
              return socket._tryReconnect()
            })
          })
        }
        return socket._tryReconnect()
      }
      socket.onerror = (err) => {
        loggerWS(`Error on ${endpoint} (bucket: ${this.bucket.id})`)
        loggerWS(err)

        this.emit(`${this.bucket.public_id}:error`, err)
      }

      socket.onclose = () => {
        loggerWS(`Closing ws connection ${endpoint} (bucket: ${this.bucket.id})`)
        socket.connected = false
        this.emit(`${this.bucket.public_id}:disconnected`)

        if (keepAliveInterval !== null) {
          clearInterval(keepAliveInterval)
          keepAliveInterval = null
        }
      }

      // broadcast in the bus
      socket.onmessage = (msg) => {
        loggerWS(`Received message for bucket ${this.bucket.id} (${(msg.data.length / 1000).toFixed(1)} Kb)`)
        let data = null
        try {
          data = JSON.parse(msg.data)
        } catch (e) {
          return loggerWS(`Receive not json message for bucket ${this.bucket.id}`)
        }
        let packet = data.data[1]
        Object.keys(packet).forEach((event) => {
          if (event === 'server_name') return
          this.emit(`${this.bucket.public_id}:${packet.server_name || 'none'}:${event}`, packet[event])
        })
      }
    })
  }

  /**
   * Used to listen realtime events and send new filters to realtime
   * @param {String} event
   * @param {Function} listener
   */
  on (event, listener) { // need to be `server:channel`
    const filter = event.split(':').slice(1).join(':')
    this.filters.push(filter)
    this.subscribe()
    super.on(event, listener)
  }

  /**
   * Used to listen realtime events and send new filters to realtime
   * @param {String} event
   * @param {Function} listener
   */
  off (event, listener) {
    const filter = event.split(':').slice(1).join(':')
    this.filters.splice(this.filters.indexOf(filter), 1)
    this.subscribe()
    super.off(event, listener)
  }

  /**
   * Send subscribe command to realtime with custom filters
   */
  subscribe () {
    this.socket.send(JSON.stringify({
      action: 'sub',
      public_id: this.bucket.public_id,
      filters: [...new Set(this.filters)] // avoid duplicates
    }))
  }

  /**
   * Disconnect from realtime server
   */
  unsubcribe () {
    this.filters = []
    loggerWS(`Unsubscribe from realtime for ${this.bucket.id}`)
    this.socket.close(1000, 'Disconnecting')
    loggerWS(`Succesfully unsubscribed from realtime for ${this.bucket.id}`)
  }
}
