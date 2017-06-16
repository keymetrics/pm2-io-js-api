
'use strict'

const mapping = require('./api_mappings.json')
const Namespace = require('./namespace')
const constants = require('../constants')
const NetworkWrapper = require('./network')
const logger = require('./utils/debug')()

const Keymetrics = class Keymetrics {
 /**
 * @constructor
 * Keymetrics
 *
 * @param {object} opts The options are passed to the children instances
 */
  constructor (opts) {
    logger('init keymetrics instance')
    this.opts = Object.assign(constants, opts)

    logger('init network client (http/ws)')
    this._network = new NetworkWrapper(this.opts)

    // build namespaces at startup
    logger('building namespaces')
    let root = new Namespace(mapping, {
      name: 'root',
      http: this._network
    })
    logger('exposing namespaces')
    for (let key in root) {
      if (key === 'name' || key === 'opts') continue
      this[key] = root[key]
      Keymetrics[key] = root[key]
      exports[key] = root[key]
    }
    logger(`attached namespaces : ${Object.keys(this)}`)

    this.realtime = this._network.realtime
  }

  /**
   * Use a specific flow to retrieve an access token on behalf the user
   * @param {String|Function} flow either a flow name or a custom implementation
   * @param {Object} opts
   */
  use (flow, opts) {
    logger(`using ${flow} authentication strategy`)
    this._network.useStrategy(flow, opts)
    return this
  }
}

module.exports = Keymetrics
