/* global URLSearchParams, localStorage */
'use strict'

const AuthStrategy = require('./strategy')
const km = require('../keymetrics')

module.exports = class BrowserFlow extends AuthStrategy {
  retrieveTokens (cb) {
    let verifyToken = (refresh) => {
      return km.auth.retrieveToken({
        client_id: this.client_id,
        refresh_token: refresh
      })
    }

    // parse the url since it can contain tokens
    let url = new URL(window.location)
    this.response_mode = this.response_mode === 'query' ? 'search' : this.response_mode
    let params = new URLSearchParams(url[this.response_mode])

    if (params.get('access_token') !== null) {
      // verify that the access_token in parameters is valid
      verifyToken(params.get('access_token'))
        .then((res) => {
          let tokens = res.data
          return cb(null, tokens)
        }).catch(cb)
    } else if (typeof localStorage !== 'undefined' && localStorage.getItem('refresh_token') !== null) {
      // maybe in the local storage ?
      verifyToken(localStorage.getItem('refresh_token'))
        .then((res) => {
          let tokens = res.data
          return cb(null, tokens)
        }).catch(cb)
    } else {
      // otherwise we need to get a refresh token
      window.location = `${this.oauth_endpoint}${this.oauth_query}`
    }
  }
}
