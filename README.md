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
km.user.retrieve()
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
km.user.otp.retrieve -> GET /api/users/otp
km.user.otp.enable -> POST /api/users/otp
km.user.otp.disable -> DELETE /api/users/otp
km.user.providers.retrieve -> GET /api/users/integrations
km.user.providers.add -> POST /api/users/integrations
km.user.providers.remove -> DELETE /api/users/integrations/:name
km.user.retrieve -> GET /api/users/isLogged
km.user.show -> GET /api/users/show/:id
km.user.attachCreditCard -> POST /api/users/payment/
km.user.listSubscriptions -> GET /api/users/payment/subcriptions
km.user.listCharges -> GET /api/users/payment/charges
km.user.fetchCreditCard -> GET /api/users/payment/card/:card_id
km.user.fetchDefaultCreditCard -> GET /api/users/payment/card
km.user.updateCreditCard -> PUT /api/users/payment/card
km.user.deleteCreditCard -> DELETE /api/users/payment/card/:card_id
km.user.setDefaultCard -> POST /api/users/payment/card/:card_id/default
km.user.fetchMetadata -> GET /api/users/payment/card/stripe_metadata
km.user.updateMetadata -> PUT /api/users/payment/stripe_metadata
km.user.update -> PUT /api/users/update
km.bucket.sendFeedback -> PUT /api/bucket/:id/feedback
km.bucket.retrieveUsers -> GET /api/bucket/:id/users_authorized
km.bucket.currentRole -> GET /api/bucket/:id/current_role
km.bucket.setNotificationState -> POST /api/bucket/:id/manage_notif
km.bucket.inviteUser -> POST /api/bucket/:id/add_user
km.bucket.removeInvitation -> DELETE /api/bucket/:id/invitation/:email
km.bucket.removeUser -> POST /api/bucket/:id/remove_user
km.bucket.setUserRole -> POST /api/bucket/:id/promote_user
km.bucket.retrieveAll -> GET /api/bucket/
km.bucket.create -> POST /api/bucket/create_classic
km.bucket.claimTrial -> PUT /api/bucket/:id/start_trial
km.bucket.upgrade -> POST /api/bucket/:id/upgrade
km.bucket.retrieve -> GET /api/bucket/:id
km.bucket.update -> PUT /api/bucket/:id
km.bucket.retrieveServers -> GET /api/bucket/:id/meta_servers
km.bucket.getSubscription -> GET /api/bucket/:id/subscription
km.bucket.destroy -> DELETE /api/bucket/:id
km.bucket.transferOwnership -> POST /api/bucket/:id/transfer_ownership
km.bucket.retrieveCharges -> GET /api/bucket/:id/payment/charges
km.data.status.retrieve -> GET /api/bucket/:id/data/status
km.data.heapdump.retrieve -> GET /api/bucket/:id/data/heapdump/:filename
km.data.events.retrieve -> POST /api/bucket/:id/data/events
km.data.events.retrieveMetadatas -> GET /api/bucket/:id/data/events/eventsKeysByApp
km.data.events.retrieveHistogram -> POST /api/bucket/:id/data/events/stats
km.data.events.deleteAll -> DELETE /api/bucket/:id/data/events/delete_all
km.data.exceptions.retrieve -> POST /api/bucket/:id/data/exceptions
km.data.exceptions.retrieveSummary -> GET /api/bucket/:id/data/exceptions/summary
km.data.exceptions.deleteAll -> POST /api/bucket/:id/data/exceptions/delete_all
km.data.exceptions.delete -> POST /api/bucket/:id/data/exceptions/delete
km.data.processes.retrieveEvents -> POST /api/bucket/:id/data/processEvents
km.data.processes.retrieveDeployments -> POST /api/bucket/:id/data/processEvents/deployments
km.data.metrics.retrieveAggregations -> POST /api/bucket/:id/data/metrics/aggregations
km.data.metrics.retrieveMetadatas -> POST /api/bucket/:id/data/metrics
km.data.transactions.retrieveHistogram -> POST /api/bucket/:id/data/transactions/v2/histogram
km.data.transactions.retrieveSummary -> POST /api/bucket/:id/data/transactions/v2/histogram
km.data.transactions.delete -> POST /api/bucket/:id/data/transactions/v2/delete
km.data.dependencies.retrieve -> POST /api/bucket/:id/data/dependencies/
km.data.outliers.retrieve -> POST /api/bucket/:id/data/outliers/
km.dashboard.retrieveAll -> GET /api/bucket/:id/dashboard/
km.dashboard.retrieve -> GET /api/bucket/:id/dashboard/:dashid
km.dashboard.remove -> DELETE /api/bucket/:id/dashboard/:dashid
km.dashboard.update -> POST /api/bucket/:id/dashboard/:dashId
km.dashboard.create -> PUT /api/bucket/:id/dashboard/
km.orchestration.selfSend -> POST /api/bucket/:id/balance
km.actions.triggerAction -> POST /api/bucket/:id/actions/trigger
km.actions.triggerPM2Action -> POST /api/bucket/:id/actions/triggerPM2Action
km.actions.triggerPM2ScopedAction -> POST /api/bucket/:id/actions/triggerPM2ScopedAction
km.actions.triggerScopedAction -> POST /api/bucket/:id/actions/triggerScopedAction
km.actions.retrieve -> POST /api/bucket/:id/actions/listScopedActions
km.actions.remove -> POST /api/bucket/:id/actions/deleteScopedAction
km.auth.retrieveToken -> POST /api/oauth/token
km.auth.register -> GET /api/users/register
km.auth.revoke -> POST /api/oauth/revoke
km.misc.retrievePM2Version -> GET /api/misc/release/pm2
km.misc.retrieveNodeRelease -> GET /api/misc/release/nodejs/:version
km.misc.retrievePlans -> GET /api/misc/plans
km.user.otp.retrieve -> GET /api/users/otp
km.user.otp.enable -> POST /api/users/otp
km.user.otp.disable -> DELETE /api/users/otp
km.user.providers.retrieve -> GET /api/users/integrations
km.user.providers.add -> POST /api/users/integrations
km.user.providers.remove -> DELETE /api/users/integrations/:name
km.user.retrieve -> GET /api/users/isLogged
km.user.show -> GET /api/users/show/:id
km.user.attachCreditCard -> POST /api/users/payment/
km.user.listSubscriptions -> GET /api/users/payment/subcriptions
km.user.listCharges -> GET /api/users/payment/charges
km.user.fetchCreditCard -> GET /api/users/payment/card/:card_id
km.user.fetchDefaultCreditCard -> GET /api/users/payment/card
km.user.updateCreditCard -> PUT /api/users/payment/card
km.user.deleteCreditCard -> DELETE /api/users/payment/card/:card_id
km.user.setDefaultCard -> POST /api/users/payment/card/:card_id/default
km.user.fetchMetadata -> GET /api/users/payment/card/stripe_metadata
km.user.updateMetadata -> PUT /api/users/payment/stripe_metadata
km.user.update -> PUT /api/users/update
km.tokens.retrieve -> GET /api/users/token/
km.tokens.remove -> DELETE /api/users/token/:id
km.tokens.create -> PUT /api/users/token/
km.bucket.sendFeedback -> PUT /api/bucket/:id/feedback
km.bucket.retrieveUsers -> GET /api/bucket/:id/users_authorized
km.bucket.currentRole -> GET /api/bucket/:id/current_role
km.bucket.setNotificationState -> POST /api/bucket/:id/manage_notif
km.bucket.inviteUser -> POST /api/bucket/:id/add_user
km.bucket.removeInvitation -> DELETE /api/bucket/:id/invitation/:email
km.bucket.removeUser -> POST /api/bucket/:id/remove_user
km.bucket.setUserRole -> POST /api/bucket/:id/promote_user
km.bucket.retrieveAll -> GET /api/bucket/
km.bucket.create -> POST /api/bucket/create_classic
km.bucket.claimTrial -> PUT /api/bucket/:id/start_trial
km.bucket.upgrade -> POST /api/bucket/:id/upgrade
km.bucket.retrieve -> GET /api/bucket/:id
km.bucket.update -> PUT /api/bucket/:id
km.bucket.retrieveServers -> GET /api/bucket/:id/meta_servers
km.bucket.getSubscription -> GET /api/bucket/:id/subscription
km.bucket.destroy -> DELETE /api/bucket/:id
km.bucket.transferOwnership -> POST /api/bucket/:id/transfer_ownership
km.bucket.retrieveCharges -> GET /api/bucket/:id/payment/charges
km.data.status.retrieve -> GET /api/bucket/:id/data/status
km.data.heapdump.retrieve -> GET /api/bucket/:id/data/heapdump/:filename
km.data.events.retrieve -> POST /api/bucket/:id/data/events
km.data.events.retrieveMetadatas -> GET /api/bucket/:id/data/events/eventsKeysByApp
km.data.events.retrieveHistogram -> POST /api/bucket/:id/data/events/stats
km.data.events.deleteAll -> DELETE /api/bucket/:id/data/events/delete_all
km.data.exceptions.retrieve -> POST /api/bucket/:id/data/exceptions
km.data.exceptions.retrieveSummary -> GET /api/bucket/:id/data/exceptions/summary
km.data.exceptions.deleteAll -> POST /api/bucket/:id/data/exceptions/delete_all
km.data.exceptions.delete -> POST /api/bucket/:id/data/exceptions/delete
km.data.processes.retrieveEvents -> POST /api/bucket/:id/data/processEvents
km.data.processes.retrieveDeployments -> POST /api/bucket/:id/data/processEvents/deployments
km.data.metrics.retrieveAggregations -> POST /api/bucket/:id/data/metrics/aggregations
km.data.metrics.retrieveMetadatas -> POST /api/bucket/:id/data/metrics
km.data.transactions.retrieveHistogram -> POST /api/bucket/:id/data/transactions/v2/histogram
km.data.transactions.retrieveSummary -> POST /api/bucket/:id/data/transactions/v2/histogram
km.data.transactions.delete -> POST /api/bucket/:id/data/transactions/v2/delete
km.data.dependencies.retrieve -> POST /api/bucket/:id/data/dependencies/
km.data.outliers.retrieve -> POST /api/bucket/:id/data/outliers/
km.dashboard.retrieveAll -> GET /api/bucket/:id/dashboard/
km.dashboard.retrieve -> GET /api/bucket/:id/dashboard/:dashid
km.dashboard.remove -> DELETE /api/bucket/:id/dashboard/:dashid
km.dashboard.update -> POST /api/bucket/:id/dashboard/:dashId
km.dashboard.create -> PUT /api/bucket/:id/dashboard/
km.orchestration.selfSend -> POST /api/bucket/:id/balance
km.actions.triggerAction -> POST /api/bucket/:id/actions/trigger
km.actions.triggerPM2Action -> POST /api/bucket/:id/actions/triggerPM2Action
km.actions.triggerPM2ScopedAction -> POST /api/bucket/:id/actions/triggerPM2ScopedAction
km.actions.triggerScopedAction -> POST /api/bucket/:id/actions/triggerScopedAction
km.actions.retrieve -> POST /api/bucket/:id/actions/listScopedActions
km.actions.remove -> POST /api/bucket/:id/actions/deleteScopedAction
km.auth.retrieveToken -> POST /api/oauth/token
km.auth.register -> GET /api/users/register
km.auth.revoke -> POST /api/oauth/revoke
km.misc.retrievePM2Version -> GET /api/misc/release/pm2
km.misc.retrieveNodeRelease -> GET /api/misc/release/nodejs/:version
km.misc.retrievePlans -> GET /api/misc/plans
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
