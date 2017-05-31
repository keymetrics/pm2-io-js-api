
const config = {
  API_URL: 'http://cl1.km.io:3000',
  OAUTH_AUTHORIZE_ENDPOINT: '/api/oauth/authorize',
  OAUTH_CLIENT_ID: 4228578805,
  ENVIRONNEMENT: process && process.versions && process.versions.node ? 'node' : 'browser'
}

module.exports = Object.assign({}, config)
