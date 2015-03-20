'use strict';
var path = require('path');
var gutil = require('gulp-util');
var path = require('path');
var gulp = require('gulp');
var through = require('through2');
var seleniumLauncher = require('selenium-launcher');
var Forq = require('forq');
var workers = [];
var debug = require('debug')('gulp-wmp');
var colors = require('colors');
var _ = require('lodash');

var DEFAULT_TEST_END_TIMEOUT = 60000;


function launchSelenium (options, parentStream) {
    return function(){
      seleniumLauncher({ chrome: options.browserName === 'chrome' }, function (er, selenium){
        if (er) {
          // attempt to kill process
          throw er;
          selenium.exit();
          return;
        }

        var errors = [];
        var retryWorkers = [];
        var host = selenium.host;
        var port = selenium.port;
        var configPath = options.configPath || null;
        var reporter = options.reporter || 'spec';
        var verbose = options.verbose || false;
        var F;
        var parentStream = parentStream;
        var callback = options.callback || new Function();
        var concurrency = options.concurrency || 1;
        var browserName = options.browserName;
        var workerTimeout = options.workerTimeout || 60000;
        var maxTimeoutChecks = 5;
        var timeoutChecks = 0;
        // amount of time to wait for entire pool to finish. 10 min default
        var poolTimeout = options.poolTimeout || 60 * 1000 * 10;
        
        workers.forEach(function(w){
          w.args.push(host);
          w.args.push(port);
          w.args.push(configPath);
          w.args.push(reporter);
          w.args.push(verbose);
          w.args.push(browserName);
          w.killTimeout = workerTimeout;
        });

        // amount of time to wait after the queue has drained before force killing all tests
        var poolTimeout = options.poolTimeout || (60000 * workers.length) ;

        function killSelenium () {
          debug('killing selenium');
          selenium.kill();
          if (errors.length > 0) {
            console.log(("FAILED: "+errors.length+" error"+ (errors.length > 1 ? "s" : "" ) + " encountered.").red, errors.length);
            callback(errors, F);
            process.exit(1);
          } else {
            console.log("SUCCESS: all tests finished without errors.".green);
            callback(null, F);
            process.exit(0);
          }
        }

        function onfinishCallback () {
            debug('all tests have finished.');
            // time drain was triggered
            var drainTime = Date.now();

            // check for hanging forks
            var timer = setInterval(function(){
              // mark current time
              var now = Date.now();
              debug('checking for hanging forks: '+now);
              // collect all connected forks
              var connected = F.forks.filter(function(f){ return f.connected; });
              // count non-terminated forks
              debug('currently connected forks '+connected.length);
              var activeForks = F.getNumberOfActiveForks();
              debug('currently active forks '+activeForks);
              
              // check if timeout has been reached
              if ( now - drainTime > DEFAULT_TEST_END_TIMEOUT ) {
                // if so..
                debug('wimp timeout reached')
                // destroy interval
                clearInterval(timer);
                //kill forks TODO: use pool.killAll
                activeForks.forEach(function(f){ f.kill(); });
                //kill selenium
                killSelenium();

                // if there are no more active forks, kill selenium 
              } else if (activeForks === 0 && connected.length === 0) {
                debug('all forks have terminated and disconnected');
                killSelenium();
              }
              // in all other cases, noop
            }, 1000);

            // make sure interval is killed if max timeout is reached
            setTimeout(function(){
              if (!timer._idleNext) {
                clearInterval(timer);
                killSelenium();
              }
            }, DEFAULT_TEST_END_TIMEOUT+1000);
        }

        F = new Forq({
          workers: workers,
          concurrency: concurrency,
          onfinished: onfinishCallback,
          killTimeout: poolTimeout
        });

        F.on('error', function(err){
          // collect errors in array as they occur
          errors.push(err);
          // collect workers for retry
          var worker = err.domainEmitter.worker;
          if ( !_.contains(retryWorkers, worker) ) {
            retryWorkers.push(worker);
          }
        });

        F.run();
    });
  }
}


module.exports = function (options) {
  if (!options) { options = {}; }
  var chunks = [];
  // process the file stream passed in by gulp
  var parentStream = through.obj(function(chunk, enc, cb) {
    var fileName = chunk.path || 'no-name';
    workers.push({
      path: path.join(__dirname, 'worker'),
      args: [ '-f', fileName  ],
      description: fileName
    });
    cb();
  },
    // launch selenium with options and a reference to the parent Stream
    launchSelenium(options, this)
  );
  return parentStream;
};