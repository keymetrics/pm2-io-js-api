'use strict';

const Http = require('./utils/http.js');
const Primus = require('./services/primus.js');
const moment = require('moment');

/**
 * Realtime
 * @memberof Keymetrics
 * @constructor
 * @alias realtime
 *
 * @param {object} opts Options
 */

function Realtime(opts) {
  var self = this;
  if (!(this instanceof Realtime)) {
    return new Realtime(opts);
  }

  this.bus = opts.bus;
  this.root_url = opts.root_url;
  this.http = new Http();

  this.bus.on('bucket:active', function(data) {
    self.bucket_id = data.id;
    self.public_id = data.public_id;
  });

  this.bus.on('auth:ready', function(data) {
    // update Authorization header
    self.http.set('Authorization', 'Bearer ' + data.access_token);
    self.token = data.access_token;
  })
};

Realtime.prototype.testVerbose = function() {
  if (typeof window != 'undefined' && window.VERBOSE)
    return true;
  else if (process.env.DEBUG === '*')
    return true;
  else
    return false;
};


/**
 * Register bucket and start websocket
 *
 * @param {function} cb callback
 */
Realtime.prototype.init = function(data) {
  var self = this;

  var web_url = data.endpoint;
  var ws_url = data.endpoint;

  /***********************************
   * Development url overidde
   * test if on client or NodeJs
   ***********************************/

  if (typeof window != 'undefined') {
    if (window.location.host.indexOf('km.io') > -1) {
      web_url = web_url.replace('9001', '3000');
      ws_url = ws_url.replace('9001', '4020');
    }
    window.API_URL = web_url;
  } else if (process.env.NODE_ENV == "development") {
    web_url = web_url.replace('9001', '3000');
    ws_url = ws_url.replace('9001', '4020');
  }

  if (self.primus)
    self.primus.destroy();

  var primus = self.primus = Primus.connect(ws_url || '/', {
    strategy: ['online', 'timeout', 'disconnect'],
    reconnect: {
      max: Infinity // Number: The max delay before we try to reconnect.
        ,
      min: 100 // Number: The minimum delay before we try reconnect.
        ,
      retries: 20 // Number: How many times we shoult try to reconnect.
    }
  });

  // used to authenticate
  primus.on('outgoing::url', function(url) {
    url.query = 'token=' + self.token;
  });

  primus.on('open', function() {
    if (self.testVerbose())
      console.log('[%s] Realtime connected', moment().format());
    self.bus.emit('realtime:on');
  });

  primus.on('close', function() {
    if (self.testVerbose())
      console.log('[%s] Realtime disconnected', moment().format());
    self.bus.emit('realtime:off');
  });

  primus.on('reconnect', function() {
    if (self.testVerbose())
      console.log('[%s] Realtime re-connection', moment().format());
    self.bus.emit('realtime:reconnect');
  });

  primus.on('reconnect timeout', function() {
    if (self.testVerbose())
      console.log('Websocket reconnect timeout');
    self.bus.emit('realtime:reconnect-timeout');
  });

  primus.on('connection:success', function(myself) {
    if (self.testVerbose())
      console.log('Websocket user authenticated');
    self.bus.emit('realtime:auth');

    self.primus.write({
      action: 'active',
      public_id: data.public_id
    });
  });

  primus.on('error', function(err) {
    self.bus.emit('error:realtime', err);
  })

  primus.on('data:incoming', function(data) {
    Object.keys(data).forEach(function(event_key) {

      if (self.testVerbose())
        console.log('data:' + data.server_name + ':' + event_key, data[event_key]);

      if (event_key === 'status')
        self.bus.emit('raw:' + data.server_name + ':' + event_key, data[event_key]);
      else
        self.bus.emit('data:' + data.server_name + ':' + event_key, data[event_key]);
    });
  });

  primus.on('heapdump:ready', function(data) {
    var event_name = 'data:' + data.server_name + ':' + data.app_name + ':' + data.pm_id + ':' + 'heapdump:ready';
    if (self.testVerbose()) console.log(event_name, data);
    self.bus.emit(event_name, data);
  });

  primus.on('cpuprofile:ready', function(data) {
    var event_name = 'data:' + data.server_name + ':' + data.app_name + ':' + data.pm_id + ':' + 'cpuprofile:ready';
    if (self.testVerbose()) console.log(event_name, data);
    self.bus.emit(event_name, data);
  });
};

Realtime.prototype.close = function() {
  if (this.primus)
    this.primus.destroy();
};

/**
 * Unregister from bucket and destroy websocket connection
 * @param {function} cb callback
 */
Realtime.prototype.unregister = function() {
  var self = this;

  if (this.primus)
    this.primus.write({
      action: 'inactive',
      public_id: self.public_id
    });
  self.close();
};

module.exports = Realtime;
