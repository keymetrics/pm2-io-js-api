const Keymetrics = require('../index.js')

let km = new Keymetrics({
  API_URL: 'http://cl1.km.io:3000',
  OAUTH_CLIENT_ID: '5413907556'
}).use('standalone', {
  refresh_token: 'token'
})

km.user.isLogged()
  .then((res) => {
    console.log(res.data.username)
  })
  .catch((err) => {
    delete err.response.request
    // console.log(err.response)
    console.log(err.response.data)
  })
