/*
 * Copyright 2012 Manu Garg.
 * @author manugarg@google.com (Manu Garg)
 * 
 * Interface to page notes database in localStorage.
 */

var PageNotes = function() {};

PageNotes.prototype.getSource = function() {
  return localStorage.pagenotes;
};

PageNotes.prototype.get = function(key) {
  var obj = this.getAll();
  // obj is not defined
  if (!obj) return undefined;
  if (obj[key] && typeof obj[key] !== 'string') {
    // new pageNotes format
    return obj[key][0];
  }
  return obj[key];
};

PageNotes.prototype.getNotesObj = function(key) {
  var obj = this.getAll();
  if (!obj) return undefined;
  return obj[key];
};

PageNotes.prototype.getAll = function() {
  var src = this.getSource();
  return src ? JSON.parse(src) : {};
};

PageNotes.prototype.set = function(key, value) {
  var src = this.getSource();
  var obj = src ? JSON.parse(src) : {};
  var newFormat = false;
  for (var i in obj) {
    if(typeof obj[i] !== 'string') {
      newFormat = true;
      break;
    }
    else {
      break;
    }
  }
  obj[key] = value;
  if (newFormat) {
    obj[key] = [value, new Date()];
  }
  this.setSource(obj);
};

PageNotes.prototype.setNotesObj = function(key, objValue) {
  var src = this.getSource();
  var obj = src ? JSON.parse(src) : {};
  obj[key] = objValue;
  this.setSource(obj);
};

PageNotes.prototype.setSource = function(src) {
  if (typeof src !== 'string') {
    src = JSON.stringify(src);
  }
  localStorage.pagenotes = src;
};

PageNotes.prototype.remove = function(key) {
  var src = this.getSource();
  var obj = src ? JSON.parse(src) : {};
  delete obj[key];
  this.setSource(obj);
};
