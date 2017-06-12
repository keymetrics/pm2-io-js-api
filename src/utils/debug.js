
'use strict'

module.exports = (namespace) => {
  let key = 'kmjs' + (namespace ? ':' + namespace : '')
  return function () {
    // retrieve the current debug level
    let debugKey = (process ? process.env.DEBUG : global.DEBUG) || ''
    // if the debug is enabled for this namespace
    if (!debugKey.match(key)) return
    // log it to console.error
    console.error.apply(this, arguments)
  }
}
