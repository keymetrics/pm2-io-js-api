

var client = new window.Keymetrics()

client.use('browser', {
  client_id: '4228578805'
})

client.user.retrieve()
  .then((response) => {
    console.log(response.data)
  })


client.bucket.retrieveAll()
  .then((res) => {
    var bucket = res.data[0]

    client.realtime.subscribe(bucket._id).catch(console.error)

    client.realtime.on(`${bucket.public_id}:*:status`, (status) => {
      console.log(status)
    })
  })
