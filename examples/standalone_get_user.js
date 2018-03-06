const Keymetrics = require('../index.js')

process.on('unhandledRejection', (reason, promise) => console.log(reason));

let km = new Keymetrics({
  OAUTH_CLIENT_ID: '795984050',
  services: {
    API: 'http://cl1.km.io:3000',
    OAUTH: 'http://cl1.km.io:3100'
  }
}).use('standalone', {
  refresh_token: '7ny9ay0lnaocpb07cboubev32ytm4w3tl2eteah5h0cbwizac9itndsnmtag2dnm'
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
