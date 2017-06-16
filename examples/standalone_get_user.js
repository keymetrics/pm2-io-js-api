const Keymetrics = require('../index.js')

process.on('unhandledRejection', (reason, promise) => console.log(reason));

let km = new Keymetrics({
  API_URL: 'http://cl1.km.io:3000',
  OAUTH_CLIENT_ID: '795984050'
}).use('standalone', {
  refresh_token: 'h1n98zf3pmdr95c7vrl51zdd5zni99l9kwi7kht5ty9w99cb1sci86vzezma8dok'
})

// retrieve our buckets
km.bucket.retrieveAll()
  .then((res) => {
    let bucket = res.data.filter(bucket => bucket.public_id === '96a1ph8ymmrycwr')[0]

    // attach handler on specific namespaces
    km.realtime.on(`${bucket.public_id}:connected`, () => console.log('connected to realtime'))
    km.realtime.on(`96a1ph8ymmrycwr:mercury-76b7346a:status`, (data) => console.log(data))

    // connect to realtime data of a bucket
    km.realtime.subscribe(bucket._id, (err) => console.log(err))
  })
  .catch((err) => {
    console.log(err)
  })
