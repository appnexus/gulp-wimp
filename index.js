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
      seleniumLauncher(function (er, selenium){
        if (er) {
          console.log("error starting selenium", er);
          // attempt to kill process
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
        
        workers.forEach(function(w){
          w.args.push(host);
          w.args.push(port);
          w.args.push(configPath);
          w.args.push(reporter);
          w.args.push(verbose);
        });

        function killSelenium () {
          selenium.kill();
          if (errors.length > 0) {
            var wrapped_errors = errors.map(function(err){ 
              if (!err.message) { err.message = ''; }
              return new gutil.PluginError('gulp-wmp', err); 
            })
            console.log("Errors found:\n");
            wrapped_errors.forEach(function(er, idx){
              console.log("Error # %s/%s:", idx+1, errors.length);
              console.log(er.name);
              console.log(er.stack);
            });
            console.log("FAILED: %s errors encountered".red, errors.length);
            process.exit(1);
          } else {
            console.log("SUCCESS!".green);
            process.exit(0);
          }
        }

        function killAll () {
          F.forks.forEach(function(f){
            f.terminate();
          })
          selenium.kill();
        }

        function browserEndCallback (){
          this.terminate();
          var nonTerminated = this.pool.forks.filter(function(f){ return !f.terminated; });
          // TODO add a timeout fail-safe
          if (nonTerminated.length === 0) {
            killSelenium();
          }
        }

        F = new Forq({
          workers: workers,
          concurrency: concurrency,
          drain: function() {
            debug('queue has been drained.');
            if (errors.length > 0) {
              debug('errors have been encountered.');
            } else {
              callback();
            }
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