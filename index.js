'use strict';
var path = require('path');
var gutil = require('gulp-util');
var path = require('path');
var gulp = require('gulp');
var through = require('through2');
var seleniumLauncher = require('selenium-launcher');
var Forq = require('forq');
var workers = [];
var scheduledRetries = [];
var debug = require('debug')('gulp-wmp');
var colors = require('colors');
var _ = require('lodash');
var Task = require('forq/task');
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
        var resultsByFile = {};
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
        // max number of timeouts
        var maxTimeoutChecks = 5;
        // counter for timeout checks
        var timeoutChecks = 0;
        // enable retry mode or not
        var retryTests = options.retryTests || false;
        // task slots available for retries (aka how many total test retries are allowed)
        var maxRetries = options.maxRetries || 5;
        var retryLogDenominator = maxRetries+0;
        var currentRetry = 0;
        // amount of time to wait for entire pool to finish. 10 min default
        var poolTimeout = options.poolTimeout || 60 * 1000 * 10;
        console.log("Loading %s test suite files...", workers.length);
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
          var failed = false;
          var numberFailedAfterRetry = 0;
          // TODO: create an option function for determining if tests passed or not
          if (retryTests) {
            numberFailedAfterRetry = _.where(resultsByFile, { passedOnRetry: false });
            if (numberFailedAfterRetry.length > 0) {
              failed = true;
            } 
          } else if (!retryTests && errors.length > 0) {
            failed = true;
          }

          if (failed) {
            // determine if tests passed on retries
              console.log(("FAILED: "+errors.length+" error"+ (errors.length > 1 ? "s" : "" ) + " encountered.").red);
              callback(resultsByFile, F);
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
              // count pending tasks
              var pendingTasks = scheduledRetries.filter(function(t){ return !t.completed; }).length;
              debug('currently pending tasks '+pendingTasks);

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
              } else if (pendingTasks === 0 && activeForks === 0 && connected.length === 0) {
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

        F.on('error', function(err, fork){
          // collect errors in array as they occur
          errors.push(err);
          // collect workers for retry
          var worker = err.domainEmitter.worker;
          // add error to hash map of errors by file
          var testFileName = worker.args[1];
          // 
          if (!resultsByFile[testFileName]) {
            resultsByFile[testFileName] = {
              errors: [],
              retryErrors: [],
              passedOnRetry: false
            };
          }
          resultsByFile[testFileName].errors.push(err);

          // if retryTest AND maxRetries are remaining AND no task with the same parentTaskForkId exists in queue already
          if ( retryTests && maxRetries > 0 && scheduledRetries.filter(function(t){ return t.parentTaskForkId === fork.id; }).length === 0 ) {
            // go ahead and schedule the retry
            console.log("RETRYING: ".yellow.bold+'../'+_.last(testFileName.split('/')));
            // de/increment counters
            currentRetry += 1;
            maxRetries -= 1;
            // instantiate task
            var t = new Task(worker, F);
            // log 
            t.parentTaskForkId = fork.id;
            scheduledRetries.push(t);
            F.addTask(t, function(retryErr){
              if (F.errors[this.id].length > 0 || retryErr) {
                debug('encountered error on a retry');
              } else {
                // mark the file as passing on retry
                resultsByFile[testFileName].passedOnRetry = true;
                // remove t from scheduled retries after it passes;
                // scheduledRetries = _.without(scheduledRetries, t);
              }
            });
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