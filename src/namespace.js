
'use strict'

module.exports = class Namespace {
  constructor (opts) {
    this.name = opts.name
    this.http = opts.http
    this.endpoints = []
  }

  addEndpoint (endpoint) {
    if (!endpoint || endpoint.name === this.name) {
      throw new Error(`A endpoint must not have the same name as a namespace`)
    }
    this.endpoints.push(endpoint)
    this[endpoint.name] = endpoint.build(this.http)
  }
}
