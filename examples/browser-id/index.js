
var client = new window.Keymetrics()

client.use('browser', {
  client_id: '4228578805'
})

client.user.retrieve()
  .then((response) => {
    console.log(response.data)
  })
