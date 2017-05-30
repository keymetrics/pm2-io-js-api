
'use strict'

const constants = require('../../constants')

module.exports = class Flow {
  constructor (opts, cb) {
    this._opts = opts
    this.client_id = opts.client_id
    if (!this.client_id) {
      throw new Error('You must provide a application id for any of the strategies')
    }
    this.scope = opts.scope
    this.response_mode = opts.reponse_mode || 'query'
    this.oauth_endpoint = `${constants.API_URL}${constants.OAUTH_AUTHORIZE_ENDPOINT}`
    this.oauth_query = `?client_id=${opts.client_id}&response_mode=${this.response_mode}`
  }

  launch () {
    throw new Error(`You need to implement the Flow class to be able to use your class as flow`)
  }
}
