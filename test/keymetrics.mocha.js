

const should = require('should');
const Keymetrics = require('..');

describe('Keymetrics General Tests', function() {
  var keymetrics;
  var current_bucket;

  this.timeout(5000);

  it('should instanciate class', function() {
    keymetrics = new Keymetrics();
  });

  it('should use standalone token', function() {
    return keymetrics.use('standalone', {
      refresh_token: '2cmgq3zhztqwd00r8dz4za25rgsettl5fuv96vbqq6mrgbyoa2n75q6vq11m7wmz'
    })
  });

  // Why does it open the browser?
  it.skip('should use full auth', function() {
    return keymetrics.use('embed', {
      client_id: 'my-oauth-client-id'
    })
  });

  it('should retrieve buckets', function() {
    return keymetrics.bucket.retrieveAll()
      .then((res) => {
        should.exists(res);
        current_bucket = res.data[0];
        should(current_bucket.secret_id).not.eql('hidden');
        should.exists(current_bucket.secret_id);
        return Promise.resolve();
      })
  });

  // test wrong bucket id

  it('should subscribe to realtime', function() {
    console.log(`Subscribing in realtime to ${current_bucket.secret_id}`);

    var event = `${current_bucket.public_id}:connected`;
    // Multibucket OK
    return keymetrics
      .realtime
      .on(event, () => {
        console.log('connected to realtime')
      })

    return keymetrics
      .realtime
      .subscribe(current_bucket)
      .catch(console.error)

  });

  // .once?

  it('should subscribe', function(done) {
    return keymetrics
      .realtime
      .on(`${current_bucket.public_id}:*:status`, (data) => {
        console.log(data.server_name);
        done();
      });
  });

  it('should unsubscribe', function(done) {
    return keymetrics.realtime
      .unsubscribe(current_bucket._id)
      .catch(console.error)
  });

});
