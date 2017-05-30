
'use strict'

const Flow = require('./flow')
const http = require('http')

module.exports = class EmbedFlow extends Flow {
  launch () {
    let server = http.createServer((req, res) => {
      res.send({})
    })
    server.listen()
  }
}