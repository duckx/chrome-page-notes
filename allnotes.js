/*
 * Copyright 2012 Manu Garg
 * @author manugarg@google.com (Manu Garg)
 
 * Directive for JSLint, so that it doesn't complain about these names not being
 * defined.
 */
/*global document, location, localStorage, PageNotes, alert, chrome, confirm */

var bgPage = chrome.extension.getBackgroundPage();
var pageNotes = {};
var tagIndex = {};

function extractTags(text) {
  if (!text) {
    return [];
  }
  // Hack to get a clean plain text string from HTML:
  // Parse text string into an array of DOM elements using parseHTML, then
  // for each DOM element, put it into a new <div> element and get the text
  // from it. It gives a clean text string.
  var t = $.parseHTML(text).map(function(x) {
    return $('<div>').html(x).text();
  }).join(' ');
  return t.replace(/(\n|\t)+/g, ' ').split(' ').filter(function(x) {
    return x.match(/^#/);
  });
}

function markupTagsInNotes(notes) {
  var tags = extractTags(notes);
  for (var j = 0; j < tags.length; j++) {
    var tag = tags[j];
    var tagClass = 'tag-link';
    if (tag === window.location.hash) tagClass += ' selected-tag';
    notes = notes.replace(tag, '<a class="' + tagClass + '" href="">' + tag + '</a>');
  }
  return notes;
}

var reload = function() {
  location.reload();
};

function initPage() {
  pageNotes = new PageNotes().getAll();
  buildTagCloud();

  // Build array of keys (URLs) that we need to show
  var keys = [];
  $.each(pageNotes, function(key, value) {
    // key is URL, value is page notes structure
    if (window.location.hash === '') keys.push(key);
    else {
      // If tag is already in taxIndex
      if (tagIndex[window.location.hash].indexOf(key) != -1) keys.push(key);
    }
  });
  keys.sort();

  var allNotes = $('#all-notes').html('');
  for (var i = 0; i < keys.length; i++) {
    var row = $('<tr/>').appendTo(allNotes);

    // First cell
    var link = $('<a/>').attr('href', keys[i]).html(keys[i])
      .appendTo($('<td/>').appendTo(row));
    if (link.prop('protocol') == 'chrome-extension:') {
      link.attr('href', 'http://' + keys[i]);
    }

    // Check if notes are encrypted
    var notes = pageNotes[keys[i]];
    if (notes.length >= 3 && notes[2]) {
      var notesText = '***************';
      var editButtonText = 'Decrypt';
      var editButtonClass = 'decryptB';
    } else {
      notesText = markupTagsInNotes(notes[0]);
      editButtonText = 'Edit';
      var editButtonClass = 'editB';
    }

    // Second cell
    var date = formatDate(notes[1]);
    // If hour is in single digit, add an extra in the front for better alignment.
    // date = date.replace(/ (\d:\d\d:\d\d)+/, "  $1");
    $('<div/>').addClass('date-div').html(date)
      .appendTo($('<td/>').appendTo(row));

    // Third cell
    $('<div/>').addClass('notes-div').html(notesText)
      .appendTo($('<td/>').addClass('notesTD').appendTo(row));

    // Fourth cell
    var buttonCell = $('<td/>').addClass('buttons').appendTo(row);
    $('<button/>').addClass(editButtonClass).html(editButtonText).appendTo(buttonCell);
    var deleteB = $('<button/>').addClass('deleteB').html('Delete').appendTo(buttonCell);
    deleteB.click({
      key: keys[i]
    }, function(event) {
      bgPage.deleteButtonHandler(this, event.data.key, reload, 'Are you sure you want to delete these notes? ');
    });
  }
  allNotes.on('click', 'button.editB', Edit);
  allNotes.on('click', 'button.decryptB', Edit);
  allNotes.on('click', 'button.saveB', Save);
  allNotes.on('click', 'button.cancelB', Cancel);
  $('#notesTable').trigger('update', [true]);
}

function formatDate(date) {
  var d = new Date(date);
  return d.toDateString().replace(/^[^ ]+ /, '') + ' ' + d.toTimeString().replace(/ GMT.*$/, '');
}

function warning(par, text) {
  var warningDiv = par.find('.warning');
  if (warningDiv.length == 0) {
    warningDiv = $('<div/>').addClass('warning').appendTo(par);
  }
  warningDiv.html(text);
}

function handleDecrypt(row, url, editButton) {
  var tdControl = row.children('td:nth-child(4)');
  var ppLabel = row.find('.passphrase-label');
  if (ppLabel.length == 0) {
    var ppLabel = $('<label/>').css('margin-bottom', '5px').addClass('passphrase-label').html('Passphrase: ').prependTo(tdControl);
    $('<input/>').prop('type', 'password').addClass('passphrase-input').appendTo(ppLabel);
    return;
  }
  var pp = row.find('.passphrase-input')[0].value;
  if (pp === '') {
    warning(tdControl, 'Passphrase cannot be empty.');
    return;
  }
  var decrypted = bgPage.CryptoJS.AES.decrypt(pageNotes[url][0], pp).toString(bgPage.CryptoJS.enc.Utf8);
  if (decrypted === '') {
    warning(tdControl, 'Wrong passphrase.');
    return;
  }
  var divNotes = row.find('.notes-div');
  divNotes.html(decrypted);
  editButton.html('Hide');
  ppLabel.remove();
}

function Edit(e) {
  var par = $(this).parent().parent(); //tr
  // Clear warning field.
  warning(par, '');
  var tdURL = par.children('td:nth-child(1)').children('a:nth-child(1)').html();
  // If we are decrypting
  if ($(this).html() === 'Decrypt') {
    handleDecrypt(par, tdURL, $(this));
    return;
  }
  var divNotes = par.find('.notes-div');
  if ($(this).html() === 'Hide') {
    $(this).html('Decrypt');
    divNotes.html('**********');
    return;
  }
  // Open notes div for editing
  divNotes.html(pageNotes[tdURL][0]);
  divNotes.addClass('editable');
  divNotes.focus();
  moveCursorToTheEnd(divNotes.get(0));
  // Change button text and behavior
  $(this).html('Save');
  $(this).removeClass().addClass('saveB');
  var cancelB = document.createElement('button');
  $(cancelB).html('Cancel');
  $(cancelB).removeClass().addClass('cancelB');
  // Replace Delete button with Cancel button
  par.find('.deleteB').replaceWith($(cancelB));
}

function Cancel() {
  var par = $(this).parent().parent(); //tr
  var tdURL = par.children('td:nth-child(1)').children('a:nth-child(1)').html();
  var divNotes = par.find('.notes-div');
  var editSaveButton = par.find('.saveB');
  divNotes.html(pageNotes[tdURL][0]);
  divNotes.removeClass('editable');
  // Change button text and behavior
  editSaveButton.html('Edit');
  editSaveButton.removeClass().addClass('editB');
  // Replace Cancel button with Delete button
  var deleteB = bgPage.deleteButton('Delete', tdURL, reload, 'Are you sure you want to delete these notes? ');
  $(this).replaceWith($(deleteB));
}

function Save(e) {
  var par = $(this).parent().parent(); //tr
  var tdURL = par.children('td:nth-child(1)').children('a:nth-child(1)').html();
  var divNotes = par.find('.notes-div');
  divNotes.removeClass('editable');
  divNotes.css('color', '#111');
  // Update notes in the database
  new PageNotes().set(tdURL, divNotes.html());
  localStorage.lastModTime = new Date().getTime();
  // Change button text and behavior
  $(this).html('Edit');
  $(this).removeClass().addClass('editB');
  location.reload();
}

function buildTagIndex() {
  for (var key in pageNotes) {
    var tags = extractTags(pageNotes[key][0]);
    if (tags) {
      for (var i = 0; i < tags.length; i++) {
        if (!(tags[i] in tagIndex)) {
          tagIndex[tags[i]] = [];
        }
        if (tagIndex[tags[i]].indexOf(key) === -1) {
          tagIndex[tags[i]].push(key);
        }
      }
    }
  }
}

function buildTagCloud() {
  // Build tagIndex first
  buildTagIndex();
  var tags = [];
  for (var key in tagIndex) {
    tags.push({
      'key': key,
      'value': tagIndex[key].length
    });
  }
  tags.sort(function(a, b) {
    if (a.value > b.value) return -1;
    if (a.value < b.value) return 1;
    if (a.key > b.key) return 1;
    if (a.key < b.key) return -1;
    return 0;
  });

  $('#tag-cloud').html('');
  $('#tag-cloud').append('<li><a class="tag-link" href="">All</a></li>');
  for (var i = 0; i < tags.length; i++) {
    if (window.location.hash === tags[i].key) {
      $('#tag-cloud').append('<li><a class="tag-link selected-tag" href="">' + tags[i].key + '(' + tags[i].value + ')</a></li>');
    } else {
      $('#tag-cloud').append('<li><a class="tag-link" href="">' + tags[i].key + '(' + tags[i].value + ')' + '</a></li>');
    }
  }
}

// When you click on a tag
$(document).on('click', '.tag-link', function() {
  var tag = $(this).html();
  // Remove the count number from the tag
  if (tag.match(/(.*)\([0-9]+\)/)) {
    tag = tag.match(/(.*)\([0-9]+\)/)[1];
  }
  if ($(this).attr('class').indexOf('selected-tag') == -1) {
    window.location.hash = tag;
  } else {
    window.location.hash = '';
    window.location.href = window.location.href.replace(/#$/, '');
  }
  initPage();
  return false;
});

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

function exportToCsv() {
  var content = [];
  var colDelimiter = '","';
  content.push(['URL', 'Date', 'Notes'].join(colDelimiter));
  $.each(new PageNotes().getAll(), function(url, note) {
    content.push([url, formatDate(note[1]), note[0]].map(function(item) {
      return item.replace(/"/g, '""'); // Escape double quotes
    }).join(colDelimiter));
  });
  var csv = '"' + content.join('"\r\n"') + '"';
  $('.exportAnchor').attr('href', 'data:text/csv,' + encodeURIComponent(csv));
}

document.addEventListener('DOMContentLoaded', function() {
  $('.exportButton').click(exportToCsv);
  initPage();
  $('#notesTable').tablesorter({
    theme: 'default',
    headerTemplate: '{content}{icon}',
    headers: {
      // disable sorting of the first column (we start counting at zero)
      3: {
        sorter: false
      }
    },
    sortList: [
      [0, 0]
    ]
  });
});
