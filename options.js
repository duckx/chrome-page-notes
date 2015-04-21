/*
 * Copyright 2012 Manu Garg.
 * @author manugarg@google.com (Manu Garg)
 
 * Directive for JSLint, so that it doesn't complain about these names not being
 * defined.
 */
/*global document, location, localStorage, alert, chrome, confirm */

"use strict";

var bgPage = chrome.extension.getBackgroundPage();

function e(id) {
  return document.getElementById(id);
}

function notify(msg) {
  e('error').innerHTML = msg;
}

function setupSync() {
  // Clear debug log.
  bgPage.debug.msg = '';
  try {
    if (!bgPage.oauth || !bgPage.oauth.hasAccessToken()) {
      if (!confirm('You\'ll be redirected to Google website to set ' +
        'up authentication.')) {
        return;
      }
      localStorage.nextAction = 'setup_sync';
      if (!bgPage.oauth) {
        bgPage.setUpOauth();
      }
      bgPage.oauth.authorize(function() {
        location.reload();
      });
      return;
    }
    if (!localStorage.gFile) {
      var gFile = new bgPage.GoogleFile(null, bgPage.saveGFile);
      gFile.searchFileByName(bgPage.REMOTE_FILE_NAME);
      if (!localStorage.gFile) {
        gFile.createNewFile(bgPage.REMOTE_FILE_NAME);
        localStorage.lastModTime = new Date().getTime();
      }
    }
  } catch (e) {
    notify('There was an error in setting up sync. Click on "Debug info" ' +
      'for more information.');
    bgPage.debug.log(e);
    return;
  }
  bgPage.lastSyncStatus = '';
  localStorage.firstSync = 'true';
  location.reload();
}

function handleSyncButton() {
  var syncButton = e('setup_sync');
  if (syncButton.name === 'cancel_sync') {
    if (confirm('Are you sure you want to clear the sync setup?')) {
      localStorage.removeItem('gFile');
      bgPage.oauth.clearAccessToken();
      bgPage.lastSyncStatus = '';
      location.reload();
    }
  } else {
    setupSync();
  }
}

function updateFeatureButtons() {
  var options_keys = [];
  var els = document.getElementsByClassName('feature_option');
  for (var i = 0; i < els.length; i++) {
    options_keys.push(els[i].id);
  }
  options_keys.forEach(function(key) {
    var stored_value = bgPage.options.get(key);
    if (typeof stored_value != 'undefined') {
      e(key).checked = stored_value;
    }
    e(key).addEventListener('change', function() {
      bgPage.options.set(key, e(key).checked);
    });
  });
}

function syncStatus() {
  var syncButton = e('setup_sync');
  var authButton = e('auth_button');
  var syncStatus = e('sync_status');
  var syncNowButton = e('sync_now');
  if (localStorage.gFile) {
    var gFile = bgPage.getRemoteFile();
    if (gFile && gFile.get('alternateLink')) {
      syncStatus.innerHTML = 'Syncing to <a href="' +
        gFile.get('alternateLink') + '">this file</a>. ';
    }
    syncButton.innerHTML = 'Stop Syncing';
    syncButton.name = 'cancel_sync';
    syncNowButton.disabled = false;
  } else {
    syncStatus.innerHTML = 'Not syncing now. ';
    syncButton.innerHTML = 'Setup Sync';
    syncButton.name = 'setup_sync';
    syncNowButton.disabled = true;
    bgPage.lastSyncStatus = '';
  }
  if (bgPage.lastSyncStatus === 'good') {
    var lastSyncTime = new Date(localStorage.lastSyncTime);
    var syncLast = Math.floor((new Date() - lastSyncTime) / 60000);
    syncStatus.innerHTML += 'Synced ' + (syncLast === 0 ?
      'less than a minute ago.' : syncLast + ' min ago.');
  } else {
    if (bgPage.lastSyncStatus) {
      notify('There was an error during sync. Click on "Show debug info" for ' +
        'more information.');
    }
  }
}

function initUI() {
  if (localStorage.majorUpdate) {
    notify('Note: Your sync has been disabled after the last major update. ' +
      'Unfortunately, you will have to set it up again (click on ' +
      '"Setup Sync"). Your existing data will not be lost.');
    localStorage.removeItem('majorUpdate');
  }
  e('debug').innerHTML = 'Messages from last sync: \n' + bgPage.debug.msg;
  updateFeatureButtons();
  syncStatus();
  if (!bgPage.pageNotes.getSource()) {
    e('clear_local').disabled = true;
  }
  // Following is part of the setup sync workflow.
  if (localStorage.hasOwnProperty('nextAction') && localStorage.nextAction === 'setup_sync') {
    localStorage.nextAction = '';
    setupSync();
  }
}


function setupShowHideElements() {
  var els = document.getElementsByClassName('show_hide');
  for (var i = 0; i < els.length; i++) {
    els[i].addEventListener('click', function() {
      var e_id = this.id.replace('show_', '');
      if (e(e_id).style.display === 'none') {
        e(e_id).style.display = 'block';
      } else {
        e(e_id).style.display = 'none';
      }
    });
  }
}

function setupHandlers() {
  setupShowHideElements();
  e('setup_sync').addEventListener('click', handleSyncButton);
  e('sync_now').addEventListener('click', function() {
    bgPage.sync();
    location.reload();
  });
  e('clear_local').addEventListener('click', function() {
    if (confirm('Are you sure you want to delete all local data?')) {
      localStorage.removeItem('pagenotes');
      location.reload();
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  initUI();
  setupHandlers();
});
