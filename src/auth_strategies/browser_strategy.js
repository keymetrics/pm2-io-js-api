/* global URLSearchParams, URL, localStorage */
'use strict'

const AuthStrategy = require('./strategy')
const km = require('../keymetrics')

module.exports = class BrowserFlow extends AuthStrategy {

  removeUrlToken(refreshToken) {
    let url = window.location.href
    let params = `?access_token=${refreshToken}&token_type=refresh_token`
    let newUrl = url.replace(params, '')
    window.history.pushState('', '', newUrl)
  }

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
          this.removeUrlToken(res.data.refresh_token)
          // Save refreshToken in localstorage
          localStorage.setItem('km_refresh_token', params.get('access_token'))
          let tokens = res.data
          return cb(null, tokens)
        }).catch(cb)
    } else if (typeof localStorage !== 'undefined' && localStorage.getItem('km_refresh_token') !== null) {
      // maybe in the local storage ?
      verifyToken(localStorage.getItem('km_refresh_token'))
        .then((res) => {
          this.removeUrlToken(res.data.refresh_token)
          let tokens = res.data
          return cb(null, tokens)
        }).catch(cb)
    } else {
      // otherwise we need to get a refresh token
      window.location = `${this.oauth_endpoint}${this.oauth_query}`
    }
  }

}
