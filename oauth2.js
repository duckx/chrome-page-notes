/*
 * Copyright 2011 Google Inc. All Rights Reserved.

 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *

 * Directive for JSLint, so that it doesn't complain about these names not being
 * defined.
 */
/*global location, localStorage, alert, chrome, confirm, console, FormData, XMLHttpRequest */

/**
 * Constructor
 *
 * @param {Object} config Containing clientId, clientSecret, apiScope and
 * redirectURL
 */
var OAuth2 = function (config) {
  var that = this;
  var data = that.get();
  data.clientId = config.client_id;
  data.clientSecret = config.client_secret;
  data.apiScope = config.api_scope;
  data.redirectURL = config.redirect_url;
  data.accessTokenURL = 'https://accounts.google.com/o/oauth2/token';
  that.setSource(data);
};

OAuth2.prototype.authorizationCodeURL = function (config) {
  return ('https://accounts.google.com/o/oauth2/auth?' +
      'client_id={{CLIENT_ID}}&' +
      'redirect_uri={{REDIRECT_URI}}&' +
      'scope={{API_SCOPE}}&' +
      'access_type=offline&' +
      'response_type=code')
        .replace('{{CLIENT_ID}}', config.clientId)
        .replace('{{REDIRECT_URI}}', config.redirectURL)
        .replace('{{API_SCOPE}}', config.apiScope);
};

OAuth2.prototype.parseAuthorizationCode = function (title) {
  var error = title.match(/[&\?]error=([^&]+)/);
  if (error) {
    throw 'Error getting authorization code: ' + error[1];
  }
  return title.match(/Success code=([\w\/\-]+)/)[1];
};

OAuth2.prototype.accessTokenParams = function (authorizationCode, config) {
  return {
    code: authorizationCode,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectURL,
    grant_type: 'authorization_code'
  };
};

OAuth2.prototype.parseAccessToken = function (response) {
  var parsedResponse = JSON.parse(response);
  return {
    accessToken: parsedResponse.access_token,
    refreshToken: parsedResponse.refresh_token,
    expiresIn: parsedResponse.expires_in
  };
};

/**
 * Opens up an authorization popup window. This starts the OAuth 2.0 flow.
 *
 * @param {Function} callback Method to call when the user finished auth.
 */
OAuth2.prototype.openAuthorizationCodePopup = function (callback) {
  // Store a reference to the callback so that the newly opened window can call
  // it later.
  var that = this;

  // Create a new tab with the OAuth 2.0 prompt
  // Get current tab index. We want to create new tab next to the current one.
  chrome.tabs.create({url: this.authorizationCodeURL(this.getConfig())},
    function (tab) {
      // 1. Watch the tab.
      // 2. When code becomes available in the title, get the title.
      // 3. Close the tab and finish OAuth flow.
      chrome.tabs.onUpdated.addListener(
        function (tabId, changeInfo, newTab) {
          if (tabId !== tab.id) {
            return;
          }
          if (changeInfo.status === 'complete') {
            if (newTab.title.search('code') > 0) {
              var title = newTab.title;
              chrome.tabs.remove(tab.id, function () { that.finishAuth(title, callback); });
            }
          }
        }
      );
    });
};

/**
 * Gets access and refresh (if provided by endpoint) tokens
 *
 * @param {String} authorizationCode Retrieved from the first step in the process
 * @param {Function} callback Called back with 3 params:
 *                            access token, refresh token and expiry time
 */
OAuth2.prototype.getAccessAndRefreshTokens = function (authorizationCode, callback) {
  var that = this;
  // Make an XHR to get the token
  var xhr = new XMLHttpRequest();
  xhr.addEventListener('readystatechange', function (event) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        // Callback with the data (incl. tokens).
        callback(that.parseAccessToken(xhr.responseText));
      }
    }
  });

  var method = 'POST';
  var items = that.accessTokenParams(authorizationCode, that.getConfig());
  var key = null;
  if (method === 'POST') {
    var formData = new FormData();
    for (key in items) {
      formData.append(key, items[key]);
    }
    xhr.open(method, that.get('accessTokenURL'), true);
    xhr.send(formData);
  } else if (method === 'GET') {
    var url = that.get('accessTokenURL');
    var params = '?';
    for (key in items) {
      params += encodeURIComponent(key) + '=' +
                encodeURIComponent(items[key]) + '&';
    }
    xhr.open(method, url + params, true);
    xhr.send();
  } else {
    throw method + ' is an unknown method';
  }
};

/**
 * Refreshes the access token using the currently stored refresh token
 *
 * @param {String} refreshToken A valid refresh token
 * @param {Function} callback On success, called with access token and expiry time
 */
OAuth2.prototype.refreshAccessToken = function (refreshToken, callback) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function (event) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        // Parse response with JSON
        var obj = JSON.parse(xhr.responseText);
        // Callback with the tokens
        callback(obj.access_token, obj.expires_in);
      }
    }
  };

  var data = this.get();
  var formData = new FormData();
  formData.append('client_id', data.clientId);
  formData.append('client_secret', data.clientSecret);
  formData.append('refresh_token', refreshToken);
  formData.append('grant_type', 'refresh_token');
  xhr.open('POST', this.get('accessTokenURL'), true);
  xhr.send(formData);
};

/**
 * Extracts authorizationCode from the URL and makes a request to the last
 * leg of the OAuth 2.0 process.
*/
OAuth2.prototype.finishAuth = function (title, callback) {
  var authorizationCode = null;
  var that = this;

  try {
    authorizationCode = that.parseAuthorizationCode(title);
  } catch (e) {
    console.error(e);
  }

  that.getAccessAndRefreshTokens(authorizationCode, function (response) {
    var data = that.get();
    data.accessTokenDate = new Date().valueOf();

    // Set all data returned by the OAuth 2.0 provider.
    for (var name in response) {
      if (response.hasOwnProperty(name) && response[name]) {
        data[name] = response[name];
      }
    }

    that.setSource(data);
    callback();
  });
};

/**
 * @return True iff the current access token has expired
 */
OAuth2.prototype.isAccessTokenExpired = function () {
  var data = this.get();
  // Provide a 30 seconds buffer to the actual expiry time. This is important
  // to make sure that we don't assume that the token is good exactly at the
  // second when it's going to expire.
  var expiresIn = (data.expiresIn - 30) * 1000;
  return (new Date().valueOf() - data.accessTokenDate) > expiresIn;
};

/**
 * Get the persisted data in localStorage. Optionally, provide a
 * property name to only retrieve its value.
 *
 * @param {String} [name] The name of the property to be retrieved.
 * @return The data object or property value if name was specified.
 */
OAuth2.prototype.get = function(name) {
  var src = this.getSource();
  var obj = src ? JSON.parse(src) : {};
  return name ? obj[name] : obj;
};

/**
 * Set the value of a named property on the persisted data in
 * localStorage.
 *
 * @param {String} name The name of the property to change.
 * @param value The value to be set.
 */
OAuth2.prototype.set = function (name, value) {
  var obj = this.get();
  obj[name] = value;
  this.setSource(obj);
};

/**
 * Clear all persisted data in localStorage. Optionally, provide a
 * property name to only clear its value.
 *
 * @param {String} [name] The name of the property to clear.
 */
OAuth2.prototype.clear = function (name) {
  if (name) {
    var obj = this.get();
    delete obj[name];
    this.setSource(obj);
  } else {
    delete localStorage.oauth2;
  }
};

/**
 * Get the JSON string for the object stored in localStorage.
 *
 * @return {String} The source JSON string.
 */
OAuth2.prototype.getSource = function () {
  return localStorage.oauth2;
};

/**
 * Set the JSON string for the object stored in localStorage.
 *
 * @param {Object|String} source The new JSON string/object to be set.
 */
OAuth2.prototype.setSource = function (source) {
  if (!source) {
    return;
  }
  if (typeof source !== 'string') {
    source = JSON.stringify(source);
  }
  localStorage.oauth2 = source;
};

/**
 * Get the configuration parameters.
 *
 * @returns {Object} Contains clientId, clientSecret and apiScope.
 */
OAuth2.prototype.getConfig = function () {
  var data = this.get();
  return {
    clientId: data.clientId,
    clientSecret: data.clientSecret,
    apiScope: data.apiScope,
    redirectURL: data.redirectURL
  };
};

/***********************************
 *
 * PUBLIC API
 *
 ***********************************/

/**
 * Authorizes the OAuth authenticator instance.
 *
 * @param {Function} callback Tries to callback when auth is successful
 *                            Note: does not callback if grant popup required
 */
OAuth2.prototype.authorize = function (callback) {
  var that = this;
  var data = that.get();
  if (!data.accessToken) {
    // There's no access token yet. Start the authorizationCode flow
    that.openAuthorizationCodePopup(callback);
  } else if (that.isAccessTokenExpired()) {
    // There's an existing access token but it's expired
    if (data.refreshToken) {
      that.refreshAccessToken(data.refreshToken, function (at, exp) {
        var newData = that.get();
        newData.accessTokenDate = new Date().valueOf();
        newData.accessToken = at;
        newData.expiresIn = exp;
        that.setSource(newData);
        // Callback when we finish refreshing
        if (callback) {
          callback.call(that);
        }
      });
    } else {
      // No refresh token... just do the popup thing again
      that.openAuthorizationCodePopup(callback);
    }
  } else {
    // We have an access token, and it's not expired yet
    if (callback) {
      callback.call(that);
    }
  }
};

/**
 * @returns A valid access token.
 */
OAuth2.prototype.getAccessToken = function () {
  return this.get('accessToken');
};

/**
 * Indicate whether or not a valid access token exists.
 *
 * @returns {Boolean} True if an access token exists; otherwise false.
 */
OAuth2.prototype.hasAccessToken = function () {
  return !!this.get('accessToken');
};

/**
 * Clears an access token, effectively "logging out" of the service.
 */
OAuth2.prototype.clearAccessToken = function () {
  this.clear('accessToken');
};

/**
 * Returns authorization header.
 */
OAuth2.prototype.getAuthorizationHeader = function (callback) {
  var authHeader;
  var that = this;
  this.authorize(function () {
    callback('Bearer ' + this.get('accessToken'));
  });
};
