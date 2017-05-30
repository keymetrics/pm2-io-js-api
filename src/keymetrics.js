
'use strict'

const mapping = require('./api_mappings.json')
const Namespace = require('./namespace')
const Endpoint = require('./endpoint')
const HttpWrapper = require('./http')
const Flow = require('./auth_flows/flow')
const constants = require('../constants')

const Keymetrics = class Keymetrics {
 /**
 * @constructor
 * Keymetrics
 *
 * @param {object} opts The options are passed to the children instances
 */
  constructor (opts) {
    opts = Object.assign(constants, opts)

    this.version = 1
    this.http = new HttpWrapper(opts)
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
      exports[name] = namespace
    }
    return namespaces
  }

  /**
   * Use a specific flow to retrieve an access token on behalf the user
   * @param {String|Function} flow either a flow name or a custom implementation
   * @param {Object} opts
   */
  use (flow, opts) {
    // in the case of flow being a custom implementation
    if (typeof flow === 'function') {
      if (!(flow instanceof Flow)) throw new Error('You must implement the Flow interface to use it')
      let CustomFlow = flow
      this.oauth_flow = new CustomFlow(opts, this.http.updateTokens.bind(this.http))
      return this
    }
    // otherwise fallback on the flow that are implemented
    if (typeof constants.flows[flow] === 'undefined') {
      throw new Error(`The flow named ${flow} doesn't exist`)
    }
    let flowMeta = constants.flows[flow]
    // verify that the environnement condition is meet
    if (flowMeta.condition && constants.ENVIRONNEMENT !== flowMeta.condition) {
      throw new Error(`The flow ${flow} is reserved for ${flowMeta.condition} environement`)
    }
    let FlowImpl = flowMeta.nodule
    this.oauth_flow = new FlowImpl(opts, this.http.updateTokens.bind(this.http))
    return this
  }
}

module.exports = Keymetrics
