
'use strict'

const Flow = require('./flow')

module.exports = class BrowserFlow extends Flow {
  constructor (opts, updateTokens) {
    super(opts)

    let content = window.location[opts.response_mode]
    if (opts.response_mode === 'query') content.replace('?', '')

    content = content.split('&')
    // parse the url since it can contain tokens
    if (content.length > 0) {
      let data = {}
      content.forEach((keyvalue) => {
        let tmp = keyvalue.split('=')
        data[tmp[0]] = tmp[1]
      })
      return updateTokens(data)
    }
    // we can also check in the localstorage and stuff like that
  }

  launch () {
    window.location = `${this.oauth_endpoint}${this.oauth_query}`
  }
}
