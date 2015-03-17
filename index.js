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
        // amount of time to wait after the queue has drained before force killing all tests
        var killTimeout = options.killTimeout || 60000;
        var timeoutObj;
        var maxTimeoutChecks = 5;
        var timeoutChecks = 0;
        
        workers.forEach(function(w){
          w.args.push(host);
          w.args.push(port);
          w.args.push(configPath);
          w.args.push(reporter);
          w.args.push(verbose);
          w.args.push(browserName);
        });

        function killSelenium () {
          if (timeoutObj) {
            clearTimeout(timeoutObj);
          }
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

        function killAll () {
          F.forks.forEach(function(f){
            f.terminate();
          });
          selenium.kill();
        }

        function setKillTimeout () {
          if (timeoutObj) {
            clearTimeout(timeoutObj);
          }
          timeoutObj = setTimeout(function(){
            timeoutChecks += 1;
            if ( F.queue.idle() ) {
              killAll();
            } else if (timeoutChecks < maxTimeoutChecks) {
              setKillTimeout();
            } else {
              killAll();
            }
          }, killTimeout);
        }

        function browserEndCallback (){
          this.terminate();
          var nonTerminated = this.pool.forks.filter(function(f){ return !f.terminated; });
          if (nonTerminated.length === 0) {
            killSelenium();
          }
        }

        F = new Forq({
          workers: workers,
          concurrency: concurrency,
          onfinished: function() {
            debug('queue has been drained.');
            setKillTimeout();
          },
          events: {
            browserFinished: browserEndCallback
          }
        });

        F.on('error', function(err){
          // collect errors in array as they occur
          errors.push(err);
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