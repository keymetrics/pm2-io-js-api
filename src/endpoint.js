
'use strict'

const RequestValidator = require('./utils/validator')

module.exports = class Endpoint {
  constructor (opts) {
    Object.assign(this, opts)
  }

  build (http) {
    let endpoint = this
    return function () {
      return new Promise((resolve, reject) => {
        RequestValidator.extract(endpoint, arguments)
          .then((opts) => {
            http.request(opts).then(resolve, reject)
          })
          .catch(reject)
      })
    }
  }
}
