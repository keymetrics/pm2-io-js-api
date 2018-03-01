const Keymetrics = require('../index.js')

let km = new Keymetrics({
  OAUTH_CLIENT_ID: '9459143721'
}).use('embed')

km.bucket.retrieveAll()
  .then((res) => {
    console.log(res.data.map(bucket => bucket._id))
    km.bucket.retrieveUsers(res.data[1]._id)
      .then((res) => {
        console.log(res.data)
      })
  })
  .catch((err) => {
    delete err.response.request
    // console.log(err.response)
    console.log(err.response.data)
  })
