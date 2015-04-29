/*
 * Copyright 2012 Manu Garg.
 * @author manugarg@google.com (Manu Garg)
 
 * Directive for JSLint, so that it doesn't complain about these names not being
 * defined.
 */
/*global chrome, document, localStorage, window */

var bgPage = chrome.extension.getBackgroundPage();

// Global variable for selected tab.
var tab;
var notes;

function e(id) {
  return document.getElementById(id);
}

function handleEncOptionsVisibility() {
  var disable_enc = bgPage.options.get('disable_encryption');
  if (e('encrypt').checked) {
    e('encryption-option').style.display = 'block';
    e('encrypt-passphrase-div').style.display = 'block';
    return;
  }
  if (disable_enc) {
    e('encryption-option').style.display = 'none';
  }
}

function enableEdit() {
  e('notes').className = 'editable';
  e('notes').focus();
  e('checkbox-div').style.display = 'block';
  moveCursorToTheEnd(e('notes'));
  e('edit').innerHTML = 'Save';
  handleEncOptionsVisibility();
  // TODO(manugarg): May be replace Delete button with Cancel here.
}

function afterEdit() {
  e('notes').className = '';
  if (saveNotes()) {
    e('edit').innerHTML = 'Edit';
    window.close();
  }
}

function saveNotes() {
  e('warning').innerHTML = '';
  var data = e('notes').innerHTML.replace(/&nbsp;/gi, ' ').trim();
  if (!data) {
    e('warning').innerHTML = 'Notes cannot be empty.';
    enableEdit();
    return 0;
  }
  // If encrypt is checked.
  var encrypted = false;
  if (e('encrypt').checked === true) {
    var pp = e('encrypt-passphrase').value.trim();
    if (pp === '') {
      e('warning').innerHTML = 'Passphrase cannot be empty.';
      enableEdit();
      return 0;
    }
    var vp = e('verify-passphrase').value.trim();
    if (pp !== vp) {
      e('warning').innerHTML = 'Passphrases don\'t match.';
      enableEdit();
      return 0;
    }
    // Try to encrypt now
    var enc = bgPage.CryptoJS.AES.encrypt(data, pp);
    data = enc.toString();
    encrypted = true;
  }
  notes = [data, new Date(), encrypted];
  if (e('sitelevel').checked === false) {
    bgPage.pageNotes.setNotesObj(tab.url, notes);
  } else {
    bgPage.pageNotes.remove(tab.url);
    bgPage.pageNotes.setNotesObj(tab.host(), notes);
  }
  bgPage.updateBadgeForTab(tab);
  localStorage.lastModTime = new Date().getTime();
  return 1;
}

function handleDecrypt() {
  e('warning').innerHTML = '';
  var pp = e('decrypt-passphrase').value;
  if (pp === '') {
    e('warning').innerHTML = 'Decrypt passphrase cannot be empty.';
    return;
  }
  var decrypted = bgPage.CryptoJS.AES.decrypt(notes[0], pp).toString(bgPage.CryptoJS.enc.Utf8);
  if (decrypted === '') {
    e('warning').innerHTML = 'Wrong passphrase.';
    return;
  }

  // Show decrypted notes and do rest of the setup.
  e('notes').innerHTML = decrypted;
  e('decrypt-passphrase-div').style.display = 'none';
  e('edit').innerHTML = 'Edit';
  e('encrypt').checked = true;
  e('encrypt-passphrase').value = pp;
  e('verify-passphrase').value = pp;
}

function setupEditButtonHandler() {
  e('edit').addEventListener('click', function() {
    if (e('edit').innerHTML.trim() === 'Save') {
      // Save has been clicked.
      afterEdit();
    } else if (e('edit').innerHTML.trim() === 'Edit') {
      // Edit has been clicked.
      enableEdit();
    } else if (e('edit').innerHTML.trim() === 'Decrypt') {
      handleDecrypt();
    }
  }, true);
  e('encrypt').addEventListener('click', function() {
    if (e('encrypt').checked === true) {
      e('encrypt-passphrase-div').style.display = 'block';
    } else {
      e('encrypt-passphrase-div').style.display = 'none';
    }
  }, true);
}

function fixDeleteButton(key, disabled) {
  if (key === '' || disabled) {
    e('delete').remove();
    return;
  }
  var callback = function() {
    bgPage.updateBadgeForTab(tab);
    window.close();
  };
  e('delete').addEventListener('click', function() {
    bgPage.deleteButtonHandler(
      this, key, callback,
      'Are you sure you want to delete notes for this page? ');
  });
}

function updatePopUpForTab(currentTab) {
  tab = currentTab;
  tab.host = function() {
    return bgPage.getHostFromUrl(tab.url);
  };
  // Get notes for the current tab and display.
  var key = tab.url;
  notes = bgPage.pageNotes.getNotesObj(key);
  if (!notes) {
    key = tab.host();
    notes = bgPage.pageNotes.getNotesObj(key);
    if (notes) {
      e('sitelevel').checked = true;
    }
  }

  if (!notes) {
    enableEdit();
  } else {
    if (notes.length >= 3 && notes[2]) {
      e('notes').innerHTML = '***************';
      e('decrypt-passphrase-div').style.display = 'block';
      e('edit').innerHTML = 'Decrypt';
    } else {
      e('notes').innerHTML = notes[0];
    }
  }

  fixDeleteButton(key, !notes);
  if (!localStorage.gFile) {
    document.getElementById("setup-sync").style.visibility = "";
  }
}

// Based on this response on stackoverflow:
// http://stackoverflow.com/questions/1125292/how-to-move-cursor-to-end-of-contenteditable-entity/3866442#3866442

function moveCursorToTheEnd(element) {
  var range = document.createRange(); // Create a range (a range is a like the selection but invisible)
  range.selectNodeContents(element); // Select the entire contents of the element with the range
  range.collapse(false); // collapse the range to the end point. false means collapse to end rather than the start
  var sel = window.getSelection(); // get the selection object (allows you to change selection)
  sel.removeAllRanges(); // remove any selections already made
  sel.addRange(range); // make the range you have just created the visible selection
}

window.setTimeout(function() {
  e('sitelevel').blur();
}, 100);

document.addEventListener('DOMContentLoaded', function() {
  setupEditButtonHandler();
  handleEncOptionsVisibility();
  chrome.tabs.getSelected(null, updatePopUpForTab);
});
