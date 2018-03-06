
'use strict'

const RequestValidator = require('./utils/validator')
const debug = require('debug')('kmjs:endpoint')

module.exports = class Endpoint {
  constructor (opts) {
    Object.assign(this, opts)
  }

  build (http) {
    let endpoint = this
    return function () {
      let callsite = new Error().stack.split('\n')[2]
      if (callsite && callsite.length > 0) {
        debug(`Call to '${endpoint.route.name}' from ${callsite.replace('    at ', '')}`)
      }
      return new Promise((resolve, reject) => {
        RequestValidator.extract(endpoint, Array.prototype.slice.call(arguments))
          .then((opts) => {
            // Different service than default, setup base url in url
            if (endpoint.service && endpoint.service.baseURL) {
              opts.url = endpoint.service.baseURL + opts.url
            }
            http.request(opts).then(resolve, reject)
          })
          .catch(reject)
      })
    }
  }
}
