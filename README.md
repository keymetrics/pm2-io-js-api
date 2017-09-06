# Keymetrics API Javascript client

This module lets you implement a fully customizable Keymetrics client, receiving live data from the Keymetrics API.

## Install

With NPM:

```bash
$ npm install kmjs-core --save
```

## Usage

To use this client you need to first requiring it into your code and creating a new instance :

```javascript
const Keymetrics = require('kmjs-core')

let km = new Keymetrics()
```

Then you'll to tell the client how you want to authenticate, you have the choice :

- First the `standalone` flow, you just need to enter a refresh token and it will works
```javascript
km.use('standalone', {
  refresh_token: 'token'
})
```

- Secondly, the `browser` flow, you have a custom keymetrics application and you want to authenticate of the behalf for any user (in this flow you need to be inside a browser) :
```javascript
km.use('browser', {
  client_id: 'my-oauth-client-id'
})
```

- Thirdly, the `embed` flow, you have a custom keymetrics application and you want to authenticate of the behalf of any user (you need to be in a nodejs process, for example a CLI) :
```javascript
km.use('embed', {
  client_id: 'my-oauth-client-id'
})
```

After that, you can do whatever call you want just keep in mind each call return a Promise (the client will handle authentication) :
```javascript
km.user.isLogged()
  .then((response) => {
   // see https://github.com/mzabriskie/axios#response-schema
   // for the content of response
  }).catch((err) => {
   // see https://github.com/mzabriskie/axios#handling-errors
   // for the content of err
  })
```

## Example

```javascript
const Keymetrics = require('km.js')

let km = new Keymetrics().use('standalone', {
  refresh_token: 'token'
})

// retrieve our buckets
km.bucket.retrieveAll()
  .then((res) => {
    // find our bucket
    let bucket = res.data.find(bucket => bucket.name === 'Keymetrics')

    // connect to realtime data of a bucket
    km.realtime.subscribe(bucket._id).catch(console.error)

    // attach handler on specific realtime data
    km.realtime.on(`${bucket.public_id}:connected`, () => console.log('connected to realtime'))
    km.realtime.on(`${bucket.public_id}:*:status`, (data) => console.log(data.server_name))

    // we can also unsubscribe from a bucket realtime data
    setTimeout(() => {
      km.realtime.unsubscribe(bucket._id).catch(console.error)
    }, 5000)
  })
  .catch(console.error)
```

### Realtime

All realtime data are broadcasted with the following pattern :

```
bucket_public_id:server_name:data_method
```

For example :

```javascript
// here i listen on the status data for
// the server "my_server" on the bucket with
// the public id 4398545
km.realtime.on(`4398545:my_server:status`, (data) => {
  console.log(data.server_name))
}
```

## Route definition

```
km.data.status.retrieve ===> GET /api/bucket/:id/data/status
km.data.heapdump.retrieve ===> GET /api/bucket/:id/data/heapdump/:filename
km.data.events.retrieve ===> POST /api/bucket/:id/data/events
km.data.events.retrieveMetadatas ===> GET /api/bucket/:id/data/events/eventsKeysByApp
km.data.events.retrieveHistogram ===> POST /api/bucket/:id/data/events/stats
km.data.events.deleteAll ===> DELETE /api/bucket/:id/data/events/delete_all
km.data.exceptions.retrieve ===> POST /api/bucket/:id/data/exceptions
km.data.exceptions.retrieveSummary ===> GET /api/bucket/:id/data/exceptions/summary
km.data.exceptions.deleteAll ===> POST /api/bucket/:id/data/exceptions/delete_all
km.data.exceptions.delete ===> POST /api/bucket/:id/data/exceptions/delete
km.data.processes.retrieveEvents ===> POST /api/bucket/:id/data/processEvents
km.data.processes.retrieveDeployments ===> POST /api/bucket/:id/data/processEvents/deployments
km.data.monitoring.retrieveHistogram ===> POST /api/bucket/:id/data/monitoring
km.data.probes.retrieveHistogram ===> POST /api/bucket/:id/data/probes/histogram
km.data.probes.retrieveMetadatas ===> POST /api/bucket/:id/data/probes
km.data.transactions.retrieveHistogram ===> POST /api/bucket/:id/data/transactions/v2/histogram
km.data.transactions.retrieveSummary ===> POST /api/bucket/:id/data/transactions/v2/histogram
km.data.transactions.deleteAll ===> POST /api/bucket/:id/data/transactions/v2/delete_all
km.bucket.sendFeedback ===> PUT /api/bucket/:id/feedback
km.bucket.retrieveUsers ===> GET /api/bucket/:id/users_authorized
km.bucket.currentRole ===> GET /api/bucket/:id/current_role
km.bucket.setNotificationState ===> POST /api/bucket/:id/manage_notif
km.bucket.inviteUser ===> POST /api/bucket/:id/add_user
km.bucket.removeInvitation ===> DELETE /api/bucket/:id/invitation/:email
km.bucket.removeUser ===> POST /api/bucket/:id/remove_user
km.bucket.setUserRole ===> POST /api/bucket/:id/promote_user
km.bucket.retrieveAll ===> GET /api/bucket/
km.bucket.create ===> POST /api/bucket/create_classic
km.bucket.claimTrial ===> PUT /api/bucket/:id/start_trial
km.bucket.upgrade ===> POST /api/bucket/:id/upgrade
km.bucket.retrieve ===> GET /api/bucket/:id
km.bucket.update ===> PUT /api/bucket/:id
km.bucket.retrieveServers ===> GET /api/bucket/:id/meta_servers
km.bucket.getSubscription ===> GET /api/bucket/:id/subscription
km.bucket.destroy ===> DELETE /api/bucket/:id
km.bucket.transferOwnership ===> POST /api/bucket/:id/transfer_ownership
km.auth.retrieveToken ===> POST /api/oauth/token
km.auth.revoke ===> POST /api/oauth/revoke
km.user.getOtp ===> GET /api/users/otp
km.user.addOtp ===> POST /api/users/otp
km.user.removeOtp ===> DELETE /api/users/otp
km.user.isLogged ===> GET /api/users/isLogged
km.user.register ===> GET /api/users/register
km.user.show ===> GET /api/users/show/:id
km.user.attachCreditCard ===> POST /api/users/payment/
km.user.listSubscriptions ===> GET /api/users/payment/subcriptions
km.user.listCharges ===> GET /api/users/payment/charges
km.user.fetchCreditCards ===> GET /api/users/payment/cards
km.user.fetchCreditCard ===> GET /api/users/payment/card/:card_id
km.user.fetchDefaultCreditCard ===> GET /api/users/payment/card
km.user.updateCreditCard ===> PUT /api/users/payment/card
km.user.deleteCreditCard ===> DELETE /api/users/payment/card/:card_id
km.user.setDefaultCard ===> POST /api/users/payment/card/:card_id/default
km.user.fetchMetadata ===> GET /api/users/payment/card/stripe_metadata
km.user.updateMetadata ===> PUT /api/users/payment/stripe_metadata
km.user.update ===> PUT /api/users/update
km.user.listProviders ===> GET /api/users/integrations
km.user.addProvider ===> POST /api/users/integrations
km.user.deleteProvider ===> DELETE /api/users/integrations/:name
```

## Tasks

```
# Browserify + Babelify to ES5 (output to ./dist/keymetrics.es5.js)
$ npm run build
# Browserify + Babelify + Uglify (output to ./dist/keymetrics.min.js)
$ npm run dist
# Generate documentation
$ npm run doc
```

## License

Apache 2.0
