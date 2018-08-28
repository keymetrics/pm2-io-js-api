
var IO = require('..')

var io = new IO().use('standalone', {
  refresh_token: 'refresh-token'
})

io.bucket.retrieveAll()
  .then((res) => {
    var bucket = res.data[0]

    io.realtime.subscribe(bucket._id).catch(console.error)

    io.realtime.on(`${bucket.public_id}:*:status`, (status) => {
      console.log(status)
    })

    io.realtime.on(`${bucket.public_id}:*:human:event`, (status) => {
      console.log(status)
    })

    io.realtime.on(`${bucket.public_id}:*:process:exception`, (status) => {
      console.log(status)
    })

    io.realtime.on(`${bucket.public_id}:*:process:event`, (status) => {
      console.log(status)
    })
  })
