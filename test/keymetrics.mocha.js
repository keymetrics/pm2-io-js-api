

const should = require('should');
const Keymetrics = require('..');
const pm2 = require('pm2');

describe('Keymetrics General Tests', function() {
  var keymetrics;
  var current_bucket;

  this.timeout(5000);

  after(function(done) {
    pm2._pre_interact('delete', done);
  });

  before(function(done) {
    // Simulate connection to bucket
    pm2.interact('rlapdvm6nrap9us', 'oa1ys1d0qcipp13', 'machine-name', function(err) {
      done();
    });
  });
  it('should instanciate class', function() {
    keymetrics = new Keymetrics();
  });

  it('should use standalone token', function() {
    return keymetrics.use('standalone', {
      refresh_token: 'gkmzdze4rfinwlgngaea4zyhyzcp8o1z3296qmgtn8winscy0gv1hhqc7rtzgia2'
    })
  });

  // Why does it open the browser?
  it.skip('should use full auth', function() {
    return keymetrics.use('embed', {
      client_id: 'my-oauth-client-id'
    })
  });

  it.skip('wrapper idea', function(done) {
    var monitoring = keymetrics.subscribe('PUBLIC_ID');

    monitoring.on('connected', function() {
      console.log('Connected to realtime');
    });

    // monitoring.app1 (keep same data struct than front v1? Aggs by apps + per servers
    // monitoring.server1.app1.custom_metric_1
    // monitoring.server1
  });


  it('should retrieve buckets', function() {
    return keymetrics.bucket.retrieveAll()
      .then((res) => {
        should.exists(res);
        current_bucket = res.data[0];
        // why it is hidden? (admin or user or developer token)
        // should(current_bucket.secret_id).not.eql('hidden');
        // ++ when we get this, auto connect pm2 programatically
        should.exists(current_bucket.secret_id);
      })
  });

  // add test wrong bucket id

  it('should subscribe to realtime', function(done) {
    console.log(`Subscribing in realtime to ${current_bucket._id}`);

    keymetrics
      .realtime
      .on(`${current_bucket.public_id}:connected`, () => {
        console.log('connected to realtime')
        done();
      })

    keymetrics
      .realtime
      .subscribe(current_bucket._id)
  });


  // .once?
  it('should receive status', function(done) {
    return keymetrics
      .realtime
      .on(`${current_bucket.public_id}:*:status`, (data) => {
        console.log(data.server_name);
        done();
      });
  });

  it('should unsubscribe', function() {
    return keymetrics.realtime
      .unsubscribe(current_bucket._id)
      .catch(console.error)
  });
});
