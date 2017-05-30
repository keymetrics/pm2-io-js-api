
const config = {
  API_URL: 'http://localhost:300',
  OAUTH_AUTHORIZE_ENDPOINT: '/api/oauth/authorize',
  OAUTH_CLIENT_ID: 4228578805,
  ENVIRONNEMENT: process && process.versions && process.versions.node ? 'node' : 'browser'
}

const flows = {
  /*'embed': {
    nodule: require('./src/auth_flows/embed'),
    condition: 'node'
  },
  'browser': {
    nodule: require('./src/auth_flows/browser'),
    condition: 'browser'
  },*/
  'standalone': {
    nodule: require('./src/auth_flows/standalone')
  }
}

module.exports = Object.assign({ flows }, config)
