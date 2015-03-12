var wd;
var util = require('util');
var EventEmitter = require('events').EventEmitter;

wd = require('wd');

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
  this.parentProcess = opts.parentProcess;

  this.verbose = opts.verbose || false;

  this.browser.on('status', function(info) {
    if (info && info.search('Ending your web drivage') !== -1 ) {
      self.parentProcess.send({
      event: 'browserFinished',
        data: {
          info: info
        }
      })
    }
  });

  if (this.verbose) {
    this.browser.on('command', function(meth, path, data) {
      console.log(' > ', meth, path, data);
    });
  }

  function oninit(err, id, capabilities) {
    if (err) {
      console.log('error:', err);
    }
    self.emit('ready');
    self.status = 'ready';
  }

  this.browser.init({}, oninit);

}

util.inherits(Driver, EventEmitter);

module.exports = Driver;