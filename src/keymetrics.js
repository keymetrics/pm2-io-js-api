
'use strict'

const mapping = require('./api_mappings.json')
const Namespace = require('./namespace')
const Endpoint = require('./endpoint')
const HttpWrapper = require('./http')
const constants = require('../constants')

const Keymetrics = class Keymetrics {
 /**
 * @constructor
 * Keymetrics
 *
 * @param {object} opts The options are passed to the children instances
 */
  constructor (opts) {
    this.opts = Object.assign(constants, opts)

    this.version = 1
    this.http = new HttpWrapper(this.opts)
    // build namespaces at startup
    Object.assign(this, this.buildNamespaces())
  }

  buildNamespaces () {
    let namespaces = {}
    // retrieve all namespace available
    for (let name in mapping) {
      // create a instance for each of them
      let namespace = new Namespace({ name, http: this.http })
      // retrieve all endpoint defined in the mapping
      for (let endpoint of mapping[name]) {
        // and create endpoint instance of each of them
        namespace.addEndpoint(new Endpoint(endpoint))
      }
      namespaces[name] = namespace
      module.exports[name] = namespace
    }
    return namespaces
  }

  /**
   * Use a specific flow to retrieve an access token on behalf the user
   * @param {String|Function} flow either a flow name or a custom implementation
   * @param {Object} opts
   */
  use (flow, opts) {
    this.http.useStrategy(flow, opts)
    return this
  }
}

module.exports = Keymetrics
