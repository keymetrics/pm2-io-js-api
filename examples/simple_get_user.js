const Keymetrics = require('../index.js')

let km = new Keymetrics({
  API_URL: 'http://localhost:3000'
}).use('standalone', {
  client_id: 'client_id',
  refresh_token: 'refresh_token'
})

km.user.isLogged()
  .then((res) => {
    console.log(res.data)
  })
  .catch((err) => {
    delete err.response.request
    console.log(err.response)
  })
