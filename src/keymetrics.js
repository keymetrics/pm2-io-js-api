
'use strict'

const mapping = require('./api_mappings.json')
const Namespace = require('./namespace')
const HttpWrapper = require('./http')
const constants = require('../constants')
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

    this.version = 1

    logger('init http client')
    this.http = new HttpWrapper(this.opts)

    // build namespaces at startup
    logger('building namespaces')
    let root = new Namespace(mapping, {
      name: 'root',
      http: this.http
    })
    logger('exposing namespaces')
    for (let key in root) {
      if (key === 'name' || key === 'opts') continue
      this[key] = root[key]
      Keymetrics[key] = root[key]
    }
    logger(`attached namespaces : ${Object.keys(this)}`)
  }

  /**
   * Use a specific flow to retrieve an access token on behalf the user
   * @param {String|Function} flow either a flow name or a custom implementation
   * @param {Object} opts
   */
  use (flow, opts) {
    logger(`using ${flow} authentication strategy`)
    this.http.useStrategy(flow, opts)
    return this
  }
}

module.exports = Keymetrics
