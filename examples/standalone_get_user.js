const Keymetrics = require('../index.js')

let km = new Keymetrics({
  API_URL: 'http://cl1.km.io:3000',
  OAUTH_CLIENT_ID: '795984050'
}).use('standalone', {
  refresh_token: 'token'
})

km.bucket.retrieveAll()
  .then((res) => {
    let kmBucket = res.data.filter(bucket => bucket.public_id === '96a1ph8ymmrycwr')[0]
    // console.log(kmBucket)
    km.data.status.retrieve(kmBucket._id)
      .then((res) => console.log(res.data))
  })
  .catch((err) => {
    delete err.response.request
    // console.log(err.response)
    console.log(err.response.data)
  })
