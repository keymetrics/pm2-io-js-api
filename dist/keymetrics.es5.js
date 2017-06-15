(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Keymetrics = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
'use strict';

var config = {
  API_URL: 'http://cl1.km.io:3000',
  OAUTH_AUTHORIZE_ENDPOINT: '/api/oauth/authorize',
  OAUTH_CLIENT_ID: 4228578805,
  ENVIRONNEMENT: process && process.versions && process.versions.node ? 'node' : 'browser'
};

module.exports = Object.assign({}, config);

}).call(this,require('_process'))
},{"_process":28}],2:[function(require,module,exports){
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
},{"../core/createError":10,"./../core/settle":13,"./../helpers/btoa":17,"./../helpers/buildURL":18,"./../helpers/cookies":20,"./../helpers/isURLSameOrigin":22,"./../helpers/parseHeaders":24,"./../utils":26,"_process":28}],4:[function(require,module,exports){
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
},{"./adapters/http":3,"./adapters/xhr":3,"./helpers/normalizeHeaderName":23,"./utils":26,"_process":28}],16:[function(require,module,exports){
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

},{"./helpers/bind":16,"is-buffer":27}],27:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
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

},{}],28:[function(require,module,exports){
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

},{}],29:[function(require,module,exports){
module.exports={
    "data": {
        "status": [
            {
                "route": {
                    "name": "/api/bucket/:id/data/status",
                    "type": "GET"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "tags": [
                    {
                        "originalTitle": "reponse",
                        "title": "reponse",
                        "text": "{Array} . array of servers status",
                        "value": "{Array} . array of servers status",
                        "optional": false,
                        "type": null
                    }
                ],
                "name": "retrieve",
                "longname": "Data.status.retrieve",
                "scope": "route"
            }
        ],
        "heapdump": [
            {
                "route": {
                    "name": "/api/bucket/:id/data/heapdump/:filename",
                    "type": "GET"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    },
                    {
                        "name": ":filename",
                        "type": "string",
                        "description": "filename",
                        "optional": false
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "400",
                        "description": "invalid parameters",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "file",
                        "description": "return a file",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieve",
                "longname": "Data.heapdump.retrieve",
                "scope": "route"
            }
        ],
        "events": [
            {
                "route": {
                    "name": "/api/bucket/:id/data/events",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "event_name",
                        "type": "string",
                        "description": "the event name to retrieve",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter events by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter events by server source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "limit",
                        "type": "string",
                        "description": "limit the number of events to retrieve",
                        "optional": true,
                        "defaultvalue": 100
                    },
                    {
                        "name": "offset",
                        "type": "string",
                        "description": "offset research by X",
                        "optional": true,
                        "defaultvalue": 0
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "400",
                        "description": "invalid parameters",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of events",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieve",
                "longname": "Data.events.retrieve",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/events/eventsKeysByApp",
                    "type": "GET"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "400",
                        "description": "invalid parameters",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of object representing events emitted for each application name",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveMetadatas",
                "longname": "Data.events.retrieveMetadatas",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/events/stats",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "event_name",
                        "type": "string",
                        "description": "the event name to retrieve",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter events by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter events by server source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "days",
                        "type": "string",
                        "description": "limit the number of days of data",
                        "optional": true,
                        "defaultvalue": 2
                    },
                    {
                        "name": "interval",
                        "type": "string",
                        "description": "interval of time between two point",
                        "optional": true,
                        "defaultvalue": "minute"
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "400",
                        "description": "invalid parameters",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of point (each point is one dimensional array, X are at 0 and Y at 1)",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveHistogram",
                "longname": "Data.events.retrieveHistogram",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/events/delete_all",
                    "type": "DELETE"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully deleted data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of object representing events emitted for each application name",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "deleteAll",
                "longname": "Data.events.deleteAll",
                "scope": "route"
            }
        ],
        "exceptions": [
            {
                "route": {
                    "name": "/api/bucket/:id/data/exceptions",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter exceptions by server source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter exceptions by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "before",
                        "type": "string",
                        "description": "filter out exceptions older than X (in minutes)",
                        "optional": true,
                        "defaultvalue": null
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of exceptions",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieve",
                "longname": "Data.exceptions.retrieve",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/exceptions/summary",
                    "type": "GET"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of object containing exceptions for each application for each server",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveSummary",
                "longname": "Data.exceptions.retrieveSummary",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/exceptions/delete_all",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "name": "deleteAll",
                "longname": "Data.exceptions.deleteAll",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/exceptions/delete",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    },
                    {
                        "type": "400",
                        "description": "missing/invalid parameters",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of deleted exceptions",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "delete",
                "longname": "Data.exceptions.delete",
                "scope": "route"
            }
        ],
        "processes": [
            {
                "route": {
                    "name": "/api/bucket/:id/data/processEvents",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter events by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter events by server source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "before",
                        "type": "string",
                        "description": "filter out events that are after X minute",
                        "optional": true,
                        "defaultvalue": 60
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of process events",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveEvents",
                "longname": "Data.processes.retrieveEvents",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/processEvents/deployments",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter events by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter events by server source",
                        "optional": true,
                        "defaultvalue": null
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of deployments",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveDeployments",
                "longname": "Data.processes.retrieveDeployments",
                "scope": "route"
            }
        ],
        "monitoring": [
            {
                "route": {
                    "name": "/api/bucket/:id/data/monitoring",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter events by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter events by server source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "interval",
                        "type": "string",
                        "description": "interval of time between two point",
                        "optional": true,
                        "defaultvalue": "minute"
                    },
                    {
                        "name": "before",
                        "type": "string",
                        "description": "filter out events that are after X minute",
                        "optional": true,
                        "defaultvalue": 60
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": "<app_name>",
                        "type": "object",
                        "description": "were app_name is the name of each application",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "app_name.cpu",
                        "type": "array",
                        "description": "array of point (each point is one dimensional array, X are at 0 and Y at 1)",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "app_name.mem",
                        "type": "array",
                        "description": "array of point (each point is one dimensional array, X are at 0 and Y at 1)",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveHistogram",
                "longname": "Data.monitoring.retrieveHistogram",
                "scope": "route"
            }
        ],
        "probes": [
            {
                "route": {
                    "name": "/api/bucket/:id/data/probes/histogram",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter probes by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter probes by server source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "interval",
                        "type": "string",
                        "description": "interval of time between two point",
                        "optional": true,
                        "defaultvalue": "minute"
                    },
                    {
                        "name": "before",
                        "type": "string",
                        "description": "filter out probes that are after X minute",
                        "optional": true,
                        "defaultvalue": 60
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": "server_name",
                        "type": "object",
                        "description": "",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name.app_name",
                        "type": "object",
                        "description": "",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name.app_name.probe_name",
                        "type": "object",
                        "description": "",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name.app_name.probe_name.agg_type",
                        "type": "string",
                        "description": "the type of aggregation for this probe",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name.app_name.probe_name.timestamps_and_stats",
                        "type": "array",
                        "description": "array of point",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveHistogram",
                "longname": "Data.probes.retrieveHistogram",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/probes",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter probes by app source",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter probes by server source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "before",
                        "type": "string",
                        "description": "filter out probes that are after X minute",
                        "optional": true,
                        "defaultvalue": 720
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "name": "retrieveMetadatas",
                "longname": "Data.probes.retrieveMetadatas",
                "scope": "route"
            }
        ],
        "transactions": [
            {
                "route": {
                    "name": "/api/bucket/:id/data/transactions/v2/histogram",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter transactions by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter transactions by server source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "interval",
                        "type": "string",
                        "description": "interval of time between two point",
                        "optional": true,
                        "defaultvalue": "minute"
                    },
                    {
                        "name": "before",
                        "type": "string",
                        "description": "filter out transactions that are after X minute",
                        "optional": true,
                        "defaultvalue": 60
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": ".",
                        "type": "array",
                        "description": "array of times series containing points",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveHistogram",
                "longname": "Data.transactions.retrieveHistogram",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/transactions/v2/histogram",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "body": [
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter transactions by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter transactions by server source",
                        "optional": true,
                        "defaultvalue": null
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": "server_name",
                        "type": "object",
                        "description": "",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name.app_name",
                        "type": "object",
                        "description": "transaction object",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "retrieveSummary",
                "longname": "Data.transactions.retrieveSummary",
                "scope": "route"
            },
            {
                "route": {
                    "name": "/api/bucket/:id/data/transactions/v2/delete_all",
                    "type": "POST"
                },
                "authentication": true,
                "header": [
                    {
                        "name": "Authorization",
                        "type": "string",
                        "description": "bearer access token issued for the user",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "params": [
                    {
                        "name": ":id",
                        "type": "string",
                        "description": "bucket id",
                        "optional": false
                    }
                ],
                "query": [
                    {
                        "name": "app_name",
                        "type": "string",
                        "description": "filter transactions by app source",
                        "optional": true,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name",
                        "type": "string",
                        "description": "filter transactions by server source",
                        "optional": true,
                        "defaultvalue": null
                    }
                ],
                "code": [
                    {
                        "type": "500",
                        "description": "database error",
                        "optional": false
                    },
                    {
                        "type": "200",
                        "description": "succesfully retrieved data",
                        "optional": false
                    }
                ],
                "response": [
                    {
                        "name": "server_name",
                        "type": "object",
                        "description": "",
                        "optional": false,
                        "defaultvalue": null
                    },
                    {
                        "name": "server_name.app_name",
                        "type": "object",
                        "description": "transaction object",
                        "optional": false,
                        "defaultvalue": null
                    }
                ],
                "name": "deleteAll",
                "longname": "Data.transactions.deleteAll",
                "scope": "route"
            }
        ]
    },
    "bucket": [
        {
            "route": {
                "name": "/api/bucket/:id/feedback",
                "type": "PUT"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "body": [
                {
                    "name": "feedback",
                    "type": "string",
                    "description": "the feedback text",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing feedback field",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully registered the feedback",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "feedback",
                    "type": "string",
                    "description": "the feedback that hasn't been registered",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "sendFeedback",
            "longname": "Bucket.sendFeedback",
            "scope": "route"
        },
        {
            "name": "retrieveUsers",
            "route": {
                "name": "/api/bucket/:id/users_authorized",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retrieved bucket's members",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "array",
                    "description": "a array of user containing their email, username and roles",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.retrieveUsers",
            "scope": "route"
        },
        {
            "name": "currentRole",
            "route": {
                "name": "/api/bucket/:id/current_role",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "200",
                    "description": "succesfully retrieved the use role",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "role",
                    "type": "string",
                    "description": "the user role",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.currentRole",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/bucket/:id/manage_notif",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "body": [
                {
                    "name": "email",
                    "type": "string",
                    "description": "the user email",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "state",
                    "type": "string",
                    "description": "the notification state you want to set for that user\n (either 'email' or 'nonde)",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "404",
                    "description": "user not found",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "array",
                    "description": "array of state for each user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "setNotificationState",
            "longname": "Bucket.setNotificationState",
            "scope": "route"
        },
        {
            "name": "inviteUser",
            "route": {
                "name": "/api/bucket/:id/add_user",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "body": [
                {
                    "name": "email",
                    "type": "string",
                    "description": "the email of the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "missing/invalid parameters",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "you cant invit more users because you hit the bucket limit",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully invited the user (either directly or by email)",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "invitations",
                    "type": "array",
                    "description": "the list of invitations actually active",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.inviteUser",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/bucket/:id/invitation/:email",
                "type": "DELETE"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                },
                {
                    "name": ":email",
                    "type": "string",
                    "description": "the email of the invitation you want to delete",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "invalid/missing parameters",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully deleted the invitation",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "invitations",
                    "type": "array",
                    "description": "the list of invitations actually active",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "removeInvitation",
            "longname": "Bucket.removeInvitation",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/bucket/:id/remove_user",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "body": [
                {
                    "name": "email",
                    "type": "string",
                    "description": "the email of the user you want to remove",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "missing/invalid parameters",
                    "optional": false
                },
                {
                    "type": "404",
                    "description": "user not found",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "impossible to remove the owner from the bucket",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "array",
                    "description": "a array of user containing their email, username and roles",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "removeUser",
            "longname": "Bucket.removeUser",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/bucket/:id/promote_user",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "body": [
                {
                    "name": "email",
                    "type": "string",
                    "description": "the email of the user you want to change the role",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "role",
                    "type": "string",
                    "description": "the role you want to set",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "invalid/missing parameters",
                    "optional": false
                },
                {
                    "type": "404",
                    "description": "user not found",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "impossible to set the role of the owner",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "array",
                    "description": "a array of user containing their email, username and roles",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "setUserRole",
            "longname": "Bucket.setUserRole",
            "scope": "route"
        },
        {
            "name": "retrieveAll",
            "route": {
                "name": "/api/bucket/",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully fetched bucket",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "array",
                    "description": "array of buckets",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.retrieveAll",
            "scope": "route"
        },
        {
            "name": "create",
            "route": {
                "name": "/api/bucket/create_classic",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "body": [
                {
                    "name": "name",
                    "type": "string",
                    "description": "the name of the bucket",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "comment",
                    "type": "string",
                    "description": "any comments that will be written under the bucket name",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "app_url",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "missing parameters",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "you cant create any more bucket",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully created a bucket",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "bucket",
                    "type": "object",
                    "description": "the created bucket",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.create",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/bucket/:id/start_trial",
                "type": "PUT"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "can't claim trial",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "trial launched",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "duration",
                    "type": "string",
                    "description": "the duration of the trial",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "plan",
                    "type": "string",
                    "description": "the plan of the trial",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "claimTrial",
            "longname": "Bucket.claimTrial",
            "scope": "route"
        },
        {
            "name": "upgrade",
            "route": {
                "name": "/api/bucket/:id/upgrade",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "body": [
                {
                    "name": "plan",
                    "type": "string",
                    "description": "name of the plan to upgrade to",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "stripe_token",
                    "type": "string",
                    "description": "a card token created by stripe",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "coupon_id",
                    "type": "string",
                    "description": "the id of the stripe coupon",
                    "optional": true,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "missing/invalid parameters",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "need a credit card OR not allowed to subscribe to the plan",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "stripe/database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully upgraded",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "bucket",
                    "type": "object",
                    "description": "the bucket object",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "subscription",
                    "type": "object",
                    "description": "the subscription object attached to the subscription",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.upgrade",
            "scope": "route"
        },
        {
            "name": "retrieve",
            "route": {
                "name": "/api/bucket/:id",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "200",
                    "description": "succesfully retrieved the bucket",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "object",
                    "description": "bucket object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.retrieve",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/bucket/:id",
                "type": "PUT"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "body": [
                {
                    "name": "name",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "comment",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "app_url",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "configuration",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing parameters",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "object",
                    "description": "bucket object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "update",
            "longname": "Bucket.update",
            "scope": "route"
        },
        {
            "name": "retrieveServers",
            "route": {
                "name": "/api/bucket/:id/meta_servers",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retrieved the server's metadata",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "array",
                    "description": "servers metadata",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.retrieveServers",
            "scope": "route"
        },
        {
            "name": "getSubscription",
            "route": {
                "name": "/api/bucket/:id/subscription",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "404",
                    "description": "the bucket doesnt have any subscription",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retrieved the subscription",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "object",
                    "description": "subscription object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Bucket.getSubscription",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/bucket/:id",
                "type": "DELETE"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully deleted the bucket",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "object",
                    "description": "the deleted bucket",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "destroy",
            "longname": "Bucket.destroy",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/bucket/:id/transfer_ownership",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "bucket id",
                    "optional": false
                }
            ],
            "body": [
                {
                    "name": "new_owner",
                    "type": "string",
                    "description": "the wanted owner's email",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "Missing/invalid parameters",
                    "optional": false
                },
                {
                    "type": "404",
                    "description": "user not found",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "the new owner need to have a active credit card",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully transfered the bucket, old owner is now admin",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "object",
                    "description": "bucket object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "transferOwnership",
            "longname": "Bucket.transferOwnership",
            "scope": "route"
        }
    ],
    "auth": [
        {
            "name": "retrieveToken",
            "route": {
                "name": "/api/oauth/token",
                "type": "POST"
            },
            "body": [
                {
                    "name": "client_id",
                    "type": "string",
                    "description": "the public id of your oauth application",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "refresh_token",
                    "type": "string",
                    "description": "refresh token you retrieved via authorize endpoint",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "grant_type",
                    "type": "string",
                    "description": "",
                    "optional": false,
                    "defaultvalue": "refresh_token"
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "invalid parameters (missing or not correct)",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "access_token",
                    "type": "string",
                    "description": "a fresh access_token",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "refresh_token",
                    "type": "string",
                    "description": "the refresh token you used",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "expire_at",
                    "type": "string",
                    "description": "UTC date at which the token will be considered\n as invalid",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "token_type",
                    "type": "string",
                    "description": "the type of token to use, for now its always Bearer",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "longname": "Auth.retrieveToken",
            "scope": "route",
            "authentication": false
        },
        {
            "route": {
                "name": "/api/oauth/revoke",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "body": [
                {
                    "name": "token",
                    "type": "string",
                    "description": "the refresh token you want to revoke\n if nothing is given, it will revoke the token used to make\n the request",
                    "optional": true,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "404",
                    "description": "token not found",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "the token has been succesfully deleted,\n if there was access token generated with this token, they\n have been deleted too",
                    "optional": false
                }
            ],
            "name": "revoke",
            "longname": "Auth.revoke",
            "scope": "route"
        }
    ],
    "user": [
        {
            "route": {
                "name": "/api/users/otp",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "409",
                    "description": "the otp is already enabled for the user, you can only delete it",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "the otp can be registered for the account, return the full response",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "user",
                    "type": "object",
                    "description": "user model",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "key",
                    "type": "string",
                    "description": "otp secret key",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "qrImage",
                    "type": "string",
                    "description": "url to the QrCode",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "getOtp",
            "longname": "User.getOtp",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/otp",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "body": [
                {
                    "name": "otpKey",
                    "type": "string",
                    "description": "secret key used to generate OTP code",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "otpToken",
                    "type": "string",
                    "description": "a currently valid OTP code generated with the otpKey",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "missing parameters",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "the code asked to add the OTP from user account is invalid",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "error from database",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "the otp has been registered for the user",
                    "optional": false
                }
            ],
            "name": "addOtp",
            "longname": "User.addOtp",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/otp",
                "type": "DELETE"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "query": [
                {
                    "name": "otpToken",
                    "type": "string",
                    "description": "a currently valid OTP code",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "missing parameters",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "the code asked to remove the OTP from user account is invalid",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "error from database",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "the otp has been deleted for the user",
                    "optional": false
                }
            ],
            "name": "removeOtp",
            "longname": "User.removeOtp",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/isLogged",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "200",
                    "description": "the user has been retrieved",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "user",
                    "type": "object",
                    "description": "user model",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "isLogged",
            "longname": "User.isLogged",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/register",
                "type": "GET"
            },
            "body": [
                {
                    "name": "username",
                    "type": "string",
                    "description": "",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "email",
                    "type": "string",
                    "description": "",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "password",
                    "type": "string",
                    "description": "",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "role",
                    "type": "string",
                    "description": "job title in user company",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "company",
                    "type": "string",
                    "description": "company name",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "company_size",
                    "type": "string",
                    "description": "company size",
                    "optional": true,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "either the registeration of new user is disabled or\nthe database failed to register the user",
                    "optional": false
                },
                {
                    "type": "409",
                    "description": "the user field are already used by another user",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "the user has been created",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "user",
                    "type": "object",
                    "description": "user model",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "access_token",
                    "type": "object",
                    "description": "access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "refreshToken",
                    "type": "object",
                    "description": "refresh token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "register",
            "longname": "User.register",
            "scope": "route",
            "authentication": false
        },
        {
            "route": {
                "name": "/api/users/show/:id",
                "type": "GET"
            },
            "params": [
                {
                    "name": ":id",
                    "type": "string",
                    "description": "user id",
                    "optional": false
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "invalid parameters (no id provided)",
                    "optional": false
                },
                {
                    "type": "404",
                    "description": "no user account where found",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "the mail has been sent to the provided email",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "String",
                    "type": "",
                    "description": "email user email",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "String",
                    "type": "",
                    "description": "username user pseudo",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "show",
            "longname": "User.show",
            "scope": "route",
            "authentication": false
        },
        {
            "route": {
                "name": "/api/users/payment/",
                "type": "POST"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "body": [
                {
                    "name": "token",
                    "type": "string",
                    "description": "card token generated by stripe",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "missing parameters",
                    "optional": false
                },
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully added the card",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "object",
                    "description": "stripe credit card object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "attachCreditCard",
            "longname": "User.attachCreditCard",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/subcriptions",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retrieved the charges",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "array",
                    "description": "list of stripe subscriptions object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "listSubscriptions",
            "longname": "User.listSubscriptions",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/charges",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retieved the charges",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "array",
                    "description": "list of stripe charges object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "listCharges",
            "longname": "User.listCharges",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/cards",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retieved the charges",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "array",
                    "description": "list of stripe cards object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "fetchCreditCards",
            "longname": "User.fetchCreditCards",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/card/:card_id",
                "type": "GET"
            },
            "authentication": true,
            "params": [
                {
                    "name": ":card_id",
                    "type": "string",
                    "description": "the stripe id of the card",
                    "optional": false
                }
            ],
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing parameters card_id",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retieved the card",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "array",
                    "description": "stripe card object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "fetchCreditCard",
            "longname": "User.fetchCreditCard",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/card",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "404",
                    "description": "the user doesn't have any default card",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retieved the card",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "array",
                    "description": "stripe card object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "fetchDefaultCreditCard",
            "longname": "User.fetchDefaultCreditCard",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/card",
                "type": "PUT"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "body": [
                {
                    "name": "id",
                    "type": "string",
                    "description": "stripe card id",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "metadata",
                    "type": "object",
                    "description": "the metadata you can update",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "metadata.address_line1",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "metadata.address_country",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "metadata.address_zip",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "metadata.address_city",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing parameters, you need to specify a card",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully updated the card",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "array",
                    "description": "stripe card object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "updateCreditCard",
            "longname": "User.updateCreditCard",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/card/:card_id",
                "type": "DELETE"
            },
            "authentication": true,
            "params": [
                {
                    "name": ":card_id",
                    "type": "string",
                    "description": "the stripe id of the card",
                    "optional": false
                }
            ],
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing parameters card_id",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retieved the card",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "the user must have one card active when having a subscription",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "object",
                    "description": "stripe card object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "deleteCreditCard",
            "longname": "User.deleteCreditCard",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/card/:card_id/default",
                "type": "POST"
            },
            "authentication": true,
            "params": [
                {
                    "name": ":card_id",
                    "type": "string",
                    "description": "the stripe id of the card",
                    "optional": false
                }
            ],
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing parameters card_id",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully set the card as default",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "object",
                    "description": "stripe card object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "setDefaultCard",
            "longname": "User.setDefaultCard",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/card/stripe_metadata",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing parameters card_id",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully retrieved the metadata",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "object",
                    "description": "stripe metadata object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "fetchMetadata",
            "longname": "User.fetchMetadata",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/payment/stripe_metadata",
                "type": "PUT"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "body": [
                {
                    "name": "metadata",
                    "type": "object",
                    "description": "the metadata you can update",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "metadata.vat_number",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "metadata.company_name",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "stripe error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing parameters, you need to specify a card",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully updated the card",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": "data",
                    "type": "array",
                    "description": "stripe customer metadata object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "updateMetadata",
            "longname": "User.updateMetadata",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/update",
                "type": "PUT"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "body": [
                {
                    "name": "username",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "email",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "old_password",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "new_password",
                    "type": "string",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                },
                {
                    "name": "info",
                    "type": "object",
                    "description": "",
                    "optional": true,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "500",
                    "description": "database error",
                    "optional": false
                },
                {
                    "type": "400",
                    "description": "missing parameters, no data to update",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "when updating the password, it need a new one",
                    "optional": false
                },
                {
                    "type": "406",
                    "description": "when updating the password, the old one is false",
                    "optional": false
                },
                {
                    "type": "409",
                    "description": "when updating email or username\n another user already have one of those two",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully updated the card",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "object",
                    "description": "user object",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "update",
            "longname": "User.update",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/integrations",
                "type": "GET"
            },
            "authentication": true,
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "200",
                    "description": "succesfully retrieved providers",
                    "optional": false
                }
            ],
            "response": [
                {
                    "name": ".",
                    "type": "array",
                    "description": "array of providers for user account",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "name": "listProviders",
            "longname": "User.listProviders",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/integrations",
                "type": "POST"
            },
            "authentication": true,
            "body": [
                {
                    "name": "provider",
                    "type": "string",
                    "description": "the provider name",
                    "optional": false,
                    "defaultvalue": null
                },
                {
                    "name": "email",
                    "type": "string",
                    "description": "the email the user have on the provider",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "invalid parameters",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "the user already have this provider",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully added the provider",
                    "optional": false
                }
            ],
            "name": "addProvider",
            "longname": "User.addProvider",
            "scope": "route"
        },
        {
            "route": {
                "name": "/api/users/integrations/:name",
                "type": "DELETE"
            },
            "authentication": true,
            "params": [
                {
                    "name": ":name",
                    "type": "string",
                    "description": "the provider name",
                    "optional": false
                }
            ],
            "header": [
                {
                    "name": "Authorization",
                    "type": "string",
                    "description": "bearer access token issued for the user",
                    "optional": false,
                    "defaultvalue": null
                }
            ],
            "code": [
                {
                    "type": "400",
                    "description": "invalid parameters or provider isn't implemented",
                    "optional": false
                },
                {
                    "type": "403",
                    "description": "the provider isn't enabled",
                    "optional": false
                },
                {
                    "type": "200",
                    "description": "succesfully removed the provider",
                    "optional": false
                }
            ],
            "name": "deleteProvider",
            "longname": "User.deleteProvider",
            "scope": "route"
        }
    ]
}
},{}],30:[function(require,module,exports){
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
          var tokens = res.data;
          return cb(null, tokens);
        }).catch(cb);
      } else if (typeof localStorage !== 'undefined' && localStorage.getItem('refresh_token') !== null) {
        // maybe in the local storage ?
        verifyToken(localStorage.getItem('refresh_token')).then(function (res) {
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

},{"../keymetrics":35,"./strategy":32}],31:[function(require,module,exports){

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

},{"../keymetrics":35,"./strategy":32}],32:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var constants = require('../../constants.js');

var AuthStrategy = function () {
  function AuthStrategy(opts) {
    _classCallCheck(this, AuthStrategy);

    this._opts = opts;
    this.client_id = opts.client_id;
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

},{"../../constants.js":1,"./browser_strategy":30,"./embed_strategy":30,"./standalone_strategy":31}],33:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var RequestValidator = require('./utils/validator');

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

},{"./utils/validator":38}],34:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var axios = require('axios');
var AuthStrategy = require('./auth_strategies/strategy');
var constants = require('../constants');
var logger = require('./utils/debug')('http');

module.exports = function () {
  function HttpWrapper(opts) {
    _classCallCheck(this, HttpWrapper);

    opts.baseURL = opts.API_URL || 'https://api.keymetrics.io';
    this.opts = opts;
    this.tokens = {
      refresh_token: null,
      access_token: null
    };
    this.buckets = [];
    this.authenticated = false;
    this.queue = [];
    this._axios = axios.create(opts);
    this._queueWorker = setInterval(this.queueUpdater.bind(this), 100);
  }

  _createClass(HttpWrapper, [{
    key: 'queueUpdater',
    value: function queueUpdater() {
      if (this.authenticated === false) return;

      // when we are authenticated we can clear the queue
      while (this.queue.length > 0) {
        var promise = this.queue.shift
        // make the request
        ();this.request(promise.request).then(promise.resolve, promise.reject);
      }
    }
  }, {
    key: 'request',
    value: function request(httpOpts) {
      var _this = this;

      if (httpOpts.url.match(/bucket/)) {
        var bucketID = httpOpts.url.split('/')[3];
        var node = this.buckets.filter(function (bucket) {
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
          logger('Queued request to ' + httpOpts.url);
          _this.queue.push({
            resolve: resolve,
            reject: reject,
            request: httpOpts
          });
        } else {
          _this._axios.request(httpOpts).then(resolve, reject);
        }
      });
    }

    /**
     * Update the access token used by the http client
     * @param {String} accessToken the token you want to use
     */

  }, {
    key: 'updateTokens',
    value: function updateTokens(err, data) {
      var _this2 = this;

      if (err) {
        console.error('Error while retrieving tokens : ' + err.message);
        return console.error(err.response.data);
      }
      if (!data || !data.access_token || !data.refresh_token) throw new Error('Invalid tokens');

      this.tokens = data;
      this._axios.defaults.headers.common['Authorization'] = 'Bearer ' + data.access_token;
      this._axios.request({ url: '/api/bucket', method: 'GET' }).then(function (res) {
        _this2.buckets = res.data;
        _this2.authenticated = true;
      }).catch(function (err) {
        console.error('Error while retrieving buckets');
        console.error(err);
      });
    }
  }, {
    key: 'useStrategy',
    value: function useStrategy(flow, opts) {
      // if client not provided here, use the one given in the instance
      if (!opts || !opts.client_id) {
        if (!opts) opts = {};
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
      var flowMeta = AuthStrategy.implementations(flow

      // verify that the environnement condition is meet
      );if (flowMeta.condition && constants.ENVIRONNEMENT !== flowMeta.condition) {
        throw new Error('The flow ' + flow + ' is reserved for ' + flowMeta.condition + ' environ sment');
      }
      var FlowImpl = flowMeta.nodule;
      this.oauth_flow = new FlowImpl(opts);
      return this.oauth_flow.retrieveTokens(this.updateTokens.bind(this));
    }
  }]);

  return HttpWrapper;
}();

},{"../constants":1,"./auth_strategies/strategy":32,"./utils/debug":37,"axios":2}],35:[function(require,module,exports){

'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var mapping = require('./api_mappings.json');
var Namespace = require('./namespace');
var HttpWrapper = require('./http');
var constants = require('../constants');
var logger = require('./utils/debug')();

var Keymetrics = function () {
  /**
  * @constructor
  * Keymetrics
  *
  * @param {object} opts The options are passed to the children instances
  */
  function Keymetrics(opts) {
    _classCallCheck(this, Keymetrics);

    logger('init keymetrics instance');
    this.opts = Object.assign(constants, opts);

    this.version = 1;

    logger('init http client');
    this.http = new HttpWrapper(this.opts);

    // build namespaces at startup
    logger('building namespaces');
    var root = new Namespace(mapping, {
      name: 'root',
      http: this.http
    });
    logger('exposing namespaces');
    for (var key in root) {
      if (key === 'name' || key === 'opts') continue;
      this[key] = root[key];
      Keymetrics[key] = root[key];
    }
    logger('attached namespaces : ' + Object.keys(this));
  }

  /**
   * Use a specific flow to retrieve an access token on behalf the user
   * @param {String|Function} flow either a flow name or a custom implementation
   * @param {Object} opts
   */


  _createClass(Keymetrics, [{
    key: 'use',
    value: function use(flow, opts) {
      logger('using ' + flow + ' authentication strategy');
      this.http.useStrategy(flow, opts);
      return this;
    }
  }]);

  return Keymetrics;
}();

module.exports = Keymetrics;

},{"../constants":1,"./api_mappings.json":29,"./http":34,"./namespace":36,"./utils/debug":37}],36:[function(require,module,exports){

'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Endpoint = require('./endpoint');
var logger = require('./utils/debug')('namespace');

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

},{"./endpoint":33,"./utils/debug":37}],37:[function(require,module,exports){
(function (process,global){

'use strict';

module.exports = function (namespace) {
  var key = 'kmjs' + (namespace ? ':' + namespace : '');
  return function () {
    // retrieve the current debug level
    var debugKey = (process ? process.env.DEBUG : global.DEBUG) || '';
    // if the debug is enabled for this namespace
    if (!debugKey.match(key)) return;
    // log it to console.error
    console.error.apply(this, arguments);
  };
};

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":28}],38:[function(require,module,exports){

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

                  var value = args.shift
                  // params should always be a string since they will be replaced in the url
                  ();if (typeof value !== 'string') {
                    return reject(new Error('Expected to receive string argument for ' + param.name + ' to match but got ' + value));
                  }
                  httpOpts.url = httpOpts.url.replace(param.name, value);
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

                  var _value = args.shift
                  // query should always be a string
                  ();if (typeof _value !== 'string') {
                    return reject(new Error('Expected to receive string argument for ' + _param.name + ' query but got ' + _value));
                  }
                  httpOpts.params[_param.name] = _value;
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

                  var _value2 = args.shift
                  // params should always be a string since they will be replaced in the url
                  ();if (typeof _value2 !== 'string') {
                    return reject(new Error('Expected to receive string argument for ' + _param2.name + ' to match but got ' + _value2));
                  }
                  // replace param in url
                  httpOpts.url = httpOpts.url.replace(_param2.name, _value2);
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
                for (var _iterator4 = endpoint.body[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                  var field = _step4.value;

                  // verify that the mandatory field are here
                  if (!data[field.name] && field.optional === false && field.defaultvalue === null) {
                    return reject(new Error('Missing mandatory field ' + field.name + ' to make a POST request on ' + endpoint.route.name));
                  }
                  // verify that the mandatory field are the good type
                  if (_typeof(data[field.name]) !== field.type && field.optional === false && field.defaultvalue === null) {
                    return reject(new Error('Invalid type for field ' + field.name + ', expected ' + field.type + ' but got ' + _typeof(data[field.name])));
                  }

                  // add it to the request only when its present
                  if (typeof data[field.name] !== 'undefined') {
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

                  var _value3 = args.shift
                  // params should always be a string since they will be replaced in the url
                  ();if (typeof _value3 !== 'string') {
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

                  var _value4 = args.shift
                  // query should always be a string
                  ();if (typeof _value4 !== 'string') {
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

},{}],"/":[function(require,module,exports){
'use strict';

module.exports = require('./src/keymetrics.js');

},{"./src/keymetrics.js":35}]},{},[])("/")
});