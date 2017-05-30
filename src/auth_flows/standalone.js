
'use strict'

const Flow = require('./flow')
const km = require('../keymetrics')

module.exports = class StandaloneFlow {
  constructor (opts, updateTokens) {
    if (opts.refresh_token && opts.access_token) {
      // if both access and refresh tokens are provided, we are good
      return updateTokens({
        access_token: opts.access_token,
        refresh_token: opts.refresh_token
      })
    } else if (opts.refresh_token && opts.client_id) {
      // we can also make a request to get an access token
      km.auth.retrieveToken({
        client_id: opts.client_id,
        refresh_token: opts.refresh_token
      }).then((res) => {
        let tokens = res.data
        return updateTokens(tokens)
      }).catch((err) => {
        throw err
      })
    } else {
      // otherwise the flow isn't used correctly
      throw new Error(`If you want to use the standalone flow you need to provide either 
        a refresh and access token OR a refresh token and a client id`)
    }
  }

  launch () {
    // do nothing
  }
}
