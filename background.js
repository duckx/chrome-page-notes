/*
 * Copyright 2012 Manu Garg.
 * @author manugarg@google.com (Manu Garg)
 
 * Directive for JSLint, so that it doesn't complain about these names not being
 * defined:
 */
/*global document, window, localStorage, chrome, GoogleFile, PageNotes, OAuth2 */

"use strict";

var SYNC_INTERVAL = 5 * 60 * 1000; // In ms. Equivalent to 5 min.
var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
var REMOTE_FILE_NAME = 'pagenotes.data';
var RED_COLOR = {'color': [255, 0, 0, 255]};
var GREEN_COLOR = {'color': [42, 115, 109, 255]};

var oauth = null;
var pageNotes = new PageNotes();
var options = new Options();

function setUpOauth() {
  oauth = new OAuth2({
    'client_id': '702868056438.apps.googleusercontent.com',
    // We use installed applications OAuth2 flow so client_secret
    // is not really a secret here.
    // https://developers.google.com/accounts/docs/OAuth2#installed
    'client_secret': 'P-jAwCRjzcXEGZsWZVNQwvWE',
    'api_scope': DRIVE_SCOPE,
    'redirect_url': 'urn:ietf:wg:oauth:2.0:oob'
  });
}

var debug = {
  msg: '',
  log: function (s) { this.msg += s + '\n'; }
};

var lastSyncStatus;

// Update badge text on tab change.
chrome.tabs.onSelectionChanged.addListener(function (tabId) {
  chrome.tabs.get(tabId, updateBadgeForTab);
});

// Update badge text on tab update.
chrome.tabs.onUpdated.addListener(function (tabId, changeinfo, tab) {
  updateBadgeForTab(tab);
});


function getHostFromUrl(url) {
  var a_element = document.createElement("a");
  a_element.href = url;
  return a_element.hostname;
}

function setIcon(tab, suffix, badgeText) {
  chrome.browserAction.setIcon({
    path: {
      19: 'icons/icon' + suffix + '_19.png',
      38: 'icons/icon' + suffix + '_38.png'
    },
    tabId: tab.id
  });
  chrome.browserAction.setBadgeText({
    'text': badgeText,
    'tabId': tab.id
  });
}

function updateBadgeForTab(tab) {
  var tabUrl = tab.url;
  var tabHost = getHostFromUrl(tabUrl);
  var pn = pageNotes.get(tabUrl) || pageNotes.get(tabHost);
  if (pn) {
    if (bgPage.options.get('old_icons')) {
      setIcon(tab, '_old', 'pn');
    } else {
      setIcon(tab, '_filled', '');
    }
  } else {
    if (bgPage.options.get('old_icons')) {
      setIcon(tab, '_old', '0');
    } else {
      setIcon(tab, '', '');
    }
  }
}

function saveGFile(src) {
  localStorage.gFile = src;
}

function getRemoteFile() {
  return new GoogleFile(localStorage.gFile, saveGFile);
}

function setVisualCues() {
  if (getSyncFailCount() >= 2) {
    chrome.browserAction.setBadgeBackgroundColor(RED_COLOR);
    chrome.browserAction.setTitle({
      'title': 'Page Notes - Sync is not ' + 'happening.'
    });
  } else {
    chrome.browserAction.setBadgeBackgroundColor(GREEN_COLOR);
    chrome.browserAction.setTitle({
      'title': 'Page Notes'
    });
  }
}

function sync() {
  debug.msg = '';
  debug.log('sync: Starting sync at: ' + new Date());

  if (!oauth && localStorage.oauth2) {
     // If oauth2 is stored in localStorage, set it up oauth object.
    setUpOauth();
  }
  if (!oauth || !oauth.hasAccessToken()) {
    setVisualCues();
    debug.log('sync: No Oauth token found.');
    return;
  }
  if (!localStorage.gFile) {
    setVisualCues();
    debug.log('sync: Sync gdoc is not setup.');
    return;
  }

  var remoteFile = getRemoteFile();
  try {
    if (localStorage.firstSync === 'true') {
      debug.log('sync: First sync, merging local and remote data.');
      mergeLocalAndRemoteData(remoteFile);
      localStorage.firstSync = 'false';
    } else {
      remoteFile.refreshLocalMetadata(syncData);
    }
  } catch (e) {
    lastSyncStatus = 'bad';
    incSyncFailCount();
    setVisualCues();
    debug.log(e);
    return;
  }
  lastSyncStatus = 'good';
  resetSyncFailCount();
  localStorage.lastSyncTime = new Date();
  setVisualCues();
}

function syncData(gFile) {
  var localLastModTime = 0;
  if (localStorage.lastModTime) {
    localLastModTime = parseInt(localStorage.lastModTime, 10);
  }
  var remoteLastModTime = parseInt(gFile.getLastUpdateTime(), 10);
  debug.log('sync: Local last mod time: ' + localLastModTime);
  debug.log('sync: Remote last mod time: ' + remoteLastModTime);
  if (remoteLastModTime === localLastModTime) {
    debug.log('sync: Local and remote data are equally recent.');
    return;
  }
  if (remoteLastModTime > localLastModTime) {
    debug.log('sync: Remote data is more recent.');
    // syncToLocal();
    gFile.getData(pageNotes.setSource.bind(pageNotes));
    localStorage.lastModTime = gFile.getLastUpdateTime();
    // Convert if remote pagenotes were in old format.
    // TODO(manugarg): Remove after upgrade to > 2.2.3 is complete
    convertPageNotes();
  } else {
    debug.log('sync: Local data is more recent.');
    // syncToRemote();
    gFile.setData(pageNotes.getSource());
    localStorage.lastModTime = gFile.getLastUpdateTime();
  }
}

function mergeLocalAndRemoteData(gFile) {
  var mergedDataString;

  var localDataString = pageNotes.getSource();
  if (!localDataString) {
    // If there is no local data, just set local data to remote data.
    gFile.getData(pageNotes.setSource.bind(pageNotes));
    localStorage.lastModTime = gFile.getLastUpdateTime();
    // convert page notes if required
    convertPageNotes();
    return;
  }

  var localData = JSON.parse(localDataString);

  // Figure out if remote data is newer. This information is used if a key
  // exists in both locations - local and remote.
  var localLastModTime = 0;
  if (localStorage.lastModTime) {
    localLastModTime = parseInt(localStorage.lastModTime, 10);
  }
  var remoteIsNewer = parseInt(gFile.getLastUpdateTime(), 10) > localLastModTime;

  // Sync the keys (url or host) between local and remote data.
  gFile.getData(function (remoteDataString) {
    var key;
    var mergedData = {};
    if (remoteDataString.trim() === '') {
      mergedDataString = localDataString;
      return;
    }
    var remoteData = JSON.parse(remoteDataString);
    for (key in localData) {
      if (localData.hasOwnProperty(key)) {
        mergedData[key] = localData[key];
        if (remoteData.hasOwnProperty(key) && remoteIsNewer) {
          mergedData[key] = remoteData[key];
          // Remove the matched key from 'remoteData'. If any keys are left in
          // remoteData after this loop is done, it would mean that remoteData has
          // more number of keys.
          delete remoteData[key];
        }
      }
    }
    // Copy extra data in remoteData to local data.
    for (key in remoteData) {
      if (remoteData.hasOwnProperty(key)) {
        mergedData[key] = remoteData[key];
      }
    }
    mergedDataString = JSON.stringify(mergedData);
  });
  // Convert merged data string if required
  // TODO(manugarg): Remove after upgrade to > 2.2.3 is complete
  mergedDataString = convertPageNotesString(mergedDataString);
  pageNotes.setSource(mergedDataString);
  gFile.setData(mergedDataString);
  localStorage.lastModTime = gFile.getLastUpdateTime();
}

function incSyncFailCount() {
  if (localStorage.syncFailCount) {
    localStorage.syncFailCount = parseInt(localStorage.syncFailCount, 10) + 1;
    return;
  }
  localStorage.syncFailCount = '1';
}

function resetSyncFailCount() {
  localStorage.syncFailCount = '0';
}

function getSyncFailCount() {
  if (!localStorage.syncFailCount) {
    localStorage.syncFailCount = '0';
  }
  return parseInt(localStorage.syncFailCount, 10);
}

function init() {
  versionTracking();
  convertPageNotes();
  handleFirstRun();
  handleIconsUpdate();
  //chrome.tabs.getSelected(null, updateBadgeForTab);
  sync();
}

// TODO(manugarg): Remove after upgrade to > 2.2.3 is complete
function convertPageNotes() {
  if (!pageNotes.getSource()) {
    return;
  }
  var pageNotesString = convertPageNotesString(pageNotes.getSource());
  if (pageNotesString !== pageNotes.getSource()) {
    pageNotes.setSource(pageNotesString);
    localStorage.lastModTime = new Date().getTime();
    sync();
  }
}

// TODO(manugarg): Remove after upgrade to > 2.2.3 is complete
function convertPageNotesString(pageNotesString) {
  var obj = JSON.parse(pageNotesString);
  var today = new Date();
  for (var i in obj) {
    if (typeof obj[i] == "string") {
      // this is before 2.3.x
      // Add date field to page notes
      obj[i] = [obj[i], today];
    }
  }
  return JSON.stringify(obj);
}

function versionTracking() {
  var manifest = chrome.runtime.getManifest();
  if (!localStorage.currentVersion || localStorage.currentVersion !== manifest.version) {
    localStorage.lastVersion = localStorage.currentVersion;
    localStorage.currentVersion = manifest.version;
  }
}

function handleIconsUpdate() {
  if (!localStorage.warnedAboutIcons) {
    chrome.tabs.create({'url': chrome.extension.getURL('options.html')});
  }
}

function handleFirstRun() {
  if (!localStorage.runOnce) {
    localStorage.runOnce = true;
    // If sync is not setup, open the options page.
    if (!localStorage.gFile) {
      chrome.tabs.create({'url': chrome.extension.getURL('options.html')});
    }
  }
}

function deleteButtonHandler(elem, key, callback, warningMessage) {
  if (elem.innerHTML === 'No') {
    callback();
    return;
  }
  if (elem.innerHTML !== 'Yes' && elem.innerHTML !== 'No') {
    var deleteBlock = elem.parentNode;
    // Clear parent div.
    while (deleteBlock.firstChild) {
      deleteBlock.removeChild(deleteBlock.firstChild);
    }
    deleteBlock.innerHTML = warningMessage;

    var confirmButtons = ['Yes', 'No'];
    for (var i = 0; i < confirmButtons.length; i++) {
      var button = document.createElement('button');
      button.innerHTML = confirmButtons[i];
      button.addEventListener('click', function() {
        deleteButtonHandler(this, key, callback, '');
      }); 
      deleteBlock.appendChild(button);
    }
    return;
  }
  pageNotes.remove(key);
  localStorage.lastModTime = new Date().getTime();
  callback();
}

document.addEventListener('DOMContentLoaded', function () {
  window.setInterval(sync, SYNC_INTERVAL);
  init();
});
