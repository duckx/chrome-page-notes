var relnotes = {
  "2.4.3": [
    "Fix a table cell width issue on the all notes page."
  ],
  "2.4.2": [
    "For encrypted notes, show passphrase prompt by default in the popup.",
    "To make the popup less crowded, use a delete icon for the delete button and don't show it if there are no notes.",
    "Improve buttons appearance on 'all notes' page. Fix the width and the spacing between them.",
    "Use green color text for the Decrypt/Hide button on 'all notes' page to make them stand out."
  ],
  "2.4.1": [
    "Affects only encrypted page notes: add a facility to <a href='/allnotes.html'>all notes</a> page to decrypt and see encrypted page notes after providing the passphrase."
  ],
  "2.4.0": [
    "New icons. Browser icon now changes color if there are notes available for a page. There is an option to continue using older icons if you prefer so.",
    "Add an option to encrypt page notes with a user provided passphrase. Passphrase is not stored anywhere; if you forget the passphrase for any reason, encrypted notes will become irrecoverable."
  ],
  "2.3.4": [
    "Add version tracking functionality. Record current and the last version to make it easy to figure out version change programmatically and do things on that basis, e.g. to notify users of an important change."
  ]
}

/* Add all release notes above. Code below should not be changed often. */

function e(id) {
  return document.getElementById(id);
}

function relNotesDiv() {
  var div_e = document.createElement('div');
  for (ver in relnotes) {
    var ver_e = document.createElement('h2');
    ver_e.innerHTML = ver;
    ver_e.className = 'relnotes';
    div_e.appendChild(ver_e);
    var ul_e = document.createElement('ul');
    div_e.appendChild(ul_e);
    for (var i = 0; i < relnotes[ver].length; i++) {
      var li_e = document.createElement('li');
      li_e.innerHTML = relnotes[ver][i];
      ul_e.appendChild(li_e);
    }
    if (window.location.hash) {
      if (ver === window.location.hash.replace(/^#/, '')) {
        ul_e.style.backgroundColor = 'lightyellow';
      }
    }
  }
  return div_e;
}

function init() {
  e('relnotes').appendChild(relNotesDiv());
}

document.addEventListener('DOMContentLoaded', init);
