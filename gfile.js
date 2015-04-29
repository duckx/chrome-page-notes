/*
 * Copyright 2012 Manu Garg.
 * @author manugarg@google.com (Manu Garg)
 
 * Directive for JSLint, so that it doesn't complain about these names not being
 * defined.
 */
/*global location, alert, chrome, confirm, XMLHttpRequest */

"use strict";

var filesUrl = 'https://www.googleapis.com/drive/v2/files';
var filesUploadUrl = 'https://www.googleapis.com/upload/drive/v2/files';

var bgPage = chrome.extension.getBackgroundPage();

function stringify(parameters) {
  var p, params = [];
  for (p in parameters) {
    params.push(encodeURIComponent(p) + '=' +
      encodeURIComponent(parameters[p]));
  }
  return params.join('&');
}

/**
 * Send an authorized XMLHttpRequest.
 *
 * @param {Object} request Request object {'method', 'parameters', 'body'}.
 * @param {String} url Request URL. (default: filesUrl).
 */

function sendRequest(request, url, callback) {
  url = url ? url : filesUrl;
  url = request.parameters ? url + '?' + stringify(request.parameters) : url;

  var xhr = new XMLHttpRequest();
  xhr.open(request.method, url, false);

  var header;
  for (header in request.headers) {
    if (request.headers.hasOwnProperty(header)) {
      xhr.setRequestHeader(header, request.headers[header]);
    }
  }
  // Attach the authorization header.
  bgPage.oauth.getAuthorizationHeader(function(authHeader) {
    xhr.setRequestHeader('Authorization', authHeader);
    xhr.send(request.body);
  });
  callback(xhr);
}

/**
 * Constructor for GoogleFile
 *
 * @param {String} src Stringified Google file metadata.
 * @param {Function} setSource Method to call to persist metadata string.
 */
var GoogleFile = function(sourceString, setSource) {
  this.src = sourceString;
  this.setSource = setSource;
};

GoogleFile.prototype.set = function(obj) {
  this.src = JSON.stringify(obj);
  this.setSource(this.src);
};

GoogleFile.prototype.get = function(key) {
  var obj = this.src ? JSON.parse(this.src) : {};
  return key ? obj[key] : obj;
};

GoogleFile.prototype.update = function(response) {
  var obj = JSON.parse(response);
  if (obj.kind === 'drive#file') {
    this.set(obj);
  }
};

GoogleFile.prototype.getLastUpdateTime = function() {
  return Date.parse(this.get('modifiedDate'));
};

/**
 * Create a new Google drive file.
 *
 * @param {String} fileName Name of the new file.
 */
GoogleFile.prototype.createNewFile = function(fileName) {
  if (!fileName) {
    throw 'File name is not defined';
  }
  var request = {
    'method': 'POST',
    'headers': {
      'Content-Type': 'application/json'
    },
    'body': JSON.stringify({
      'title': fileName,
      'mimeType': 'text/plain'
    })
  };
  var that = this;
  sendRequest(request, null, function(xhr) {
    if (xhr.status !== 200) {
      throw 'There was a problem in setting up the sync. ' +
        'Last request status: ' + xhr.status + '\n' + xhr.responseText;
    }
    that.update(xhr.responseText);
  });
};

/**
 * Search for a file in Google drive by name.
 *
 * @param {String} fileName Name to search by.
 */
GoogleFile.prototype.searchFileByName = function(fileName) {
  if (!fileName) {
    throw 'File name is not defined';
  }
  var request = {
    'method': 'GET',
    'parameters': {
      'q': 'title=\'' + fileName + '\' and trashed = false'
    }
  };
  var that = this;
  sendRequest(request, null, function(xhr) {
    if (xhr.status !== 200) {
      throw 'There was a problem in searching for the doc - ' + fileName + '.' +
        'Last request status: ' + xhr.status + '\n' + xhr.responseText;
    }
    var response = JSON.parse(xhr.responseText);
    if (response.hasOwnProperty('items') &&
      response.items instanceof Array &&
      response.items.length > 0) {
      that.set(response.items[0]);
    }
  });
};

/**
 * Download remote file's metadata and store it locally.
 *
 * @param {String} callback(gFile) Function to call after local metadata refresh.
 */
GoogleFile.prototype.refreshLocalMetadata = function(callback) {
  var that = this;
  sendRequest({
    'method': 'GET'
  }, this.get('selfLink'), function(xhr) {
    if (xhr.status !== 200) {
      throw 'There was a problem in refreshing the doc entry. ' +
        'Last request status: ' + xhr.status + '\n' + xhr.responseText;
    }
    that.update(xhr.responseText);
    callback(that);
  });
};

/**
 * Get data from the remote file.
 *
 */
GoogleFile.prototype.getData = function(callback) {
  sendRequest({
    'method': 'GET'
  }, this.get('downloadUrl'), function(xhr) {
    if (xhr.status !== 200) {
      throw 'There was a problem downloading the doc. ' +
        'Last request status: ' + xhr.status + '\n' + xhr.responseText;
    }
    callback(xhr.responseText);
  });
};

/**
 * Upload local data to the remote file.
 *
 * @param {String} data Data to upload.
 */
GoogleFile.prototype.setData = function(data) {
  // Make sure data is not undefined.
  data = data || '';
  var request = {
    'method': 'PUT',
    'headers': {
      'Content-Type': 'text/plain'
    },
    'parameters': {
      'uploadType': 'media'
    },
    'body': data
  };
  var url = filesUploadUrl + '/' + this.get('id');
  var that = this;
  sendRequest(request, url, function(xhr) {
    if (xhr.status !== 200) {
      throw 'There was a problem in updating the doc. ' +
        'Last request status: ' + xhr.status + '\n' + xhr.responseText;
    }
    that.update(xhr.responseText);
  });
};
