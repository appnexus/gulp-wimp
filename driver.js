var wd;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var ChildProcessSoftError = require('forq').Errors.ChildProcessSoftError;
wd = require('wd');

var supportedBrowsers = [
  'firefox',
  'chrome',
  'safari'
];

function Driver (opts) {
  if (!opts) { opts = {}; }
  var self = this;
  
  EventEmitter.call(this);

  this.host = opts.host;
  this.port = opts.port;
  this.browser = wd.promiseChainRemote(
    this.host,
    this.port
  );

  if ( opts.browserName && _.includes(supportedBrowsers, opts.browserName) ) {
    this.browserName = opts.browserName;
  } else {
    this.browserName = undefined;
  }

  this.parentProcess = opts.parentProcess;

  this.verbose = opts.verbose || false;

  this.browser.on('status', function(info) {
    console.log("browser even")
    if (info && info.search('Ending your web drivage') !== -1 ) {
      self.parentProcess.send({
      event: 'browserFinished',
        data: {
          info: info
        }
      });
    }
  });

  if (this.verbose) {
    this.browser.on('command', function(meth, path, data) {
      console.log(' > ', meth, path, data);
    });
  }

  function oninit(err, id, capabilities) {
    if (err) {
      var e = new ChildProcessSoftError(err);
      // broadcast browser startup error
      self.emit('error', e);
    } else {
      self.emit('ready');
      self.status = 'ready';
    }
  }

  this.browser.init({ browserName: this.browserName }, oninit);

}

util.inherits(Driver, EventEmitter);

module.exports = Driver;