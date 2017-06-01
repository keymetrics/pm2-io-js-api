
'use strict'

const constants = require('../../constants.js')

const AuthStrategy = class AuthStrategy {
  constructor (opts) {
    this._opts = opts
    this.client_id = opts.client_id
    if (!this.client_id) {
      throw new Error('You must always provide a application id for any of the strategies')
    }
    this.scope = opts.scope || 'all'
    this.response_mode = opts.reponse_mode || 'query'
    this.oauth_endpoint = `${constants.API_URL}${constants.OAUTH_AUTHORIZE_ENDPOINT}`
    this.oauth_query = `?client_id=${opts.client_id}&response_mode=${this.response_mode}` +
      `&response_type=token&scope=${this.scope}`
  }

  retrieveTokens () {
    throw new Error('You need to implement the Flow interface to use it')
  }

  static implementations (name) {
    const flows = {
      'embed': {
        path: `${__dirname}/embed_strategy`,
        condition: 'node'
      },
      'browser': {
        path: `${__dirname}/browser_strategy`,
        condition: 'browser'
      },
      'standalone': {
        path: `${__dirname}/standalone_strategy`
      }
    }
    return name ? flows[name] : null
  }
}

module.exports = AuthStrategy
