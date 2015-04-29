/*
 * Copyright 2012 Manu Garg.
 * @author manugarg@google.com (Manu Garg)
 * 
 * Interface to options database in localStorage.
 */

var Options = function() {};

Options.prototype.get = function(key) {
  var obj = this.getAll();
  // obj is not defined
  if (!obj) return undefined;
  return obj[key];
};

Options.prototype.getAll = function() {
  var src = this.getSource();
  return src ? JSON.parse(src) : {};
};

Options.prototype.set = function(key, value) {
  var src = this.getSource();
  var obj = src ? JSON.parse(src) : {};
  obj[key] = value;
  this.setSource(obj);
};

Options.prototype.getSource = function() {
  return localStorage.options;
};

Options.prototype.setSource = function(src) {
  if (typeof src !== 'string') {
    src = JSON.stringify(src);
  }
  localStorage.options = src;
};

Options.prototype.remove = function(key) {
  var src = this.getSource();
  var obj = src ? JSON.parse(src) : {};
  delete obj[key];
  this.setSource(obj);
};
