(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Keymetrics = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
'use strict';

var pkg = require('./package.json');

var config = {
  API_URL: 'https://app.keymetrics.io',
  OAUTH_AUTHORIZE_ENDPOINT: '/api/oauth/authorize',
  OAUTH_CLIENT_ID: '795984050',
  ENVIRONNEMENT: process && process.versions && process.versions.node ? 'node' : 'browser',
  VERSION: pkg.version,
  // put in debug when using km.io with browser OR when DEBUG=true with nodejs
  IS_DEBUG: typeof window !== 'undefined' && window.location.host.match(/km.(io|local)/) || typeof process !== 'undefined' && process.env.DEBUG === 'true'
};

module.exports = Object.assign({}, config);

}).call(this,require('_process'))
},{"./package.json":34,"_process":33}],2:[function(require,module,exports){
module.exports = require('./lib/axios');
},{"./lib/axios":4}],3:[function(require,module,exports){
(function (process){
'use strict';

var utils = require('./../utils');
var settle = require('./../core/settle');
var buildURL = require('./../helpers/buildURL');
var parseHeaders = require('./../helpers/parseHeaders');
var isURLSameOrigin = require('./../helpers/isURLSameOrigin');
var createError = require('../core/createError');
var btoa = (typeof window !== 'undefined' && window.btoa && window.btoa.bind(window)) || require('./../helpers/btoa');

module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data;
    var requestHeaders = config.headers;

    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    var request = new XMLHttpRequest();
    var loadEvent = 'onreadystatechange';
    var xDomain = false;

    // For IE 8/9 CORS support
    // Only supports POST and GET calls and doesn't returns the response headers.
    // DON'T do this for testing b/c XMLHttpRequest is mocked, not XDomainRequest.
    if (process.env.NODE_ENV !== 'test' &&
        typeof window !== 'undefined' &&
        window.XDomainRequest && !('withCredentials' in request) &&
        !isURLSameOrigin(config.url)) {
      request = new window.XDomainRequest();
      loadEvent = 'onload';
      xDomain = true;
      request.onprogress = function handleProgress() {};
      request.ontimeout = function handleTimeout() {};
    }

    // HTTP basic authentication
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password || '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

    request.open(config.method.toUpperCase(), buildURL(config.url, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    request.timeout = config.timeout;

    // Listen for ready state
    request[loadEvent] = function handleLoad() {
      if (!request || (request.readyState !== 4 && !xDomain)) {
        return;
      }

      // The request errored out and we didn't get a response, this will be
      // handled by onerror instead
      // With one exception: request that using file: protocol, most browsers
      // will return status as 0 even though it's a successful request
      if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
        return;
      }

      // Prepare the response
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
      var response = {
        data: responseData,
        // IE sends 1223 instead of 204 (https://github.com/mzabriskie/axios/issues/201)
        status: request.status === 1223 ? 204 : request.status,
        statusText: request.status === 1223 ? 'No Content' : request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };

      settle(resolve, reject, response);

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      reject(createError('timeout of ' + config.timeout + 'ms exceeded', config, 'ECONNABORTED',
        request));

      // Clean up request
      request = null;
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (utils.isStandardBrowserEnv()) {
      var cookies = require('./../helpers/cookies');

      // Add xsrf header
      var xsrfValue = (config.withCredentials || isURLSameOrigin(config.url)) && config.xsrfCookieName ?
          cookies.read(config.xsrfCookieName) :
          undefined;

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val);
        }
      });
    }

    // Add withCredentials to request if needed
    if (config.withCredentials) {
      request.withCredentials = true;
    }

    // Add responseType to request if needed
    if (config.responseType) {
      try {
        request.responseType = config.responseType;
      } catch (e) {
        // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
        // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
        if (config.responseType !== 'json') {
          throw e;
        }
      }
    }

    // Handle progress if needed
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }

    if (config.cancelToken) {
      // Handle cancellation
      config.cancelToken.promise.then(function onCanceled(cancel) {
        if (!request) {
          return;
        }

        request.abort();
        reject(cancel);
        // Clean up request
        request = null;
      });
    }

    if (requestData === undefined) {
      requestData = null;
    }

    // Send the request
    request.send(requestData);
  });
};

}).call(this,require('_process'))
},{"../core/createError":10,"./../core/settle":13,"./../helpers/btoa":17,"./../helpers/buildURL":18,"./../helpers/cookies":20,"./../helpers/isURLSameOrigin":22,"./../helpers/parseHeaders":24,"./../utils":26,"_process":33}],4:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var bind = require('./helpers/bind');
var Axios = require('./core/Axios');
var defaults = require('./defaults');

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @return {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);

  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context);

  // Copy context to instance
  utils.extend(instance, context);

  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Factory for creating new instances
axios.create = function create(instanceConfig) {
  return createInstance(utils.merge(defaults, instanceConfig));
};

// Expose Cancel & CancelToken
axios.Cancel = require('./cancel/Cancel');
axios.CancelToken = require('./cancel/CancelToken');
axios.isCancel = require('./cancel/isCancel');

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = require('./helpers/spread');

module.exports = axios;

// Allow use of default import syntax in TypeScript
module.exports.default = axios;

},{"./cancel/Cancel":5,"./cancel/CancelToken":6,"./cancel/isCancel":7,"./core/Axios":8,"./defaults":15,"./helpers/bind":16,"./helpers/spread":25,"./utils":26}],5:[function(require,module,exports){
'use strict';

/**
 * A `Cancel` is an object that is thrown when an operation is canceled.
 *
 * @class
 * @param {string=} message The message.
 */
function Cancel(message) {
  this.message = message;
}

Cancel.prototype.toString = function toString() {
  return 'Cancel' + (this.message ? ': ' + this.message : '');
};

Cancel.prototype.__CANCEL__ = true;

module.exports = Cancel;

},{}],6:[function(require,module,exports){
'use strict';

var Cancel = require('./Cancel');

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function.
 */
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }

  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });

  var token = this;
  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      return;
    }

    token.reason = new Cancel(message);
    resolvePromise(token.reason);
  });
}

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};

/**
 * Returns an object that contains a new `CancelToken` and a function that, when called,
 * cancels the `CancelToken`.
 */
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};

module.exports = CancelToken;

},{"./Cancel":5}],7:[function(require,module,exports){
'use strict';

module.exports = function isCancel(value) {
  return !!(value && value.__CANCEL__);
};

},{}],8:[function(require,module,exports){
'use strict';

var defaults = require('./../defaults');
var utils = require('./../utils');
var InterceptorManager = require('./InterceptorManager');
var dispatchRequest = require('./dispatchRequest');
var isAbsoluteURL = require('./../helpers/isAbsoluteURL');
var combineURLs = require('./../helpers/combineURLs');

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 */
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
Axios.prototype.request = function request(config) {
  /*eslint no-param-reassign:0*/
  // Allow for axios('example/url'[, config]) a la fetch API
  if (typeof config === 'string') {
    config = utils.merge({
      url: arguments[0]
    }, arguments[1]);
  }

  config = utils.merge(defaults, this.defaults, { method: 'get' }, config);
  config.method = config.method.toLowerCase();

  // Support baseURL config
  if (config.baseURL && !isAbsoluteURL(config.url)) {
    config.url = combineURLs(config.baseURL, config.url);
  }

  // Hook up interceptors middleware
  var chain = [dispatchRequest, undefined];
  var promise = Promise.resolve(config);

  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    chain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    chain.push(interceptor.fulfilled, interceptor.rejected);
  });

  while (chain.length) {
    promise = promise.then(chain.shift(), chain.shift());
  }

  return promise;
};

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, config) {
    return this.request(utils.merge(config || {}, {
      method: method,
      url: url
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, data, config) {
    return this.request(utils.merge(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});

module.exports = Axios;

},{"./../defaults":15,"./../helpers/combineURLs":19,"./../helpers/isAbsoluteURL":21,"./../utils":26,"./InterceptorManager":9,"./dispatchRequest":11}],9:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

function InterceptorManager() {
  this.handlers = [];
}

/**
 * Add a new interceptor to the stack
 *
 * @param {Function} fulfilled The function to handle `then` for a `Promise`
 * @param {Function} rejected The function to handle `reject` for a `Promise`
 *
 * @return {Number} An ID used to remove interceptor later
 */
InterceptorManager.prototype.use = function use(fulfilled, rejected) {
  this.handlers.push({
    fulfilled: fulfilled,
    rejected: rejected
  });
  return this.handlers.length - 1;
};

/**
 * Remove an interceptor from the stack
 *
 * @param {Number} id The ID that was returned by `use`
 */
InterceptorManager.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

/**
 * Iterate over all the registered interceptors
 *
 * This method is particularly useful for skipping over any
 * interceptors that may have become `null` calling `eject`.
 *
 * @param {Function} fn The function to call for each interceptor
 */
InterceptorManager.prototype.forEach = function forEach(fn) {
  utils.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};

module.exports = InterceptorManager;

},{"./../utils":26}],10:[function(require,module,exports){
'use strict';

var enhanceError = require('./enhanceError');

/**
 * Create an Error with the specified message, config, error code, request and response.
 *
 * @param {string} message The error message.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The created error.
 */
module.exports = function createError(message, config, code, request, response) {
  var error = new Error(message);
  return enhanceError(error, config, code, request, response);
};

},{"./enhanceError":12}],11:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var transformData = require('./transformData');
var isCancel = require('../cancel/isCancel');
var defaults = require('../defaults');

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
module.exports = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Ensure headers exist
  config.headers = config.headers || {};

  // Transform request data
  config.data = transformData(
    config.data,
    config.headers,
    config.transformRequest
  );

  // Flatten headers
  config.headers = utils.merge(
    config.headers.common || {},
    config.headers[config.method] || {},
    config.headers || {}
  );

  utils.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  var adapter = config.adapter || defaults.adapter;

  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData(
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData(
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};

},{"../cancel/isCancel":7,"../defaults":15,"./../utils":26,"./transformData":14}],12:[function(require,module,exports){
'use strict';

/**
 * Update an Error with the specified config, error code, and response.
 *
 * @param {Error} error The error to update.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The error.
 */
module.exports = function enhanceError(error, config, code, request, response) {
  error.config = config;
  if (code) {
    error.code = code;
  }
  error.request = request;
  error.response = response;
  return error;
};

},{}],13:[function(require,module,exports){
'use strict';

var createError = require('./createError');

/**
 * Resolve or reject a Promise based on response status.
 *
 * @param {Function} resolve A function that resolves the promise.
 * @param {Function} reject A function that rejects the promise.
 * @param {object} response The response.
 */
module.exports = function settle(resolve, reject, response) {
  var validateStatus = response.config.validateStatus;
  // Note: status is not exposed by XDomainRequest
  if (!response.status || !validateStatus || validateStatus(response.status)) {
    resolve(response);
  } else {
    reject(createError(
      'Request failed with status code ' + response.status,
      response.config,
      null,
      response.request,
      response
    ));
  }
};

},{"./createError":10}],14:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

/**
 * Transform the data for a request or a response
 *
 * @param {Object|String} data The data to be transformed
 * @param {Array} headers The headers for the request or response
 * @param {Array|Function} fns A single function or Array of functions
 * @returns {*} The resulting transformed data
 */
module.exports = function transformData(data, headers, fns) {
  /*eslint no-param-reassign:0*/
  utils.forEach(fns, function transform(fn) {
    data = fn(data, headers);
  });

  return data;
};

},{"./../utils":26}],15:[function(require,module,exports){
(function (process){
'use strict';

var utils = require('./utils');
var normalizeHeaderName = require('./helpers/normalizeHeaderName');

var DEFAULT_CONTENT_TYPE = {
  'Content-Type': 'application/x-www-form-urlencoded'
};

function setContentTypeIfUnset(headers, value) {
  if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
    headers['Content-Type'] = value;
  }
}

function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    // For browsers use XHR adapter
    adapter = require('./adapters/xhr');
  } else if (typeof process !== 'undefined') {
    // For node use HTTP adapter
    adapter = require('./adapters/http');
  }
  return adapter;
}

var defaults = {
  adapter: getDefaultAdapter(),

  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Content-Type');
    if (utils.isFormData(data) ||
      utils.isArrayBuffer(data) ||
      utils.isBuffer(data) ||
      utils.isStream(data) ||
      utils.isFile(data) ||
      utils.isBlob(data)
    ) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    if (utils.isObject(data)) {
      setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
      return JSON.stringify(data);
    }
    return data;
  }],

  transformResponse: [function transformResponse(data) {
    /*eslint no-param-reassign:0*/
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) { /* Ignore */ }
    }
    return data;
  }],

  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  maxContentLength: -1,

  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  }
};

defaults.headers = {
  common: {
    'Accept': 'application/json, text/plain, */*'
  }
};

utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
  defaults.headers[method] = {};
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
});

module.exports = defaults;

}).call(this,require('_process'))
},{"./adapters/http":3,"./adapters/xhr":3,"./helpers/normalizeHeaderName":23,"./utils":26,"_process":33}],16:[function(require,module,exports){
'use strict';

module.exports = function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};

},{}],17:[function(require,module,exports){
'use strict';

// btoa polyfill for IE<10 courtesy https://github.com/davidchambers/Base64.js

var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function E() {
  this.message = 'String contains an invalid character';
}
E.prototype = new Error;
E.prototype.code = 5;
E.prototype.name = 'InvalidCharacterError';

function btoa(input) {
  var str = String(input);
  var output = '';
  for (
    // initialize result and counter
    var block, charCode, idx = 0, map = chars;
    // if the next str index does not exist:
    //   change the mapping table to "="
    //   check if d has no fractional digits
    str.charAt(idx | 0) || (map = '=', idx % 1);
    // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
    output += map.charAt(63 & block >> 8 - idx % 1 * 8)
  ) {
    charCode = str.charCodeAt(idx += 3 / 4);
    if (charCode > 0xFF) {
      throw new E();
    }
    block = block << 8 | charCode;
  }
  return output;
}

module.exports = btoa;

},{}],18:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

function encode(val) {
  return encodeURIComponent(val).
    replace(/%40/gi, '@').
    replace(/%3A/gi, ':').
    replace(/%24/g, '$').
    replace(/%2C/gi, ',').
    replace(/%20/g, '+').
    replace(/%5B/gi, '[').
    replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @returns {string} The formatted url
 */
module.exports = function buildURL(url, params, paramsSerializer) {
  /*eslint no-param-reassign:0*/
  if (!params) {
    return url;
  }

  var serializedParams;
  if (paramsSerializer) {
    serializedParams = paramsSerializer(params);
  } else if (utils.isURLSearchParams(params)) {
    serializedParams = params.toString();
  } else {
    var parts = [];

    utils.forEach(params, function serialize(val, key) {
      if (val === null || typeof val === 'undefined') {
        return;
      }

      if (utils.isArray(val)) {
        key = key + '[]';
      }

      if (!utils.isArray(val)) {
        val = [val];
      }

      utils.forEach(val, function parseValue(v) {
        if (utils.isDate(v)) {
          v = v.toISOString();
        } else if (utils.isObject(v)) {
          v = JSON.stringify(v);
        }
        parts.push(encode(key) + '=' + encode(v));
      });
    });

    serializedParams = parts.join('&');
  }

  if (serializedParams) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }

  return url;
};

},{"./../utils":26}],19:[function(require,module,exports){
'use strict';

/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 * @returns {string} The combined URL
 */
module.exports = function combineURLs(baseURL, relativeURL) {
  return relativeURL
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
};

},{}],20:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

module.exports = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs support document.cookie
  (function standardBrowserEnv() {
    return {
      write: function write(name, value, expires, path, domain, secure) {
        var cookie = [];
        cookie.push(name + '=' + encodeURIComponent(value));

        if (utils.isNumber(expires)) {
          cookie.push('expires=' + new Date(expires).toGMTString());
        }

        if (utils.isString(path)) {
          cookie.push('path=' + path);
        }

        if (utils.isString(domain)) {
          cookie.push('domain=' + domain);
        }

        if (secure === true) {
          cookie.push('secure');
        }

        document.cookie = cookie.join('; ');
      },

      read: function read(name) {
        var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
        return (match ? decodeURIComponent(match[3]) : null);
      },

      remove: function remove(name) {
        this.write(name, '', Date.now() - 86400000);
      }
    };
  })() :

  // Non standard browser env (web workers, react-native) lack needed support.
  (function nonStandardBrowserEnv() {
    return {
      write: function write() {},
      read: function read() { return null; },
      remove: function remove() {}
    };
  })()
);

},{"./../utils":26}],21:[function(require,module,exports){
'use strict';

/**
 * Determines whether the specified URL is absolute
 *
 * @param {string} url The URL to test
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
module.exports = function isAbsoluteURL(url) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
};

},{}],22:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

module.exports = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs have full support of the APIs needed to test
  // whether the request URL is of the same origin as current location.
  (function standardBrowserEnv() {
    var msie = /(msie|trident)/i.test(navigator.userAgent);
    var urlParsingNode = document.createElement('a');
    var originURL;

    /**
    * Parse a URL to discover it's components
    *
    * @param {String} url The URL to be parsed
    * @returns {Object}
    */
    function resolveURL(url) {
      var href = url;

      if (msie) {
        // IE needs attribute set twice to normalize properties
        urlParsingNode.setAttribute('href', href);
        href = urlParsingNode.href;
      }

      urlParsingNode.setAttribute('href', href);

      // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
      return {
        href: urlParsingNode.href,
        protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
        host: urlParsingNode.host,
        search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
        hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
        hostname: urlParsingNode.hostname,
        port: urlParsingNode.port,
        pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
                  urlParsingNode.pathname :
                  '/' + urlParsingNode.pathname
      };
    }

    originURL = resolveURL(window.location.href);

    /**
    * Determine if a URL shares the same origin as the current location
    *
    * @param {String} requestURL The URL to test
    * @returns {boolean} True if URL shares the same origin, otherwise false
    */
    return function isURLSameOrigin(requestURL) {
      var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
      return (parsed.protocol === originURL.protocol &&
            parsed.host === originURL.host);
    };
  })() :

  // Non standard browser envs (web workers, react-native) lack needed support.
  (function nonStandardBrowserEnv() {
    return function isURLSameOrigin() {
      return true;
    };
  })()
);

},{"./../utils":26}],23:[function(require,module,exports){
'use strict';

var utils = require('../utils');

module.exports = function normalizeHeaderName(headers, normalizedName) {
  utils.forEach(headers, function processHeader(value, name) {
    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
      headers[normalizedName] = value;
      delete headers[name];
    }
  });
};

},{"../utils":26}],24:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

/**
 * Parse headers into an object
 *
 * ```
 * Date: Wed, 27 Aug 2014 08:58:49 GMT
 * Content-Type: application/json
 * Connection: keep-alive
 * Transfer-Encoding: chunked
 * ```
 *
 * @param {String} headers Headers needing to be parsed
 * @returns {Object} Headers parsed into an object
 */
module.exports = function parseHeaders(headers) {
  var parsed = {};
  var key;
  var val;
  var i;

  if (!headers) { return parsed; }

  utils.forEach(headers.split('\n'), function parser(line) {
    i = line.indexOf(':');
    key = utils.trim(line.substr(0, i)).toLowerCase();
    val = utils.trim(line.substr(i + 1));

    if (key) {
      parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
    }
  });

  return parsed;
};

},{"./../utils":26}],25:[function(require,module,exports){
'use strict';

/**
 * Syntactic sugar for invoking a function and expanding an array for arguments.
 *
 * Common use case would be to use `Function.prototype.apply`.
 *
 *  ```js
 *  function f(x, y, z) {}
 *  var args = [1, 2, 3];
 *  f.apply(null, args);
 *  ```
 *
 * With `spread` this example can be re-written.
 *
 *  ```js
 *  spread(function(x, y, z) {})([1, 2, 3]);
 *  ```
 *
 * @param {Function} callback
 * @returns {Function}
 */
module.exports = function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
};

},{}],26:[function(require,module,exports){
'use strict';

var bind = require('./helpers/bind');
var isBuffer = require('is-buffer');

/*global toString:true*/

// utils is a library of generic helper functions non-specific to axios

var toString = Object.prototype.toString;

/**
 * Determine if a value is an Array
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Array, otherwise false
 */
function isArray(val) {
  return toString.call(val) === '[object Array]';
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 */
function isArrayBuffer(val) {
  return toString.call(val) === '[object ArrayBuffer]';
}

/**
 * Determine if a value is a FormData
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an FormData, otherwise false
 */
function isFormData(val) {
  return (typeof FormData !== 'undefined') && (val instanceof FormData);
}

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
function isArrayBufferView(val) {
  var result;
  if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
    result = ArrayBuffer.isView(val);
  } else {
    result = (val) && (val.buffer) && (val.buffer instanceof ArrayBuffer);
  }
  return result;
}

/**
 * Determine if a value is a String
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a String, otherwise false
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Determine if a value is a Number
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Number, otherwise false
 */
function isNumber(val) {
  return typeof val === 'number';
}

/**
 * Determine if a value is undefined
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if the value is undefined, otherwise false
 */
function isUndefined(val) {
  return typeof val === 'undefined';
}

/**
 * Determine if a value is an Object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Object, otherwise false
 */
function isObject(val) {
  return val !== null && typeof val === 'object';
}

/**
 * Determine if a value is a Date
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Date, otherwise false
 */
function isDate(val) {
  return toString.call(val) === '[object Date]';
}

/**
 * Determine if a value is a File
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
function isFile(val) {
  return toString.call(val) === '[object File]';
}

/**
 * Determine if a value is a Blob
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Blob, otherwise false
 */
function isBlob(val) {
  return toString.call(val) === '[object Blob]';
}

/**
 * Determine if a value is a Function
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
function isFunction(val) {
  return toString.call(val) === '[object Function]';
}

/**
 * Determine if a value is a Stream
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Stream, otherwise false
 */
function isStream(val) {
  return isObject(val) && isFunction(val.pipe);
}

/**
 * Determine if a value is a URLSearchParams object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
function isURLSearchParams(val) {
  return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
}

/**
 * Trim excess whitespace off the beginning and end of a string
 *
 * @param {String} str The String to trim
 * @returns {String} The String freed of excess whitespace
 */
function trim(str) {
  return str.replace(/^\s*/, '').replace(/\s*$/, '');
}

/**
 * Determine if we're running in a standard browser environment
 *
 * This allows axios to run in a web worker, and react-native.
 * Both environments support XMLHttpRequest, but not fully standard globals.
 *
 * web workers:
 *  typeof window -> undefined
 *  typeof document -> undefined
 *
 * react-native:
 *  navigator.product -> 'ReactNative'
 */
function isStandardBrowserEnv() {
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return false;
  }
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

/**
 * Iterate over an Array or an Object invoking a function for each item.
 *
 * If `obj` is an Array callback will be called passing
 * the value, index, and complete array for each item.
 *
 * If 'obj' is an Object callback will be called passing
 * the value, key, and complete object for each property.
 *
 * @param {Object|Array} obj The object to iterate
 * @param {Function} fn The callback to invoke for each item
 */
function forEach(obj, fn) {
  // Don't bother if no value provided
  if (obj === null || typeof obj === 'undefined') {
    return;
  }

  // Force an array if not already something iterable
  if (typeof obj !== 'object' && !isArray(obj)) {
    /*eslint no-param-reassign:0*/
    obj = [obj];
  }

  if (isArray(obj)) {
    // Iterate over array values
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    // Iterate over object keys
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fn.call(null, obj[key], key, obj);
      }
    }
  }
}

/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * var result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function merge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (typeof result[key] === 'object' && typeof val === 'object') {
      result[key] = merge(result[key], val);
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 * @return {Object} The resulting value of object a
 */
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}

module.exports = {
  isArray: isArray,
  isArrayBuffer: isArrayBuffer,
  isBuffer: isBuffer,
  isFormData: isFormData,
  isArrayBufferView: isArrayBufferView,
  isString: isString,
  isNumber: isNumber,
  isObject: isObject,
  isUndefined: isUndefined,
  isDate: isDate,
  isFile: isFile,
  isBlob: isBlob,
  isFunction: isFunction,
  isStream: isStream,
  isURLSearchParams: isURLSearchParams,
  isStandardBrowserEnv: isStandardBrowserEnv,
  forEach: forEach,
  merge: merge,
  extend: extend,
  trim: trim
};

},{"./helpers/bind":16,"is-buffer":31}],27:[function(require,module,exports){
"use strict";

},{}],28:[function(require,module,exports){
(function (process){
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}

}).call(this,require('_process'))
},{"./debug":29,"_process":33}],29:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  return debug;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":32}],30:[function(require,module,exports){
(function (process){
/*!
 * EventEmitter2
 * https://github.com/hij1nx/EventEmitter2
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
;!function(undefined) {

  var isArray = Array.isArray ? Array.isArray : function _isArray(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };
  var defaultMaxListeners = 10;

  function init() {
    this._events = {};
    if (this._conf) {
      configure.call(this, this._conf);
    }
  }

  function configure(conf) {
    if (conf) {
      this._conf = conf;

      conf.delimiter && (this.delimiter = conf.delimiter);
      this._maxListeners = conf.maxListeners !== undefined ? conf.maxListeners : defaultMaxListeners;

      conf.wildcard && (this.wildcard = conf.wildcard);
      conf.newListener && (this.newListener = conf.newListener);
      conf.verboseMemoryLeak && (this.verboseMemoryLeak = conf.verboseMemoryLeak);

      if (this.wildcard) {
        this.listenerTree = {};
      }
    } else {
      this._maxListeners = defaultMaxListeners;
    }
  }

  function logPossibleMemoryLeak(count, eventName) {
    var errorMsg = '(node) warning: possible EventEmitter memory ' +
        'leak detected. ' + count + ' listeners added. ' +
        'Use emitter.setMaxListeners() to increase limit.';

    if(this.verboseMemoryLeak){
      errorMsg += ' Event name: ' + eventName + '.';
    }

    if(typeof process !== 'undefined' && process.emitWarning){
      var e = new Error(errorMsg);
      e.name = 'MaxListenersExceededWarning';
      e.emitter = this;
      e.count = count;
      process.emitWarning(e);
    } else {
      console.error(errorMsg);

      if (console.trace){
        console.trace();
      }
    }
  }

  function EventEmitter(conf) {
    this._events = {};
    this.newListener = false;
    this.verboseMemoryLeak = false;
    configure.call(this, conf);
  }
  EventEmitter.EventEmitter2 = EventEmitter; // backwards compatibility for exporting EventEmitter property

  //
  // Attention, function return type now is array, always !
  // It has zero elements if no any matches found and one or more
  // elements (leafs) if there are matches
  //
  function searchListenerTree(handlers, type, tree, i) {
    if (!tree) {
      return [];
    }
    var listeners=[], leaf, len, branch, xTree, xxTree, isolatedBranch, endReached,
        typeLength = type.length, currentType = type[i], nextType = type[i+1];
    if (i === typeLength && tree._listeners) {
      //
      // If at the end of the event(s) list and the tree has listeners
      // invoke those listeners.
      //
      if (typeof tree._listeners === 'function') {
        handlers && handlers.push(tree._listeners);
        return [tree];
      } else {
        for (leaf = 0, len = tree._listeners.length; leaf < len; leaf++) {
          handlers && handlers.push(tree._listeners[leaf]);
        }
        return [tree];
      }
    }

    if ((currentType === '*' || currentType === '**') || tree[currentType]) {
      //
      // If the event emitted is '*' at this part
      // or there is a concrete match at this patch
      //
      if (currentType === '*') {
        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+1));
          }
        }
        return listeners;
      } else if(currentType === '**') {
        endReached = (i+1 === typeLength || (i+2 === typeLength && nextType === '*'));
        if(endReached && tree._listeners) {
          // The next element has a _listeners, add it to the handlers.
          listeners = listeners.concat(searchListenerTree(handlers, type, tree, typeLength));
        }

        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            if(branch === '*' || branch === '**') {
              if(tree[branch]._listeners && !endReached) {
                listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], typeLength));
              }
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            } else if(branch === nextType) {
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+2));
            } else {
              // No match on this one, shift into the tree but not in the type array.
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            }
          }
        }
        return listeners;
      }

      listeners = listeners.concat(searchListenerTree(handlers, type, tree[currentType], i+1));
    }

    xTree = tree['*'];
    if (xTree) {
      //
      // If the listener tree will allow any match for this part,
      // then recursively explore all branches of the tree
      //
      searchListenerTree(handlers, type, xTree, i+1);
    }

    xxTree = tree['**'];
    if(xxTree) {
      if(i < typeLength) {
        if(xxTree._listeners) {
          // If we have a listener on a '**', it will catch all, so add its handler.
          searchListenerTree(handlers, type, xxTree, typeLength);
        }

        // Build arrays of matching next branches and others.
        for(branch in xxTree) {
          if(branch !== '_listeners' && xxTree.hasOwnProperty(branch)) {
            if(branch === nextType) {
              // We know the next element will match, so jump twice.
              searchListenerTree(handlers, type, xxTree[branch], i+2);
            } else if(branch === currentType) {
              // Current node matches, move into the tree.
              searchListenerTree(handlers, type, xxTree[branch], i+1);
            } else {
              isolatedBranch = {};
              isolatedBranch[branch] = xxTree[branch];
              searchListenerTree(handlers, type, { '**': isolatedBranch }, i+1);
            }
          }
        }
      } else if(xxTree._listeners) {
        // We have reached the end and still on a '**'
        searchListenerTree(handlers, type, xxTree, typeLength);
      } else if(xxTree['*'] && xxTree['*']._listeners) {
        searchListenerTree(handlers, type, xxTree['*'], typeLength);
      }
    }

    return listeners;
  }

  function growListenerTree(type, listener) {

    type = typeof type === 'string' ? type.split(this.delimiter) : type.slice();

    //
    // Looks for two consecutive '**', if so, don't add the event at all.
    //
    for(var i = 0, len = type.length; i+1 < len; i++) {
      if(type[i] === '**' && type[i+1] === '**') {
        return;
      }
    }

    var tree = this.listenerTree;
    var name = type.shift();

    while (name !== undefined) {

      if (!tree[name]) {
        tree[name] = {};
      }

      tree = tree[name];

      if (type.length === 0) {

        if (!tree._listeners) {
          tree._listeners = listener;
        }
        else {
          if (typeof tree._listeners === 'function') {
            tree._listeners = [tree._listeners];
          }

          tree._listeners.push(listener);

          if (
            !tree._listeners.warned &&
            this._maxListeners > 0 &&
            tree._listeners.length > this._maxListeners
          ) {
            tree._listeners.warned = true;
            logPossibleMemoryLeak.call(this, tree._listeners.length, name);
          }
        }
        return true;
      }
      name = type.shift();
    }
    return true;
  }

  // By default EventEmitters will print a warning if more than
  // 10 listeners are added to it. This is a useful default which
  // helps finding memory leaks.
  //
  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.

  EventEmitter.prototype.delimiter = '.';

  EventEmitter.prototype.setMaxListeners = function(n) {
    if (n !== undefined) {
      this._maxListeners = n;
      if (!this._conf) this._conf = {};
      this._conf.maxListeners = n;
    }
  };

  EventEmitter.prototype.event = '';


  EventEmitter.prototype.once = function(event, fn) {
    return this._once(event, fn, false);
  };

  EventEmitter.prototype.prependOnceListener = function(event, fn) {
    return this._once(event, fn, true);
  };

  EventEmitter.prototype._once = function(event, fn, prepend) {
    this._many(event, 1, fn, prepend);
    return this;
  };

  EventEmitter.prototype.many = function(event, ttl, fn) {
    return this._many(event, ttl, fn, false);
  }

  EventEmitter.prototype.prependMany = function(event, ttl, fn) {
    return this._many(event, ttl, fn, true);
  }

  EventEmitter.prototype._many = function(event, ttl, fn, prepend) {
    var self = this;

    if (typeof fn !== 'function') {
      throw new Error('many only accepts instances of Function');
    }

    function listener() {
      if (--ttl === 0) {
        self.off(event, listener);
      }
      return fn.apply(this, arguments);
    }

    listener._origin = fn;

    this._on(event, listener, prepend);

    return self;
  };

  EventEmitter.prototype.emit = function() {

    this._events || init.call(this);

    var type = arguments[0];

    if (type === 'newListener' && !this.newListener) {
      if (!this._events.newListener) {
        return false;
      }
    }

    var al = arguments.length;
    var args,l,i,j;
    var handler;

    if (this._all && this._all.length) {
      handler = this._all.slice();
      if (al > 3) {
        args = new Array(al);
        for (j = 0; j < al; j++) args[j] = arguments[j];
      }

      for (i = 0, l = handler.length; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          handler[i].call(this, type);
          break;
        case 2:
          handler[i].call(this, type, arguments[1]);
          break;
        case 3:
          handler[i].call(this, type, arguments[1], arguments[2]);
          break;
        default:
          handler[i].apply(this, args);
        }
      }
    }

    if (this.wildcard) {
      handler = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handler, ns, this.listenerTree, 0);
    } else {
      handler = this._events[type];
      if (typeof handler === 'function') {
        this.event = type;
        switch (al) {
        case 1:
          handler.call(this);
          break;
        case 2:
          handler.call(this, arguments[1]);
          break;
        case 3:
          handler.call(this, arguments[1], arguments[2]);
          break;
        default:
          args = new Array(al - 1);
          for (j = 1; j < al; j++) args[j - 1] = arguments[j];
          handler.apply(this, args);
        }
        return true;
      } else if (handler) {
        // need to make copy of handlers because list can change in the middle
        // of emit call
        handler = handler.slice();
      }
    }

    if (handler && handler.length) {
      if (al > 3) {
        args = new Array(al - 1);
        for (j = 1; j < al; j++) args[j - 1] = arguments[j];
      }
      for (i = 0, l = handler.length; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          handler[i].call(this);
          break;
        case 2:
          handler[i].call(this, arguments[1]);
          break;
        case 3:
          handler[i].call(this, arguments[1], arguments[2]);
          break;
        default:
          handler[i].apply(this, args);
        }
      }
      return true;
    } else if (!this._all && type === 'error') {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }

    return !!this._all;
  };

  EventEmitter.prototype.emitAsync = function() {

    this._events || init.call(this);

    var type = arguments[0];

    if (type === 'newListener' && !this.newListener) {
        if (!this._events.newListener) { return Promise.resolve([false]); }
    }

    var promises= [];

    var al = arguments.length;
    var args,l,i,j;
    var handler;

    if (this._all) {
      if (al > 3) {
        args = new Array(al);
        for (j = 1; j < al; j++) args[j] = arguments[j];
      }
      for (i = 0, l = this._all.length; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          promises.push(this._all[i].call(this, type));
          break;
        case 2:
          promises.push(this._all[i].call(this, type, arguments[1]));
          break;
        case 3:
          promises.push(this._all[i].call(this, type, arguments[1], arguments[2]));
          break;
        default:
          promises.push(this._all[i].apply(this, args));
        }
      }
    }

    if (this.wildcard) {
      handler = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handler, ns, this.listenerTree, 0);
    } else {
      handler = this._events[type];
    }

    if (typeof handler === 'function') {
      this.event = type;
      switch (al) {
      case 1:
        promises.push(handler.call(this));
        break;
      case 2:
        promises.push(handler.call(this, arguments[1]));
        break;
      case 3:
        promises.push(handler.call(this, arguments[1], arguments[2]));
        break;
      default:
        args = new Array(al - 1);
        for (j = 1; j < al; j++) args[j - 1] = arguments[j];
        promises.push(handler.apply(this, args));
      }
    } else if (handler && handler.length) {
      handler = handler.slice();
      if (al > 3) {
        args = new Array(al - 1);
        for (j = 1; j < al; j++) args[j - 1] = arguments[j];
      }
      for (i = 0, l = handler.length; i < l; i++) {
        this.event = type;
        switch (al) {
        case 1:
          promises.push(handler[i].call(this));
          break;
        case 2:
          promises.push(handler[i].call(this, arguments[1]));
          break;
        case 3:
          promises.push(handler[i].call(this, arguments[1], arguments[2]));
          break;
        default:
          promises.push(handler[i].apply(this, args));
        }
      }
    } else if (!this._all && type === 'error') {
      if (arguments[1] instanceof Error) {
        return Promise.reject(arguments[1]); // Unhandled 'error' event
      } else {
        return Promise.reject("Uncaught, unspecified 'error' event.");
      }
    }

    return Promise.all(promises);
  };

  EventEmitter.prototype.on = function(type, listener) {
    return this._on(type, listener, false);
  };

  EventEmitter.prototype.prependListener = function(type, listener) {
    return this._on(type, listener, true);
  };

  EventEmitter.prototype.onAny = function(fn) {
    return this._onAny(fn, false);
  };

  EventEmitter.prototype.prependAny = function(fn) {
    return this._onAny(fn, true);
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype._onAny = function(fn, prepend){
    if (typeof fn !== 'function') {
      throw new Error('onAny only accepts instances of Function');
    }

    if (!this._all) {
      this._all = [];
    }

    // Add the function to the event listener collection.
    if(prepend){
      this._all.unshift(fn);
    }else{
      this._all.push(fn);
    }

    return this;
  }

  EventEmitter.prototype._on = function(type, listener, prepend) {
    if (typeof type === 'function') {
      this._onAny(type, listener);
      return this;
    }

    if (typeof listener !== 'function') {
      throw new Error('on only accepts instances of Function');
    }
    this._events || init.call(this);

    // To avoid recursion in the case that type == "newListeners"! Before
    // adding it to the listeners, first emit "newListeners".
    this.emit('newListener', type, listener);

    if (this.wildcard) {
      growListenerTree.call(this, type, listener);
      return this;
    }

    if (!this._events[type]) {
      // Optimize the case of one listener. Don't need the extra array object.
      this._events[type] = listener;
    }
    else {
      if (typeof this._events[type] === 'function') {
        // Change to array.
        this._events[type] = [this._events[type]];
      }

      // If we've already got an array, just add
      if(prepend){
        this._events[type].unshift(listener);
      }else{
        this._events[type].push(listener);
      }

      // Check for listener leak
      if (
        !this._events[type].warned &&
        this._maxListeners > 0 &&
        this._events[type].length > this._maxListeners
      ) {
        this._events[type].warned = true;
        logPossibleMemoryLeak.call(this, this._events[type].length, type);
      }
    }

    return this;
  }

  EventEmitter.prototype.off = function(type, listener) {
    if (typeof listener !== 'function') {
      throw new Error('removeListener only takes instances of Function');
    }

    var handlers,leafs=[];

    if(this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);
    }
    else {
      // does not use listeners(), so no side effect of creating _events[type]
      if (!this._events[type]) return this;
      handlers = this._events[type];
      leafs.push({_listeners:handlers});
    }

    for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
      var leaf = leafs[iLeaf];
      handlers = leaf._listeners;
      if (isArray(handlers)) {

        var position = -1;

        for (var i = 0, length = handlers.length; i < length; i++) {
          if (handlers[i] === listener ||
            (handlers[i].listener && handlers[i].listener === listener) ||
            (handlers[i]._origin && handlers[i]._origin === listener)) {
            position = i;
            break;
          }
        }

        if (position < 0) {
          continue;
        }

        if(this.wildcard) {
          leaf._listeners.splice(position, 1);
        }
        else {
          this._events[type].splice(position, 1);
        }

        if (handlers.length === 0) {
          if(this.wildcard) {
            delete leaf._listeners;
          }
          else {
            delete this._events[type];
          }
        }

        this.emit("removeListener", type, listener);

        return this;
      }
      else if (handlers === listener ||
        (handlers.listener && handlers.listener === listener) ||
        (handlers._origin && handlers._origin === listener)) {
        if(this.wildcard) {
          delete leaf._listeners;
        }
        else {
          delete this._events[type];
        }

        this.emit("removeListener", type, listener);
      }
    }

    function recursivelyGarbageCollect(root) {
      if (root === undefined) {
        return;
      }
      var keys = Object.keys(root);
      for (var i in keys) {
        var key = keys[i];
        var obj = root[key];
        if ((obj instanceof Function) || (typeof obj !== "object") || (obj === null))
          continue;
        if (Object.keys(obj).length > 0) {
          recursivelyGarbageCollect(root[key]);
        }
        if (Object.keys(obj).length === 0) {
          delete root[key];
        }
      }
    }
    recursivelyGarbageCollect(this.listenerTree);

    return this;
  };

  EventEmitter.prototype.offAny = function(fn) {
    var i = 0, l = 0, fns;
    if (fn && this._all && this._all.length > 0) {
      fns = this._all;
      for(i = 0, l = fns.length; i < l; i++) {
        if(fn === fns[i]) {
          fns.splice(i, 1);
          this.emit("removeListenerAny", fn);
          return this;
        }
      }
    } else {
      fns = this._all;
      for(i = 0, l = fns.length; i < l; i++)
        this.emit("removeListenerAny", fns[i]);
      this._all = [];
    }
    return this;
  };

  EventEmitter.prototype.removeListener = EventEmitter.prototype.off;

  EventEmitter.prototype.removeAllListeners = function(type) {
    if (arguments.length === 0) {
      !this._events || init.call(this);
      return this;
    }

    if (this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      var leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);

      for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
        var leaf = leafs[iLeaf];
        leaf._listeners = null;
      }
    }
    else if (this._events) {
      this._events[type] = null;
    }
    return this;
  };

  EventEmitter.prototype.listeners = function(type) {
    if (this.wildcard) {
      var handlers = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handlers, ns, this.listenerTree, 0);
      return handlers;
    }

    this._events || init.call(this);

    if (!this._events[type]) this._events[type] = [];
    if (!isArray(this._events[type])) {
      this._events[type] = [this._events[type]];
    }
    return this._events[type];
  };

  EventEmitter.prototype.eventNames = function(){
    return Object.keys(this._events);
  }

  EventEmitter.prototype.listenerCount = function(type) {
    return this.listeners(type).length;
  };

  EventEmitter.prototype.listenersAny = function() {

    if(this._all) {
      return this._all;
    }
    else {
      return [];
    }

  };

  if (typeof define === 'function' && define.amd) {
     // AMD. Register as an anonymous module.
    define(function() {
      return EventEmitter;
    });
  } else if (typeof exports === 'object') {
    // CommonJS
    module.exports = EventEmitter;
  }
  else {
    // Browser global.
    window.EventEmitter2 = EventEmitter;
  }
}();

}).call(this,require('_process'))
},{"_process":33}],31:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],32:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],33:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],34:[function(require,module,exports){
module.exports={
  "name": "kmjs-core",
  "version": "0.3.0",
  "description": "Official Keymetrics API Client for Javascript",
  "main": "index.js",
  "engines": {
    "node": ">=4.0"
  },
  "scripts": {
    "test": "mocha test/*",
    "build": "browserify -s Keymetrics -r ./ > ./dist/keymetrics.es5.js",
    "dist": "browserify -s Keymetrics -r ./ | uglifyjs -c warnings=false -m > ./dist/keymetrics.es5.min.js",
    "doc": "jsdoc -r ./src --readme ./README.md -d doc -t ./node_modules/minami",
    "clean": "rm dist/*"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/keymetrics/km.js.git"
  },
  "keywords": [
    "keymetrics",
    "api",
    "dashboard",
    "monitoring",
    "wrapper"
  ],
  "author": "Keymetrics Team",
  "license": "Apache 2.0",
  "bugs": {
    "url": "https://github.com/keymetrics/km.js/issues"
  },
  "homepage": "https://github.com/keymetrics/km.js#readme",
  "dependencies": {
    "async": "^2.4.1",
    "axios": "^0.16.2",
    "babel-core": "^6.26.0",
    "debug": "^2.6.8",
    "eventemitter2": "^4.1.0",
    "ws": "^3.0.0"
  },
  "devDependencies": {
    "babel-preset-es2015": "*",
    "babel-preset-stage-2": "*",
    "babelify": "*",
    "browserify": "^13.1.0",
    "jsdoc": "^3.4.2",
    "minami": "^1.1.1",
    "mocha": "^3.0.2",
    "pm2": "latest",
    "should": "*",
    "standard": "^10.0.2",
    "uglify-js": "*"
  },
  "browserify": {
    "debug": "true",
    "transform": [
      [
        "babelify",
        {
          "presets": [
            [
              "babel-preset-es2015",
              {
                "debug": "true",
                "sourceMaps": "true"
              }
            ]
          ]
        }
      ]
    ]
  },
  "browser": {
    "./src/auth_strategies/embed_strategy.js": false,
    "ws": false
  },
  "standard": {
    "ignore": [
      "dist/**",
      "examples/**",
      "test/**"
    ]
  }
}

},{}],35:[function(require,module,exports){
module.exports={"user":[{"route":{"name":"/api/users/otp","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"409","description":"the otp is already enabled for the user, you can only delete it","optional":false},{"type":"200","description":"the otp can be registered for the account, return the full response","optional":false}],"response":[{"name":"user","type":"object","description":"user model","optional":false,"defaultvalue":null},{"name":"key","type":"string","description":"otp secret key","optional":false,"defaultvalue":null},{"name":"qrImage","type":"string","description":"url to the QrCode","optional":false,"defaultvalue":null}],"name":"getOtp","longname":"User.getOtp","scope":"route"},{"route":{"name":"/api/users/otp","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"body":[{"name":"otpKey","type":"string","description":"secret key used to generate OTP code","optional":false,"defaultvalue":null},{"name":"otpToken","type":"string","description":"a currently valid OTP code generated with the otpKey","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"missing parameters","optional":false},{"type":"403","description":"the code asked to add the OTP from user account is invalid","optional":false},{"type":"500","description":"error from database","optional":false},{"type":"200","description":"the otp has been registered for the user","optional":false}],"name":"addOtp","longname":"User.addOtp","scope":"route"},{"route":{"name":"/api/users/otp","type":"DELETE"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"query":[{"name":"otpToken","type":"string","description":"a currently valid OTP code","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"missing parameters","optional":false},{"type":"403","description":"the code asked to remove the OTP from user account is invalid","optional":false},{"type":"500","description":"error from database","optional":false},{"type":"200","description":"the otp has been deleted for the user","optional":false}],"name":"removeOtp","longname":"User.removeOtp","scope":"route"},{"route":{"name":"/api/users/isLogged","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"200","description":"the user has been retrieved","optional":false}],"response":[{"name":"user","type":"object","description":"user model","optional":false,"defaultvalue":null}],"name":"isLogged","longname":"User.isLogged","scope":"route"},{"route":{"name":"/api/users/register","type":"GET"},"body":[{"name":"username","type":"string","description":"","optional":false,"defaultvalue":null},{"name":"email","type":"string","description":"","optional":false,"defaultvalue":null},{"name":"password","type":"string","description":"","optional":false,"defaultvalue":null},{"name":"role","type":"string","description":"job title in user company","optional":true,"defaultvalue":null},{"name":"company","type":"string","description":"company name","optional":true,"defaultvalue":null},{"name":"company_size","type":"string","description":"company size","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"either the registeration of new user is disabled or\nthe database failed to register the user","optional":false},{"type":"409","description":"the user field are already used by another user","optional":false},{"type":"200","description":"the user has been created","optional":false}],"response":[{"name":"user","type":"object","description":"user model","optional":false,"defaultvalue":null},{"name":"access_token","type":"object","description":"access token issued for the user","optional":false,"defaultvalue":null},{"name":"refreshToken","type":"object","description":"refresh token issued for the user","optional":false,"defaultvalue":null}],"name":"register","longname":"User.register","scope":"route","authentication":false},{"route":{"name":"/api/users/show/:id","type":"GET"},"params":[{"name":":id","type":"string","description":"user id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"invalid parameters (no id provided)","optional":false},{"type":"404","description":"no user account where found","optional":false},{"type":"200","description":"the mail has been sent to the provided email","optional":false}],"response":[{"name":"String","type":"","description":"email user email","optional":false,"defaultvalue":null},{"name":"String","type":"","description":"username user pseudo","optional":false,"defaultvalue":null}],"name":"show","longname":"User.show","scope":"route","authentication":false},{"route":{"name":"/api/users/payment/","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"body":[{"name":"token","type":"string","description":"card token generated by stripe","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"missing parameters","optional":false},{"type":"500","description":"stripe error","optional":false},{"type":"200","description":"succesfully added the card","optional":false}],"response":[{"name":"data","type":"object","description":"stripe credit card object","optional":false,"defaultvalue":null}],"name":"attachCreditCard","longname":"User.attachCreditCard","scope":"route"},{"route":{"name":"/api/users/payment/subcriptions","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"200","description":"succesfully retrieved the charges","optional":false}],"response":[{"name":"data","type":"array","description":"list of stripe subscriptions object","optional":false,"defaultvalue":null}],"name":"listSubscriptions","longname":"User.listSubscriptions","scope":"route"},{"route":{"name":"/api/users/payment/charges","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"200","description":"succesfully retieved the charges","optional":false}],"response":[{"name":"data","type":"array","description":"list of stripe charges object","optional":false,"defaultvalue":null}],"name":"listCharges","longname":"User.listCharges","scope":"route"},{"route":{"name":"/api/users/payment/cards","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"200","description":"succesfully retieved the charges","optional":false}],"response":[{"name":"data","type":"array","description":"list of stripe cards object","optional":false,"defaultvalue":null}],"name":"fetchCreditCards","longname":"User.fetchCreditCards","scope":"route"},{"route":{"name":"/api/users/payment/card/:card_id","type":"GET"},"authentication":true,"params":[{"name":":card_id","type":"string","description":"the stripe id of the card","optional":false}],"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"400","description":"missing parameters card_id","optional":false},{"type":"200","description":"succesfully retieved the card","optional":false}],"response":[{"name":"data","type":"array","description":"stripe card object","optional":false,"defaultvalue":null}],"name":"fetchCreditCard","longname":"User.fetchCreditCard","scope":"route"},{"route":{"name":"/api/users/payment/card","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"404","description":"the user doesn't have any default card","optional":false},{"type":"200","description":"succesfully retieved the card","optional":false}],"response":[{"name":"data","type":"array","description":"stripe card object","optional":false,"defaultvalue":null}],"name":"fetchDefaultCreditCard","longname":"User.fetchDefaultCreditCard","scope":"route"},{"route":{"name":"/api/users/payment/card","type":"PUT"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"body":[{"name":"id","type":"string","description":"stripe card id","optional":false,"defaultvalue":null},{"name":"metadata","type":"object","description":"the metadata you can update","optional":true,"defaultvalue":null},{"name":"metadata.address_line1","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"metadata.address_country","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"metadata.address_zip","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"metadata.address_city","type":"string","description":"","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"400","description":"missing parameters, you need to specify a card","optional":false},{"type":"200","description":"succesfully updated the card","optional":false}],"response":[{"name":"data","type":"array","description":"stripe card object","optional":false,"defaultvalue":null}],"name":"updateCreditCard","longname":"User.updateCreditCard","scope":"route"},{"route":{"name":"/api/users/payment/card/:card_id","type":"DELETE"},"authentication":true,"params":[{"name":":card_id","type":"string","description":"the stripe id of the card","optional":false}],"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"400","description":"missing parameters card_id","optional":false},{"type":"200","description":"succesfully retieved the card","optional":false},{"type":"403","description":"the user must have one card active when having a subscription","optional":false}],"response":[{"name":".","type":"object","description":"stripe card object","optional":false,"defaultvalue":null}],"name":"deleteCreditCard","longname":"User.deleteCreditCard","scope":"route"},{"route":{"name":"/api/users/payment/card/:card_id/default","type":"POST"},"authentication":true,"params":[{"name":":card_id","type":"string","description":"the stripe id of the card","optional":false}],"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"400","description":"missing parameters card_id","optional":false},{"type":"200","description":"succesfully set the card as default","optional":false}],"response":[{"name":"data","type":"object","description":"stripe card object","optional":false,"defaultvalue":null}],"name":"setDefaultCard","longname":"User.setDefaultCard","scope":"route"},{"route":{"name":"/api/users/payment/card/stripe_metadata","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"400","description":"missing parameters card_id","optional":false},{"type":"200","description":"succesfully retrieved the metadata","optional":false}],"response":[{"name":".","type":"object","description":"stripe metadata object","optional":false,"defaultvalue":null}],"name":"fetchMetadata","longname":"User.fetchMetadata","scope":"route"},{"route":{"name":"/api/users/payment/stripe_metadata","type":"PUT"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"body":[{"name":"metadata","type":"object","description":"the metadata you can update","optional":false,"defaultvalue":null},{"name":"metadata.vat_number","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"metadata.company_name","type":"string","description":"","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"stripe error","optional":false},{"type":"400","description":"missing parameters, you need to specify a card","optional":false},{"type":"200","description":"succesfully updated the card","optional":false}],"response":[{"name":"data","type":"array","description":"stripe customer metadata object","optional":false,"defaultvalue":null}],"name":"updateMetadata","longname":"User.updateMetadata","scope":"route"},{"route":{"name":"/api/users/update","type":"PUT"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"body":[{"name":"username","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"email","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"old_password","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"new_password","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"info","type":"object","description":"","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"missing parameters, no data to update","optional":false},{"type":"403","description":"when updating the password, it need a new one","optional":false},{"type":"406","description":"when updating the password, the old one is false","optional":false},{"type":"409","description":"when updating email or username\n another user already have one of those two","optional":false},{"type":"200","description":"succesfully updated the card","optional":false}],"response":[{"name":".","type":"object","description":"user object","optional":false,"defaultvalue":null}],"name":"update","longname":"User.update","scope":"route"},{"route":{"name":"/api/users/integrations","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"200","description":"succesfully retrieved providers","optional":false}],"response":[{"name":".","type":"array","description":"array of providers for user account","optional":false,"defaultvalue":null}],"name":"listProviders","longname":"User.listProviders","scope":"route"},{"route":{"name":"/api/users/integrations","type":"POST"},"authentication":true,"body":[{"name":"provider","type":"string","description":"the provider name","optional":false,"defaultvalue":null},{"name":"email","type":"string","description":"the email the user have on the provider","optional":false,"defaultvalue":null}],"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"invalid parameters","optional":false},{"type":"403","description":"the user already have this provider","optional":false},{"type":"200","description":"succesfully added the provider","optional":false}],"name":"addProvider","longname":"User.addProvider","scope":"route"},{"route":{"name":"/api/users/integrations/:name","type":"DELETE"},"authentication":true,"params":[{"name":":name","type":"string","description":"the provider name","optional":false}],"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"invalid parameters or provider isn't implemented","optional":false},{"type":"403","description":"the provider isn't enabled","optional":false},{"type":"200","description":"succesfully removed the provider","optional":false}],"name":"deleteProvider","longname":"User.deleteProvider","scope":"route"}],"bucket":[{"route":{"name":"/api/bucket/:id/feedback","type":"PUT"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"feedback","type":"string","description":"the feedback text","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"missing feedback field","optional":false},{"type":"200","description":"succesfully registered the feedback","optional":false}],"response":[{"name":"feedback","type":"string","description":"the feedback that hasn't been registered","optional":false,"defaultvalue":null}],"name":"sendFeedback","longname":"Bucket.sendFeedback","scope":"route"},{"name":"retrieveUsers","route":{"name":"/api/bucket/:id/users_authorized","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved bucket's members","optional":false}],"response":[{"name":".","type":"array","description":"a array of user containing their email, username and roles","optional":false,"defaultvalue":null}],"longname":"Bucket.retrieveUsers","scope":"route"},{"name":"currentRole","route":{"name":"/api/bucket/:id/current_role","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"200","description":"succesfully retrieved the use role","optional":false}],"response":[{"name":"role","type":"string","description":"the user role","optional":false,"defaultvalue":null}],"longname":"Bucket.currentRole","scope":"route"},{"route":{"name":"/api/bucket/:id/manage_notif","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"email","type":"string","description":"the user email","optional":false,"defaultvalue":null},{"name":"state","type":"string","description":"the notification state you want to set for that user\n (either 'email' or 'nonde)","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"404","description":"user not found","optional":false}],"response":[{"name":".","type":"array","description":"array of state for each user","optional":false,"defaultvalue":null}],"name":"setNotificationState","longname":"Bucket.setNotificationState","scope":"route"},{"name":"inviteUser","route":{"name":"/api/bucket/:id/add_user","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"email","type":"string","description":"the email of the user","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"missing/invalid parameters","optional":false},{"type":"403","description":"you cant invit more users because you hit the bucket limit","optional":false},{"type":"200","description":"succesfully invited the user (either directly or by email)","optional":false}],"response":[{"name":"invitations","type":"array","description":"the list of invitations actually active","optional":false,"defaultvalue":null}],"longname":"Bucket.inviteUser","scope":"route"},{"route":{"name":"/api/bucket/:id/invitation/:email","type":"DELETE"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false},{"name":":email","type":"string","description":"the email of the invitation you want to delete","optional":false}],"code":[{"type":"400","description":"invalid/missing parameters","optional":false},{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully deleted the invitation","optional":false}],"response":[{"name":"invitations","type":"array","description":"the list of invitations actually active","optional":false,"defaultvalue":null}],"name":"removeInvitation","longname":"Bucket.removeInvitation","scope":"route"},{"route":{"name":"/api/bucket/:id/remove_user","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"email","type":"string","description":"the email of the user you want to remove","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"missing/invalid parameters","optional":false},{"type":"404","description":"user not found","optional":false},{"type":"403","description":"impossible to remove the owner from the bucket","optional":false},{"type":"500","description":"database error","optional":false}],"response":[{"name":".","type":"array","description":"a array of user containing their email, username and roles","optional":false,"defaultvalue":null}],"name":"removeUser","longname":"Bucket.removeUser","scope":"route"},{"route":{"name":"/api/bucket/:id/promote_user","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"email","type":"string","description":"the email of the user you want to change the role","optional":false,"defaultvalue":null},{"name":"role","type":"string","description":"the role you want to set","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"invalid/missing parameters","optional":false},{"type":"404","description":"user not found","optional":false},{"type":"403","description":"impossible to set the role of the owner","optional":false}],"response":[{"name":".","type":"array","description":"a array of user containing their email, username and roles","optional":false,"defaultvalue":null}],"name":"setUserRole","longname":"Bucket.setUserRole","scope":"route"},{"name":"retrieveAll","route":{"name":"/api/bucket/","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully fetched bucket","optional":false}],"response":[{"name":".","type":"array","description":"array of buckets","optional":false,"defaultvalue":null}],"longname":"Bucket.retrieveAll","scope":"route"},{"name":"create","route":{"name":"/api/bucket/create_classic","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"body":[{"name":"name","type":"string","description":"the name of the bucket","optional":false,"defaultvalue":null},{"name":"comment","type":"string","description":"any comments that will be written under the bucket name","optional":true,"defaultvalue":null},{"name":"app_url","type":"string","description":"","optional":true,"defaultvalue":null}],"code":[{"type":"400","description":"missing parameters","optional":false},{"type":"403","description":"you cant create any more bucket","optional":false},{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully created a bucket","optional":false}],"response":[{"name":"bucket","type":"object","description":"the created bucket","optional":false,"defaultvalue":null}],"longname":"Bucket.create","scope":"route"},{"route":{"name":"/api/bucket/:id/start_trial","type":"PUT"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"400","description":"can't claim trial","optional":false},{"type":"200","description":"trial launched","optional":false}],"response":[{"name":"duration","type":"string","description":"the duration of the trial","optional":false,"defaultvalue":null},{"name":"plan","type":"string","description":"the plan of the trial","optional":false,"defaultvalue":null}],"name":"claimTrial","longname":"Bucket.claimTrial","scope":"route"},{"name":"upgrade","route":{"name":"/api/bucket/:id/upgrade","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"plan","type":"string","description":"name of the plan to upgrade to","optional":false,"defaultvalue":null},{"name":"stripe_token","type":"string","description":"a card token created by stripe","optional":true,"defaultvalue":null},{"name":"coupon_id","type":"string","description":"the id of the stripe coupon","optional":true,"defaultvalue":null}],"code":[{"type":"400","description":"missing/invalid parameters","optional":false},{"type":"403","description":"need a credit card OR not allowed to subscribe to the plan","optional":false},{"type":"500","description":"stripe/database error","optional":false},{"type":"200","description":"succesfully upgraded","optional":false}],"response":[{"name":"bucket","type":"object","description":"the bucket object","optional":false,"defaultvalue":null},{"name":"subscription","type":"object","description":"the subscription object attached to the subscription","optional":false,"defaultvalue":null}],"longname":"Bucket.upgrade","scope":"route"},{"name":"retrieve","route":{"name":"/api/bucket/:id","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"200","description":"succesfully retrieved the bucket","optional":false}],"response":[{"name":".","type":"object","description":"bucket object","optional":false,"defaultvalue":null}],"longname":"Bucket.retrieve","scope":"route"},{"route":{"name":"/api/bucket/:id","type":"PUT"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"name","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"comment","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"app_url","type":"string","description":"","optional":true,"defaultvalue":null},{"name":"configuration","type":"string","description":"","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"missing parameters","optional":false}],"response":[{"name":".","type":"object","description":"bucket object","optional":false,"defaultvalue":null}],"name":"update","longname":"Bucket.update","scope":"route"},{"name":"retrieveServers","route":{"name":"/api/bucket/:id/meta_servers","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved the server's metadata","optional":false}],"response":[{"name":".","type":"array","description":"servers metadata","optional":false,"defaultvalue":null}],"longname":"Bucket.retrieveServers","scope":"route"},{"name":"getSubscription","route":{"name":"/api/bucket/:id/subscription","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"404","description":"the bucket doesnt have any subscription","optional":false},{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved the subscription","optional":false}],"response":[{"name":".","type":"object","description":"subscription object","optional":false,"defaultvalue":null}],"longname":"Bucket.getSubscription","scope":"route"},{"route":{"name":"/api/bucket/:id","type":"DELETE"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully deleted the bucket","optional":false}],"response":[{"name":".","type":"object","description":"the deleted bucket","optional":false,"defaultvalue":null}],"name":"destroy","longname":"Bucket.destroy","scope":"route"},{"route":{"name":"/api/bucket/:id/transfer_ownership","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"new_owner","type":"string","description":"the wanted owner's email","optional":false,"defaultvalue":null}],"code":[{"type":"400","description":"Missing/invalid parameters","optional":false},{"type":"404","description":"user not found","optional":false},{"type":"403","description":"the new owner need to have a active credit card","optional":false},{"type":"200","description":"succesfully transfered the bucket, old owner is now admin","optional":false}],"response":[{"name":".","type":"object","description":"bucket object","optional":false,"defaultvalue":null}],"name":"transferOwnership","longname":"Bucket.transferOwnership","scope":"route"}],"data":{"status":[{"route":{"name":"/api/bucket/:id/data/status","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"tags":[{"originalTitle":"reponse","title":"reponse","text":"{Array} . array of servers status","value":"{Array} . array of servers status","optional":false,"type":null}],"name":"retrieve","longname":"Data.status.retrieve","scope":"route"}],"heapdump":[{"route":{"name":"/api/bucket/:id/data/heapdump/:filename","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false},{"name":":filename","type":"string","description":"filename","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"invalid parameters","optional":false}],"response":[{"name":".","type":"file","description":"return a file","optional":false,"defaultvalue":null}],"name":"retrieve","longname":"Data.heapdump.retrieve","scope":"route"}],"events":[{"route":{"name":"/api/bucket/:id/data/events","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"event_name","type":"string","description":"the event name to retrieve","optional":false,"defaultvalue":null},{"name":"app_name","type":"string","description":"filter events by app source","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter events by server source","optional":true,"defaultvalue":null},{"name":"limit","type":"number","description":"limit the number of events to retrieve","optional":true,"defaultvalue":100},{"name":"offset","type":"number","description":"offset research by X","optional":true,"defaultvalue":0}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"invalid parameters","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"array of events","optional":false,"defaultvalue":null}],"name":"retrieve","longname":"Data.events.retrieve","scope":"route"},{"route":{"name":"/api/bucket/:id/data/events/eventsKeysByApp","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"invalid parameters","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"array of object representing events emitted for each application name","optional":false,"defaultvalue":null}],"name":"retrieveMetadatas","longname":"Data.events.retrieveMetadatas","scope":"route"},{"route":{"name":"/api/bucket/:id/data/events/stats","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"event_name","type":"string","description":"the event name to retrieve","optional":false,"defaultvalue":null},{"name":"app_name","type":"string","description":"filter events by app source","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter events by server source","optional":true,"defaultvalue":null},{"name":"days","type":"number","description":"limit the number of days of data","optional":true,"defaultvalue":2},{"name":"interval","type":"string","description":"interval of time between two point","optional":true,"defaultvalue":"minute"}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"invalid parameters","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"array of point (each point is one dimensional array, X are at 0 and Y at 1)","optional":false,"defaultvalue":null}],"name":"retrieveHistogram","longname":"Data.events.retrieveHistogram","scope":"route"},{"route":{"name":"/api/bucket/:id/data/events/delete_all","type":"DELETE"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully deleted data","optional":false}],"response":[{"name":".","type":"array","description":"array of object representing events emitted for each application name","optional":false,"defaultvalue":null}],"name":"deleteAll","longname":"Data.events.deleteAll","scope":"route"}],"exceptions":[{"route":{"name":"/api/bucket/:id/data/exceptions","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"server_name","type":"string","description":"filter exceptions by server source","optional":true,"defaultvalue":null},{"name":"app_name","type":"string","description":"filter exceptions by app source","optional":true,"defaultvalue":null},{"name":"before","type":"string","description":"filter out exceptions older than X (in minutes)","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"array of exceptions","optional":false,"defaultvalue":null}],"name":"retrieve","longname":"Data.exceptions.retrieve","scope":"route"},{"route":{"name":"/api/bucket/:id/data/exceptions/summary","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"array of object containing exceptions for each application for each server","optional":false,"defaultvalue":null}],"name":"retrieveSummary","longname":"Data.exceptions.retrieveSummary","scope":"route"},{"route":{"name":"/api/bucket/:id/data/exceptions/delete_all","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"name":"deleteAll","longname":"Data.exceptions.deleteAll","scope":"route"},{"route":{"name":"/api/bucket/:id/data/exceptions/delete","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"identifier","type":"string","description":"exception identifier","optional":true,"defaultvalue":null},{"name":"app_name","type":"string","description":"the application on which exception happened","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false},{"type":"400","description":"missing/invalid parameters","optional":false}],"response":[{"name":".","type":"array","description":"array of deleted exceptions","optional":false,"defaultvalue":null}],"name":"delete","longname":"Data.exceptions.delete","scope":"route"}],"processes":[{"route":{"name":"/api/bucket/:id/data/processEvents","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"app_name","type":"string","description":"filter events by app source","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter events by server source","optional":true,"defaultvalue":null},{"name":"before","type":"string","description":"filter out events that are after X minute","optional":true,"defaultvalue":60}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"array of process events","optional":false,"defaultvalue":null}],"name":"retrieveEvents","longname":"Data.processes.retrieveEvents","scope":"route"},{"route":{"name":"/api/bucket/:id/data/processEvents/deployments","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"app_name","type":"string","description":"filter events by app source","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter events by server source","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"array of deployments","optional":false,"defaultvalue":null}],"name":"retrieveDeployments","longname":"Data.processes.retrieveDeployments","scope":"route"}],"metrics":[{"route":{"name":"/api/bucket/:id/data/metrics/aggregations","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"aggregations","type":"object","description":"array of aggregations to compute","optional":false,"defaultvalue":null},{"name":"aggregations[].start","type":"date","description":"oldest documents to aggregate on","optional":true,"defaultvalue":null},{"name":"aggregations[].end","type":"date","description":"newest documents to aggregate on","optional":true,"defaultvalue":null},{"name":"aggregations[].name","type":"string","description":"the name of metric to compute the graph","optional":true,"defaultvalue":null},{"name":"aggregations[].servers","type":"array","description":"filter source server to aggregate on","optional":true,"defaultvalue":null},{"name":"aggregations[].apps","type":"array","description":"filter source applications to aggregate on","optional":true,"defaultvalue":null},{"name":"aggregations[].name","type":"date","description":"the name of metric to compute the graph","optional":true,"defaultvalue":null},{"name":"aggregations[].types","type":"array","description":"type of aggregation","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"aggregations","optional":false,"defaultvalue":null}],"examples":["km.data.metrics.retrieveAggregations(bucket._id, {\n  aggregations: [\n    {\n     'end': 'now-1d',\n     'apps': ['INTERACTION', 'WEB-API', 'WORKER'],\n     'types': ['histogram', 'apps', 'servers'],\n     'name': 'HTTP'\n    }\n  ]\n})"],"name":"retrieveAggregations","longname":"Data.metrics.retrieveAggregations","scope":"route"},{"route":{"name":"/api/bucket/:id/data/metrics","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"app_name","type":"string","description":"filter metrics by app source","optional":false,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter metrics by server source","optional":true,"defaultvalue":null},{"name":"before","type":"string","description":"filter out metrics that are after X minute","optional":true,"defaultvalue":720}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"name":"retrieveMetadatas","longname":"Data.metrics.retrieveMetadatas","scope":"route"}],"transactions":[{"route":{"name":"/api/bucket/:id/data/transactions/v2/histogram","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"app_name","type":"string","description":"filter transactions by app source","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter transactions by server source","optional":true,"defaultvalue":null},{"name":"interval","type":"string","description":"interval of time between two point","optional":true,"defaultvalue":"minute"},{"name":"before","type":"string","description":"filter out transactions that are after X minute","optional":true,"defaultvalue":60}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":".","type":"array","description":"array of times series containing points","optional":false,"defaultvalue":null}],"name":"retrieveHistogram","longname":"Data.transactions.retrieveHistogram","scope":"route"},{"route":{"name":"/api/bucket/:id/data/transactions/v2/histogram","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"app_name","type":"string","description":"filter transactions by app source","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter transactions by server source","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":"server_name","type":"object","description":"","optional":false,"defaultvalue":null},{"name":"server_name.app_name","type":"object","description":"transaction object","optional":false,"defaultvalue":null}],"name":"retrieveSummary","longname":"Data.transactions.retrieveSummary","scope":"route"},{"route":{"name":"/api/bucket/:id/data/transactions/v2/delete","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"query":[{"name":"app_name","type":"string","description":"filter transactions by app source","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter transactions by server source","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false}],"response":[{"name":"server_name","type":"object","description":"","optional":false,"defaultvalue":null},{"name":"server_name.app_name","type":"object","description":"transaction object","optional":false,"defaultvalue":null}],"name":"delete","longname":"Data.transactions.delete","scope":"route"}],"dependencies":[{"route":{"name":"/api/bucket/:id/data/dependencies/","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"app_name","type":"string","description":"the application name","optional":false,"defaultvalue":null},{"name":"server_name","type":"string","description":"filter by server name","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false},{"type":"400","description":"missing parameters","optional":false}],"response":[{"name":".","type":"array","description":"recorded dependencies","optional":false,"defaultvalue":null}],"examples":["km.data.dependencies.retrieve(bucket._id, {\n   app_name: 'my_api'\n })"],"name":"retrieve","longname":"Data.dependencies.retrieve","scope":"route"}]},"dashboard":[{"route":{"name":"/api/bucket/:id/dashboard/","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false},{"type":"400","description":"Invalid params","optional":false}],"response":[{"name":".","type":"array","description":"array of servers status","optional":false,"defaultvalue":null}],"name":"retrieveAll","longname":"Dashboard.retrieveAll","scope":"route"},{"route":{"name":"/api/bucket/:id/dashboard/:dashid","type":"GET"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false},{"name":":dashid","type":"string","description":"dashboard id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false},{"type":"404","description":"dashboard not found","optional":false},{"type":"400","description":"Invalid params","optional":false}],"response":[{"name":".","type":"array","description":"array of dashboards","optional":false,"defaultvalue":null}],"name":"retrieve","longname":"Dashboard.retrieve","scope":"route"},{"route":{"name":"/api/bucket/:id/dashboard/:dashid","type":"DELETE"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false},{"name":":dashid","type":"string","description":"dashboard id","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully deleted dashboard","optional":false},{"type":"400","description":"Invalid params","optional":false},{"type":"404","description":"dashboard not found","optional":false}],"response":[{"name":".","type":"array","description":"array of dashboards","optional":false,"defaultvalue":null}],"name":"remove","longname":"Dashboard.remove","scope":"route"},{"route":{"name":"/api/bucket/:id/dashboard/:dashId","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false},{"name":":dashId","type":"string","description":"dashboard id","optional":false}],"body":[{"name":"name","type":"string","description":"the name of the dashboard","optional":false,"defaultvalue":null},{"name":"children","type":"object","description":"the list of component that compose the dashboard","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false},{"type":"404","description":"dashboard not found","optional":false},{"type":"400","description":"Invalid params","optional":false}],"response":[{"name":".","type":"array","description":"array of servers status","optional":false,"defaultvalue":null}],"name":"update","longname":"Dashboard.update","scope":"route"},{"route":{"name":"/api/bucket/:id/dashboard/","type":"PUT"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"name","type":"string","description":"the name of the dashboard","optional":false,"defaultvalue":null},{"name":"children","type":"object","description":"the list of component that compose the dashboard","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully created dashboard","optional":false},{"type":"400","description":"Invalid params","optional":false}],"response":[{"name":".","type":"dashboard","description":"complete dashboard object from database","optional":false,"defaultvalue":null}],"name":"create","longname":"Dashboard.create","scope":"route"}],"orchestration":[{"route":{"name":"/api/bucket/:id/balance","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"balancing error","optional":false},{"type":"403","description":"already on new node or not premium","optional":false},{"type":"200","description":"succesfully balanced the bucket","optional":false}],"response":[{"name":"migration","type":"object","description":"is equal true if succesfull","optional":false,"defaultvalue":null}],"name":"selfSend","longname":"Orchestration.selfSend","scope":"route"}],"actions":[{"route":{"name":"/api/bucket/:id/actions/trigger","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"server_name","type":"string","description":"the name of the server","optional":false,"defaultvalue":null},{"name":"process_id","type":"number","description":"the id of the process","optional":false,"defaultvalue":null},{"name":"action_name","type":"string","description":"the name of the action to trigger","optional":false,"defaultvalue":null},{"name":"opts","type":"object","description":"any specific options to be passed to the function","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully run the action","optional":false}],"response":[{"name":"success","type":"boolean","description":"succesully sended the action to PM2","optional":false,"defaultvalue":null}],"name":"triggerAction","longname":"Actions.triggerAction","scope":"route"},{"route":{"name":"/api/bucket/:id/actions/triggerPM2Action","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"server_name","type":"string","description":"the name of the server","optional":false,"defaultvalue":null},{"name":"method_name","type":"string","description":"the name of the pm2 method to trigger","optional":false,"defaultvalue":null},{"name":"app_name","type":"string","description":"the name of the application","optional":false,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"400","description":"failed action","optional":false},{"type":"200","description":"succesfully run the action","optional":false}],"response":[{"name":"success","type":"boolean","description":"succesully sended the action to PM2","optional":false,"defaultvalue":null}],"name":"triggerPM2Action","longname":"Actions.triggerPM2Action","scope":"route"},{"route":{"name":"/api/bucket/:id/actions/triggerPM2ScopedAction","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"server_name","type":"string","description":"the name of the server","optional":false,"defaultvalue":null},{"name":"action_name","type":"string","description":"the name of the pm2 method to trigger","optional":false,"defaultvalue":null},{"name":"app_name","type":"string","description":"the name of the application","optional":true,"defaultvalue":null},{"name":"password","type":"string","description":"pm2 password used to trigger restricted actions","optional":true,"defaultvalue":null},{"name":"args","type":"object","description":"custom parameters to give to the action","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully run the action","optional":false}],"response":[{"name":".","type":"object","description":"the action sended to pm2","optional":false,"defaultvalue":null}],"name":"triggerPM2ScopedAction","longname":"Actions.triggerPM2ScopedAction","scope":"route"},{"route":{"name":"/api/bucket/:id/actions/triggerScopedAction","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"server_name","type":"string","description":"the name of the server","optional":false,"defaultvalue":null},{"name":"action_name","type":"string","description":"the name of the pm2 method to trigger","optional":false,"defaultvalue":null},{"name":"app_name","type":"string","description":"the name of the application","optional":false,"defaultvalue":null},{"name":"process_id","type":"number","description":"the id of the process","optional":false,"defaultvalue":null},{"name":"opts","type":"object","description":"custom parameters to give to the action","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully run the action","optional":false}],"response":[{"name":".","type":"object","description":"the action sended to the process","optional":false,"defaultvalue":null}],"name":"triggerScopedAction","longname":"Actions.triggerScopedAction","scope":"route"},{"route":{"name":"/api/bucket/:id/actions/listScopedActions","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"uuid","type":"uuid","description":"action uuid","optional":true,"defaultvalue":null},{"name":"action_name","type":"string","description":"name of the action","optional":true,"defaultvalue":null},{"name":"app_name","type":"string","description":"app name where to execute the action","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"on which server the application is","optional":true,"defaultvalue":null},{"name":"status","type":"boolean","description":"is the action finished or not","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully run the action","optional":false}],"response":[{"name":".","type":"object","description":"the action sended to the process","optional":false,"defaultvalue":null}],"name":"retrieve","longname":"Actions.retrieve","scope":"route"},{"route":{"name":"/api/bucket/:id/actions/deleteScopedAction","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"params":[{"name":":id","type":"string","description":"bucket id","optional":false}],"body":[{"name":"uuid","type":"string","description":"action uuid","optional":true,"defaultvalue":null},{"name":"action_name","type":"string","description":"name of the action","optional":true,"defaultvalue":null},{"name":"app_name","type":"string","description":"app name where to execute the action","optional":true,"defaultvalue":null},{"name":"server_name","type":"string","description":"on which server the application is","optional":true,"defaultvalue":null},{"name":"status","type":"boolean","description":"is the action finished or not","optional":true,"defaultvalue":null},{"name":"beforeDate","type":"date","description":"created before this date","optional":true,"defaultvalue":null},{"name":"afterDate","type":"date","description":"created after this date","optional":true,"defaultvalue":null}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully run the action","optional":false}],"response":[{"name":".","type":"object","description":"the action sended to the process","optional":false,"defaultvalue":null}],"name":"remove","longname":"Actions.remove","scope":"route"}],"misc":[{"route":{"name":"/api/misc/release/pm2","type":"GET"},"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false},{"type":"400","description":"Invalid params","optional":false}],"response":[{"name":"pm2_version","type":"string","description":"latest version","optional":false,"defaultvalue":null}],"name":"retrievePM2Version","longname":"Misc.retrievePM2Version","scope":"route","authentication":false},{"route":{"name":"/api/misc/release/nodejs/:version","type":"GET"},"params":[{"name":":version","type":"string","description":"semver version range","optional":false}],"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false},{"type":"400","description":"Invalid params","optional":false}],"response":[{"name":".","type":"array","description":"array of releases matching the range requested","optional":false,"defaultvalue":null}],"name":"retrieveNodeRelease","longname":"Misc.retrieveNodeRelease","scope":"route","authentication":false},{"route":{"name":"/api/misc/plans","type":"GET"},"code":[{"type":"500","description":"database error","optional":false},{"type":"200","description":"succesfully retrieved data","optional":false},{"type":"400","description":"Invalid params","optional":false}],"response":[{"name":".","type":"object","description":"list of plans keyed by plan name","optional":false,"defaultvalue":null}],"name":"retrievePlans","longname":"Misc.retrievePlans","scope":"route","authentication":false}],"auth":[{"name":"retrieveToken","route":{"name":"/api/oauth/token","type":"POST"},"body":[{"name":"client_id","type":"string","description":"the public id of your oauth application","optional":false,"defaultvalue":null},{"name":"refresh_token","type":"string","description":"refresh token you retrieved via authorize endpoint","optional":false,"defaultvalue":null},{"name":"grant_type","type":"string","description":"","optional":false,"defaultvalue":"refresh_token"}],"code":[{"type":"400","description":"invalid parameters (missing or not correct)","optional":false}],"response":[{"name":"access_token","type":"string","description":"a fresh access_token","optional":false,"defaultvalue":null},{"name":"refresh_token","type":"string","description":"the refresh token you used","optional":false,"defaultvalue":null},{"name":"expire_at","type":"string","description":"UTC date at which the token will be considered\n as invalid","optional":false,"defaultvalue":null},{"name":"token_type","type":"string","description":"the type of token to use, for now its always Bearer","optional":false,"defaultvalue":null}],"longname":"Auth.retrieveToken","scope":"route","authentication":false},{"route":{"name":"/api/oauth/revoke","type":"POST"},"authentication":true,"header":[{"name":"Authorization","type":"string","description":"bearer access token issued for the user","optional":false,"defaultvalue":null}],"body":[{"name":"token","type":"string","description":"the refresh token you want to revoke\n if nothing is given, it will revoke the token used to make\n the request","optional":true,"defaultvalue":null}],"code":[{"type":"404","description":"token not found","optional":false},{"type":"500","description":"database error","optional":false},{"type":"200","description":"the token has been succesfully deleted,\n if there was access token generated with this token, they\n have been deleted too","optional":false}],"name":"revoke","longname":"Auth.revoke","scope":"route"}]}
},{}],36:[function(require,module,exports){
/* global URLSearchParams, URL, localStorage */
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var AuthStrategy = require('./strategy');
var km = require('../keymetrics');

module.exports = function (_AuthStrategy) {
  _inherits(BrowserFlow, _AuthStrategy);

  function BrowserFlow() {
    _classCallCheck(this, BrowserFlow);

    return _possibleConstructorReturn(this, (BrowserFlow.__proto__ || Object.getPrototypeOf(BrowserFlow)).apply(this, arguments));
  }

  _createClass(BrowserFlow, [{
    key: 'removeUrlToken',
    value: function removeUrlToken(refreshToken) {
      var url = window.location.href;
      var params = '?access_token=' + refreshToken + '&token_type=refresh_token';
      var newUrl = url.replace(params, '');
      window.history.pushState('', '', newUrl);
    }
  }, {
    key: 'retrieveTokens',
    value: function retrieveTokens(cb) {
      var _this2 = this;

      var verifyToken = function verifyToken(refresh) {
        return km.auth.retrieveToken({
          client_id: _this2.client_id,
          refresh_token: refresh
        });
      };

      // parse the url since it can contain tokens
      var url = new URL(window.location);
      this.response_mode = this.response_mode === 'query' ? 'search' : this.response_mode;
      var params = new URLSearchParams(url[this.response_mode]);

      if (params.get('access_token') !== null) {
        // verify that the access_token in parameters is valid
        verifyToken(params.get('access_token')).then(function (res) {
          _this2.removeUrlToken(res.data.refresh_token);
          // Save refreshToken in localstorage
          localStorage.setItem('km_refresh_token', params.get('access_token'));
          var tokens = res.data;
          return cb(null, tokens);
        }).catch(cb);
      } else if (typeof localStorage !== 'undefined' && localStorage.getItem('km_refresh_token') !== null) {
        // maybe in the local storage ?
        verifyToken(localStorage.getItem('km_refresh_token')).then(function (res) {
          _this2.removeUrlToken(res.data.refresh_token);
          var tokens = res.data;
          return cb(null, tokens);
        }).catch(cb);
      } else {
        // otherwise we need to get a refresh token
        window.location = '' + this.oauth_endpoint + this.oauth_query;
      }
    }
  }]);

  return BrowserFlow;
}(AuthStrategy);

},{"../keymetrics":40,"./strategy":38}],37:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var AuthStrategy = require('./strategy');
var km = require('../keymetrics');

module.exports = function (_AuthStrategy) {
  _inherits(StandaloneFlow, _AuthStrategy);

  function StandaloneFlow() {
    _classCallCheck(this, StandaloneFlow);

    return _possibleConstructorReturn(this, (StandaloneFlow.__proto__ || Object.getPrototypeOf(StandaloneFlow)).apply(this, arguments));
  }

  _createClass(StandaloneFlow, [{
    key: 'retrieveTokens',
    value: function retrieveTokens(cb) {
      if (this._opts.refresh_token && this._opts.access_token) {
        // if both access and refresh tokens are provided, we are good
        return cb(null, {
          access_token: this._opts.access_token,
          refresh_token: this._opts.refresh_token
        });
      } else if (this._opts.refresh_token && this._opts.client_id) {
        // we can also make a request to get an access token
        km.auth.retrieveToken({
          client_id: this._opts.client_id,
          refresh_token: this._opts.refresh_token
        }).then(function (res) {
          var tokens = res.data;
          return cb(null, tokens);
        }).catch(cb);
      } else {
        // otherwise the flow isn't used correctly
        throw new Error('If you want to use the standalone flow you need to provide either \n        a refresh and access token OR a refresh token and a client id');
      }
    }
  }]);

  return StandaloneFlow;
}(AuthStrategy);

},{"../keymetrics":40,"./strategy":38}],38:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var constants = require('../../constants.js');

var AuthStrategy = function () {
  function AuthStrategy(opts) {
    _classCallCheck(this, AuthStrategy);

    this._opts = opts;
    this.client_id = opts.client_id || opts.OAUTH_CLIENT_ID;
    if (!this.client_id) {
      throw new Error('You must always provide a application id for any of the strategies');
    }
    this.scope = opts.scope || 'all';
    this.response_mode = opts.reponse_mode || 'query';
    this.oauth_endpoint = '' + constants.API_URL + constants.OAUTH_AUTHORIZE_ENDPOINT;
    this.oauth_query = '?client_id=' + opts.client_id + '&response_mode=' + this.response_mode + ('&response_type=token&scope=' + this.scope);
  }

  _createClass(AuthStrategy, [{
    key: 'retrieveTokens',
    value: function retrieveTokens() {
      throw new Error('You need to implement the Flow interface to use it');
    }
  }], [{
    key: 'implementations',
    value: function implementations(name) {
      var flows = {
        'embed': {
          nodule: require('./embed_strategy'),
          condition: 'node'
        },
        'browser': {
          nodule: require('./browser_strategy'),
          condition: 'browser'
        },
        'standalone': {
          nodule: require('./standalone_strategy'),
          condition: null
        }
      };
      return name ? flows[name] : null;
    }
  }]);

  return AuthStrategy;
}();

module.exports = AuthStrategy;

},{"../../constants.js":1,"./browser_strategy":36,"./embed_strategy":27,"./standalone_strategy":37}],39:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var RequestValidator = require('./utils/validator');
var debug = require('debug')('kmjs:endpoint');

module.exports = function () {
  function Endpoint(opts) {
    _classCallCheck(this, Endpoint);

    Object.assign(this, opts);
  }

  _createClass(Endpoint, [{
    key: 'build',
    value: function build(http) {
      var endpoint = this;
      return function () {
        var _arguments = arguments;

        var callsite = new Error().stack.split('\n')[2];
        debug('Call to \'' + endpoint.route.name + '\' from ' + callsite.replace('    at ', ''));
        return new Promise(function (resolve, reject) {
          RequestValidator.extract(endpoint, Array.prototype.slice.call(_arguments)).then(function (opts) {
            http.request(opts).then(resolve, reject);
          }).catch(reject);
        });
      };
    }
  }]);

  return Endpoint;
}();

},{"./utils/validator":43,"debug":28}],40:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Namespace = require('./namespace');
var constants = require('../constants');
var NetworkWrapper = require('./network');
var logger = require('debug')('kmjs');

var Keymetrics = function () {
  /**
  * @constructor
  * Keymetrics
  *
  * @param {Object} [opts]
  * @param {String} [opts.API_URL] the base URL to use
  * @param {String} [opts.OAUTH_CLIENT_ID] the oauth client ID used to authenticate to KM
  * @param {String} [opts.mappings] api mappings
  */
  function Keymetrics(opts) {
    _classCallCheck(this, Keymetrics);

    logger('init keymetrics instance');
    this.opts = Object.assign(constants, opts);

    logger('init network client (http/ws)');
    this._network = new NetworkWrapper(this.opts);

    var mapping = opts && opts.mappings ? opts.mappings : require('./api_mappings.json');
    logger('Using mappings provided in ' + (opts && opts.mappings ? 'options' : 'package'));

    // build namespaces at startup
    logger('building namespaces');
    var root = new Namespace(mapping, {
      name: 'root',
      http: this._network
    });
    logger('exposing namespaces');
    for (var key in root) {
      if (key === 'name' || key === 'opts') continue;
      this[key] = root[key];
      Keymetrics[key] = root[key];
      exports[key] = root[key];
    }
    logger('attached namespaces : ' + Object.keys(this));

    this.realtime = this._network.realtime;
  }

  /**
   * Use a specific flow to retrieve an access token on behalf the user
   * @param {String|Function} flow either a flow name or a custom implementation
   * @param {Object} [opts]
   * @param {String} [opts.client_id] the OAuth client ID to use to identify the application
   *  default to the one defined when instancing Keymetrics and fallback to 795984050 (custom tokens)
   * @throws invalid use of this function, either the flow don't exist or isn't correctly implemented
   */


  _createClass(Keymetrics, [{
    key: 'use',
    value: function use(flow, opts) {
      logger('using ' + flow + ' authentication strategy');
      this._network.useStrategy(flow, opts);
      return this;
    }
  }]);

  return Keymetrics;
}();

module.exports = Keymetrics;

},{"../constants":1,"./api_mappings.json":35,"./namespace":41,"./network":42,"debug":28}],41:[function(require,module,exports){

'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Endpoint = require('./endpoint');
var logger = require('debug')('kmjs:namespace');

module.exports = function () {
  function Namespace(mapping, opts) {
    _classCallCheck(this, Namespace);

    logger('initialization namespace ' + opts.name);
    this.name = opts.name;
    this.http = opts.http;
    this.endpoints = [];
    this.namespaces = [];

    logger('building namespace ' + opts.name);
    for (var name in mapping) {
      var child = mapping[name];
      if ((typeof mapping === 'undefined' ? 'undefined' : _typeof(mapping)) === 'object' && !child.route) {
        // if the parent namespace is a object, the child are namespace too
        this.addNamespace(new Namespace(child, { name: name, http: this.http }));
      } else {
        // otherwise its an endpoint
        this.addEndpoint(new Endpoint(child));
      }
    }

    // logging namespaces
    if (this.namespaces.length > 0) {
      logger('namespace ' + this.name + ' contains namespaces : \n' + this.namespaces.map(function (namespace) {
        return namespace.name;
      }).join('\n') + '\n');
    }

    // logging endpoints
    if (this.endpoints.length > 0) {
      logger('Namespace ' + this.name + ' contains endpoints : \n' + this.endpoints.map(function (endpoint) {
        return endpoint.route.name;
      }).join('\n') + '\n');
    }
  }

  _createClass(Namespace, [{
    key: 'addNamespace',
    value: function addNamespace(namespace) {
      if (!namespace || namespace.name === this.name) {
        throw new Error('A namespace must not have the same name as the parent namespace');
      }
      if (!(namespace instanceof Namespace)) {
        throw new Error('addNamespace only accept Namespace instance');
      }

      this.namespaces.push(namespace);
      this[namespace.name] = namespace;
    }
  }, {
    key: 'addEndpoint',
    value: function addEndpoint(endpoint) {
      if (!endpoint || endpoint.name === this.name) {
        throw new Error('A endpoint must not have the same name as a namespace');
      }
      if (!(endpoint instanceof Endpoint)) {
        throw new Error('addNamespace only accept Namespace instance');
      }

      this.endpoints.push(endpoint);
      this[endpoint.name] = endpoint.build(this.http);
    }
  }]);

  return Namespace;
}();

},{"./endpoint":39,"debug":28}],42:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var axios = require('axios');
var AuthStrategy = require('./auth_strategies/strategy');
var constants = require('../constants');
var logger = require('debug')('kmjs:network');
var loggerHttp = require('debug')('kmjs:network:http');
var loggerWS = require('debug')('kmjs:network:ws');
var WS = require('./utils/websocket');
var EventEmitter = require('eventemitter2');
var km = require('./keymetrics');

module.exports = function () {
  function NetworkWrapper(opts) {
    _classCallCheck(this, NetworkWrapper);

    logger('init network manager');
    opts.baseURL = opts.API_URL || 'https://api.keymetrics.io';
    this.opts = opts;
    this.tokens = {
      refresh_token: null,
      access_token: null
    };
    this._buckets = [];
    this._queue = [];
    this._axios = axios.create(opts);
    this._queueWorker = setInterval(this._queueUpdater.bind(this), 10);
    this._queueWorker.unref();
    this._websockets = [];

    this.realtime = new EventEmitter({
      wildcard: true,
      delimiter: ':',
      newListener: false,
      maxListeners: 20
    });
    this.realtime.subscribe = this.subscribe.bind(this);
    this.realtime.unsubscribe = this.unsubscribe.bind(this);
    this.authenticated = false;
  }

  _createClass(NetworkWrapper, [{
    key: '_queueUpdater',
    value: function _queueUpdater() {
      if (this.authenticated === false) return;

      if (this._queue.length > 0) {
        logger('Emptying requests queue (size: ' + this._queue.length + ')');
      }

      // when we are authenticated we can clear the queue
      while (this._queue.length > 0) {
        var promise = this._queue.shift();
        // make the request
        this.request(promise.request).then(promise.resolve, promise.reject);
      }
    }

    /**
     * Send a http request
     * @param {Object} opts
     * @param {String} [opts.method=GET] http method
     * @param {String} opts.url the full URL
     * @param {Object} [opts.data] body data
     * @param {Object} [opts.params] url params
     */

  }, {
    key: 'request',
    value: function request(httpOpts) {
      var _this = this;

      if (httpOpts.url.match(/bucket/)) {
        var bucketID = httpOpts.url.split('/')[3];
        var node = this._buckets.filter(function (bucket) {
          return bucket._id === bucketID;
        }).map(function (bucket) {
          return bucket.node_cache;
        })[0];
        if (node && node.endpoints) {
          httpOpts.baseURL = node.endpoints.web;
        }
      }

      return new Promise(function (resolve, reject) {
        if (_this.authenticated === false && httpOpts.authentication === true) {
          loggerHttp('Queued request to ' + httpOpts.url);
          _this._queue.push({
            resolve: resolve,
            reject: reject,
            request: httpOpts
          });
        } else {
          loggerHttp('Making request to ' + httpOpts.url);
          _this._axios.request(httpOpts).then(resolve).catch(function (error) {
            var response = error.response;
            // we only need to handle when code is 401 (which mean unauthenticated)
            if (response && response.status !== 401) return reject(response);
            loggerHttp('Got unautenticated response, buffering request from now ...');

            // we tell the client to not send authenticated request anymore
            _this.authenticated = false;

            loggerHttp('Asking to the oauth flow to retrieve new tokens');
            _this.oauth_flow.retrieveTokens(function (err, data) {
              // if it fail, we fail the whole request
              if (err) {
                loggerHttp('Failed to retrieve new tokens : ' + (err.message || err));
                return reject(response);
              }
              // if its good, we try to update the tokens
              loggerHttp('Succesfully retrieved new tokens');
              _this._updateTokens(null, data, function (err, authenticated) {
                // if it fail, we fail the whole request
                if (err) return reject(response);
                // then we can rebuffer the request
                loggerHttp('Re-buffering call to ' + httpOpts.url + ' since authenticated now');
                return _this._axios.request(httpOpts).then(resolve);
              });
            });
          });
        }
      });
    }

    /**
     * Update the access token used by all the networking clients
     * @param {Error} err if any erro
     * @param {String} accessToken the token you want to use
     * @param {Function} [cb] invoked with <err, authenticated>
     * @private
     */

  }, {
    key: '_updateTokens',
    value: function _updateTokens(err, data, cb) {
      var _this2 = this;

      if (err) {
        console.error('Error while retrieving tokens : ' + err.message);
        return console.error(err.response ? err.response.data : err.stack);
      }
      if (!data || !data.access_token || !data.refresh_token) throw new Error('Invalid tokens');

      this.tokens = data;

      loggerHttp('Registered new access_token : ' + data.access_token);
      this._axios.defaults.headers.common['Authorization'] = 'Bearer ' + data.access_token;
      this._axios.request({ url: '/api/bucket', method: 'GET' }).then(function (res) {
        _this2._buckets = res.data;
        loggerHttp('Cached ' + res.data.length + ' buckets for current user');
        _this2.authenticated = true;
        return typeof cb === 'function' ? cb(null, true) : null;
      }).catch(function (err) {
        console.error('Error while retrieving buckets');
        console.error(err.response ? err.response.data : err);
        return typeof cb === 'function' ? cb(err) : null;
      });
    }

    /**
     * Specify a strategy to use when authenticating to server
     * @param {String|Function} flow the name of the flow to use or a custom implementation
     * @param {Object} [opts]
     * @param {String} [opts.client_id] the OAuth client ID to use to identify the application
     *  default to the one defined when instancing Keymetrics and fallback to 795984050 (custom tokens)
     * @throws invalid use of this function, either the flow don't exist or isn't correctly implemented
     */

  }, {
    key: 'useStrategy',
    value: function useStrategy(flow, opts) {
      if (!opts) opts = {};
      // if client not provided here, use the one given in the instance
      if (!opts.client_id) {
        opts.client_id = this.opts.OAUTH_CLIENT_ID;
      }

      // in the case of flow being a custom implementation
      if (typeof flow === 'function') {
        if (!(flow instanceof AuthStrategy)) throw new Error('You must implement the Flow interface to use it');
        var CustomFlow = flow;
        this.oauth_flow = new CustomFlow(opts);
        return this.oauth_flow.retrieveTokens(this.updateTokens.bind(this));
      }
      // otherwise fallback on the flow that are implemented
      if (typeof AuthStrategy.implementations(flow) === 'undefined') {
        throw new Error('The flow named ' + flow + ' doesn\'t exist');
      }
      var flowMeta = AuthStrategy.implementations(flow);

      // verify that the environnement condition is meet
      if (flowMeta.condition && constants.ENVIRONNEMENT !== flowMeta.condition) {
        throw new Error('The flow ' + flow + ' is reserved for ' + flowMeta.condition + ' environ sment');
      }
      var FlowImpl = flowMeta.nodule;
      this.oauth_flow = new FlowImpl(opts);
      return this.oauth_flow.retrieveTokens(this._updateTokens.bind(this));
    }

    /**
     * Subscribe to realtime from bucket
     * @param {String} bucketId bucket id
     * @param {Object} [opts]
     *
     * @return {Promise}
     */

  }, {
    key: 'subscribe',
    value: function subscribe(bucketId, opts) {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        logger('Request endpoints for ' + bucketId);
        km.bucket.retrieve(bucketId).then(function (res) {
          var bucket = res.data;

          var endpoint = bucket.node_cache.endpoints.realtime || bucket.node_cache.endpoints.web;
          endpoint = endpoint.replace('http', 'ws');
          if (_this3.opts.IS_DEBUG) {
            endpoint = endpoint.replace(':3000', ':4020');
          }
          loggerWS('Found endpoint for ' + bucketId + ' : ' + endpoint);

          // connect websocket client to the realtime endpoint
          var socket = new WS(endpoint + '/primus/?token=' + _this3.tokens.access_token);
          socket.connected = false;
          socket.bucket = bucketId;

          var keepAliveHandler = function keepAliveHandler() {
            socket.send('primus::pong::' + Date.now());
          };
          var keepAliveInterval = null;

          var onConnect = function onConnect() {
            logger('Connected to ws endpoint : ' + endpoint + ' (bucket: ' + bucketId + ')');
            socket.connected = true;
            _this3.realtime.emit(bucket.public_id + ':connected');

            socket.send(JSON.stringify({
              action: 'active',
              public_id: bucket.public_id
            }));

            if (keepAliveInterval !== null) {
              clearInterval(keepAliveInterval);
              keepAliveInterval = null;
            }
            keepAliveInterval = setInterval(keepAliveHandler.bind(_this3), 5000);
          };
          socket.onopen = onConnect;
          socket.onreconnect = onConnect;

          socket.onerror = function (err) {
            loggerWS('Error on ' + endpoint + ' (bucket: ' + bucketId + ')');
            loggerWS(err);

            _this3.realtime.emit(bucket.public_id + ':error', err);
          };

          socket.onclose = function () {
            logger('Closing ws connection ' + endpoint + ' (bucket: ' + bucketId + ')');
            socket.connected = false;
            _this3.realtime.emit(bucket.public_id + ':disconnected');

            if (keepAliveInterval !== null) {
              clearInterval(keepAliveInterval);
              keepAliveInterval = null;
            }
          };

          // broadcast in the bus
          socket.onmessage = function (msg) {
            loggerWS('Received message for bucket ' + bucketId + ' (' + (msg.data.length / 1000).toFixed(1) + ' Kb)');
            var data = JSON.parse(msg.data);
            var packet = data.data[1];
            Object.keys(packet).forEach(function (event) {
              if (event === 'server_name') return;
              _this3.realtime.emit(bucket.public_id + ':' + (data.server_name || 'none') + ':' + event, packet[event]);
            });
          };

          _this3._websockets.push(socket);
          return resolve(socket);
        }).catch(reject);
      });
    }

    /**
     * Unsubscribe realtime from bucket
     * @param {String} bucketId bucket id
     * @param {Object} [opts]
     *
     * @return {Promise}
     */

  }, {
    key: 'unsubscribe',
    value: function unsubscribe(bucketId, opts) {
      var _this4 = this;

      return new Promise(function (resolve, reject) {
        logger('Unsubscribe from realtime for ' + bucketId);
        var socket = _this4._websockets.find(function (socket) {
          return socket.bucket === bucketId;
        });
        if (!socket) {
          return reject(new Error('Realtime wasn\'t connected to ' + bucketId));
        }
        socket.close(1000, 'Disconnecting');
        logger('Succesfully unsubscribed from realtime for ' + bucketId);
        return resolve();
      });
    }
  }]);

  return NetworkWrapper;
}();

},{"../constants":1,"./auth_strategies/strategy":38,"./keymetrics":40,"./utils/websocket":44,"axios":2,"debug":28,"eventemitter2":30}],43:[function(require,module,exports){

'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

module.exports = function () {
  function RequestValidator() {
    _classCallCheck(this, RequestValidator);
  }

  _createClass(RequestValidator, null, [{
    key: 'extract',

    /**
     * Extract httpOptions from the endpoint definition
     * and the data given by the user
     *
     * @param {Object} endpoint endpoint definition
     * @param {Array} args arguments given by the user
     * @return {Promise} resolve to the http options need to make the request
     */
    value: function extract(endpoint, args) {
      var isDefined = function isDefined(val) {
        return val !== null && typeof val !== 'undefined';
      };

      return new Promise(function (resolve, reject) {
        var httpOpts = {
          params: {},
          data: {},
          url: endpoint.route.name + '',
          method: endpoint.route.type,
          authentication: endpoint.authentication || false
        };

        switch (endpoint.route.type) {
          // GET request, we assume data will only be in the query or url params
          case 'GET':
            {
              var _iteratorNormalCompletion = true;
              var _didIteratorError = false;
              var _iteratorError = undefined;

              try {
                for (var _iterator = (endpoint.params || [])[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                  var param = _step.value;

                  var value = args.shift();
                  // params should always be a string since they will be replaced in the url
                  if (typeof value !== 'string' && param.optional === false) {
                    return reject(new Error('Expected to receive string argument for ' + param.name + ' to match but got ' + value));
                  }
                  if (value) {
                    // if value is given, use it
                    httpOpts.url = httpOpts.url.replace(param.name, value);
                  } else if (param.optional === false && param.defaultvalue !== null) {
                    // use default value if available
                    httpOpts.url = httpOpts.url.replace(param.name, param.defaultvalue);
                  }
                }
              } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion && _iterator.return) {
                    _iterator.return();
                  }
                } finally {
                  if (_didIteratorError) {
                    throw _iteratorError;
                  }
                }
              }

              var _iteratorNormalCompletion2 = true;
              var _didIteratorError2 = false;
              var _iteratorError2 = undefined;

              try {
                for (var _iterator2 = (endpoint.query || [])[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                  var _param = _step2.value;

                  var _value = args.shift();
                  // query should always be a string since they will be replaced in the url
                  if (typeof _value !== 'string' && _param.optional === false) {
                    return reject(new Error('Expected to receive string argument for ' + _param.name + ' query but got ' + _value));
                  }
                  if (_value) {
                    // if value is given, use it
                    httpOpts.url = httpOpts.url.replace(_param.name, _value);
                  } else if (_param.optional === false && _param.defaultvalue !== null) {
                    // use default value if available
                    httpOpts.url = httpOpts.url.replace(_param.name, _param.defaultvalue);
                  }
                }
              } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion2 && _iterator2.return) {
                    _iterator2.return();
                  }
                } finally {
                  if (_didIteratorError2) {
                    throw _iteratorError2;
                  }
                }
              }

              break;
            }
          // for PUT, POST and PATCH request, only params and body are authorized
          case 'PUT':
          case 'POST':
          case 'PATCH':
            {
              var _iteratorNormalCompletion3 = true;
              var _didIteratorError3 = false;
              var _iteratorError3 = undefined;

              try {
                for (var _iterator3 = (endpoint.params || [])[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                  var _param2 = _step3.value;

                  var _value2 = args.shift();
                  // params should always be a string since they will be replaced in the url
                  if (typeof _value2 !== 'string' && _param2.optional === false) {
                    return reject(new Error('Expected to receive string argument for ' + _param2.name + ' to match but got ' + _value2));
                  }
                  // replace param in url
                  if (_value2) {
                    // if value is given, use it
                    httpOpts.url = httpOpts.url.replace(_param2.name, _value2);
                  } else if (_param2.optional === false && _param2.defaultvalue !== null) {
                    // use default value if available
                    httpOpts.url = httpOpts.url.replace(_param2.name, _param2.defaultvalue);
                  }
                }
              } catch (err) {
                _didIteratorError3 = true;
                _iteratorError3 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion3 && _iterator3.return) {
                    _iterator3.return();
                  }
                } finally {
                  if (_didIteratorError3) {
                    throw _iteratorError3;
                  }
                }
              }

              var data = args[0];
              if ((typeof data === 'undefined' ? 'undefined' : _typeof(data)) !== 'object') {
                return reject(new Error('Expected to receive an object for post data but received ' + (typeof data === 'undefined' ? 'undefined' : _typeof(data))));
              }
              var _iteratorNormalCompletion4 = true;
              var _didIteratorError4 = false;
              var _iteratorError4 = undefined;

              try {
                for (var _iterator4 = (endpoint.body || [])[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                  var field = _step4.value;

                  // verify that the mandatory field are here
                  if (!isDefined(data[field.name]) && field.optional === false && field.defaultvalue === null) {
                    return reject(new Error('Missing mandatory field ' + field.name + ' to make a POST request on ' + endpoint.route.name));
                  }
                  // verify that the mandatory field are the good type
                  if (_typeof(data[field.name]) !== field.type && field.optional === false && field.defaultvalue === null) {
                    // eslint-disable-line 
                    return reject(new Error('Invalid type for field ' + field.name + ', expected ' + field.type + ' but got ' + _typeof(data[field.name])));
                  }

                  // add it to the request only when its present
                  if (isDefined(data[field.name])) {
                    httpOpts.data[field.name] = data[field.name];
                  }

                  // or else its not optional and has a default value
                  if (field.optional === false && field.defaultvalue !== null) {
                    httpOpts.data[field.name] = field.defaultvalue;
                  }
                }
              } catch (err) {
                _didIteratorError4 = true;
                _iteratorError4 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion4 && _iterator4.return) {
                    _iterator4.return();
                  }
                } finally {
                  if (_didIteratorError4) {
                    throw _iteratorError4;
                  }
                }
              }

              break;
            }
          // DELETE can have params or query parameters
          case 'DELETE':
            {
              var _iteratorNormalCompletion5 = true;
              var _didIteratorError5 = false;
              var _iteratorError5 = undefined;

              try {
                for (var _iterator5 = (endpoint.params || [])[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                  var _param3 = _step5.value;

                  var _value3 = args.shift();
                  // params should always be a string since they will be replaced in the url
                  if (typeof _value3 !== 'string') {
                    return reject(new Error('Expected to receive string argument for ' + _param3.name + ' to match but got ' + _value3));
                  }
                  httpOpts.url = httpOpts.url.replace(_param3.name, _value3);
                }
              } catch (err) {
                _didIteratorError5 = true;
                _iteratorError5 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion5 && _iterator5.return) {
                    _iterator5.return();
                  }
                } finally {
                  if (_didIteratorError5) {
                    throw _iteratorError5;
                  }
                }
              }

              var _iteratorNormalCompletion6 = true;
              var _didIteratorError6 = false;
              var _iteratorError6 = undefined;

              try {
                for (var _iterator6 = (endpoint.query || [])[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                  var _param4 = _step6.value;

                  var _value4 = args.shift();
                  // query should always be a string
                  if (typeof _value4 !== 'string') {
                    return reject(new Error('Expected to receive string argument for ' + _param4.name + ' query but got ' + _value4));
                  }
                  httpOpts.params[_param4.name] = _value4;
                }
              } catch (err) {
                _didIteratorError6 = true;
                _iteratorError6 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion6 && _iterator6.return) {
                    _iterator6.return();
                  }
                } finally {
                  if (_didIteratorError6) {
                    throw _iteratorError6;
                  }
                }
              }

              break;
            }
          default:
            {
              return reject(new Error('Invalid endpoint declaration, invalid method ' + endpoint.route.type + ' found'));
            }
        }
        return resolve(httpOpts);
      });
    }
  }]);

  return RequestValidator;
}();

},{}],44:[function(require,module,exports){
/* global WebSocket */

'use strict';

var ws = require('ws');
var debug = require('debug')('kmjs:network:_ws');

var _WebSocket = typeof ws !== 'function' ? WebSocket : ws;

var defaultOptions = {
  debug: false,
  automaticOpen: true,
  reconnectOnError: true,
  reconnectInterval: 1000,
  maxReconnectInterval: 30000,
  reconnectDecay: 1,
  timeoutInterval: 2000,
  maxReconnectAttempts: null,
  randomRatio: 3,
  reconnectOnCleanClose: false
};

var ReconnectableWebSocket = function ReconnectableWebSocket(url, protocols, options) {
  if (!protocols) protocols = [];
  if (!options) options = [];

  this.CONNECTING = 0;
  this.OPEN = 1;
  this.CLOSING = 2;
  this.CLOSED = 3;

  this._url = url;
  this._protocols = protocols;
  this._options = Object.assign({}, defaultOptions, options);
  this._messageQueue = [];
  this._reconnectAttempts = 0;
  this.readyState = this.CONNECTING;

  if (typeof this._options.debug === 'function') {
    this._debug = this._options.debug;
  } else if (this._options.debug) {
    this._debug = console.log.bind(console);
  } else {
    this._debug = function () {};
  }

  if (this._options.automaticOpen) this.open();
};

ReconnectableWebSocket.prototype.open = function () {
  debug('open');
  var socket = this._socket = new _WebSocket(this._url, this._protocols);

  if (this._options.binaryType) {
    socket.binaryType = this._options.binaryType;
  }

  if (this._options.maxReconnectAttempts && this._options.maxReconnectAttempts < this._reconnectAttempts) {
    return;
  }

  this._syncState();

  socket.onmessage = this._onmessage.bind(this);
  socket.onopen = this._onopen.bind(this);
  socket.onclose = this._onclose.bind(this);
  socket.onerror = this._onerror.bind(this);
};

ReconnectableWebSocket.prototype.send = function (data) {
  debug('send');
  if (this._socket && this._socket.readyState === _WebSocket.OPEN && this._messageQueue.length === 0) {
    this._socket.send(data);
  } else {
    this._messageQueue.push(data);
  }
};

ReconnectableWebSocket.prototype.close = function (code, reason) {
  debug('close');
  if (typeof code === 'undefined') code = 1000;

  if (this._socket) this._socket.close(code, reason);
};

ReconnectableWebSocket.prototype._onmessage = function (message) {
  debug('onmessage');
  this.onmessage && this.onmessage(message);
};

ReconnectableWebSocket.prototype._onopen = function (event) {
  debug('onopen');
  this._syncState();
  this._flushQueue();
  if (this._reconnectAttempts !== 0) {
    this.onreconnect && this.onreconnect();
  }
  this._reconnectAttempts = 0;

  this.onopen && this.onopen(event);
};

ReconnectableWebSocket.prototype._onclose = function (event) {
  debug('onclose', event);
  this._syncState();
  this._debug('WebSocket: connection is broken', event);

  this.onclose && this.onclose(event);

  this._tryReconnect(event);
};

ReconnectableWebSocket.prototype._onerror = function (event) {
  debug('onerror', event);
  // To avoid undetermined state, we close socket on error
  this._socket.close();
  this._syncState();

  this._debug('WebSocket: error', event);

  this.onerror && this.onerror(event);

  if (this._options.reconnectOnError) this._tryReconnect(event);
};

ReconnectableWebSocket.prototype._tryReconnect = function (event) {
  var self = this;
  debug('Trying to reconnect');
  if (event.wasClean && !this._options.reconnectOnCleanClose) {
    return;
  }
  setTimeout(function () {
    if (self.readyState === self.CLOSING || self.readyState === self.CLOSED) {
      self._reconnectAttempts++;
      self.open();
    }
  }, this._getTimeout());
};

ReconnectableWebSocket.prototype._flushQueue = function () {
  while (this._messageQueue.length !== 0) {
    var data = this._messageQueue.shift();
    this._socket.send(data);
  }
};

ReconnectableWebSocket.prototype._getTimeout = function () {
  var timeout = this._options.reconnectInterval * Math.pow(this._options.reconnectDecay, this._reconnectAttempts);
  timeout = timeout > this._options.maxReconnectInterval ? this._options.maxReconnectInterval : timeout;
  console.log(timeout);
  return this._options.randomRatio ? getRandom(timeout / this._options.randomRatio, timeout) : timeout;
};

ReconnectableWebSocket.prototype._syncState = function () {
  this.readyState = this._socket.readyState;
};

function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

module.exports = ReconnectableWebSocket;

},{"debug":28,"ws":27}],"/":[function(require,module,exports){
'use strict';

module.exports = require('./src/keymetrics.js');

},{"./src/keymetrics.js":40}]},{},[])("/")
});