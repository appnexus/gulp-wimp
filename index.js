/*jslint evil: true */
'use strict';
var path = require('path');
var gutil = require('gulp-util');
var path = require('path');
var gulp = require('gulp');
var through = require('through2');
var seleniumStandalone = require('selenium-standalone');
var Forq = require('forq');
var tasks = [];
var scheduledRetries = [];
var debug = require('debug')('gulp-wimp');
var colors = require('colors');
var _ = require('lodash');
var Task = require('forq/task');
var freeport = require('freeport');
var DEFAULT_TEST_END_TIMEOUT = 60000;
var seleniumPort;

var drivers = {
  chrome: {
    version: '2.14',
    arch: process.arch,
    baseURL: 'http://chromedriver.storage.googleapis.com'
  }
};

var seleniumVersion = '2.45.0';

function seleniumInstallCallback (options, parentStream) {
 return function(err) {
      if (err) { throw err; }
      freeport(function(err, port) {
        if (err) { throw err; }
        seleniumPort = port;
        seleniumStandalone.start({ 
          drivers: drivers,
          seleniumArgs: [
            '-port', port
          ]
        }, seleniumStartCallback(options, parentStream) );
    });
  };
}

function seleniumStartCallback (options, parentStream){
  return function (er, selenium) {
    if (er) {
      // attempt to kill process
      selenium.exit();
      console.log("Error starting selenium", er);
      throw er;
    }
    var errors = [];
    var resultsByFile = {};
    var host = '0.0.0.0';
    var port = seleniumPort;
    var configPath = options.configPath || null;
    var reporter = options.reporter || 'spec';
    var verbose = options.verbose || false;
    var F;
    var parentStream = parentStream;
    var callback = options.callback || new Function();
    var concurrency = options.concurrency || 1;
    var browserName = options.browserName;
    var taskTimeout = options.taskTimeout || 60000;
    var seleniumVerbose = options.seleniumVerbose || false;
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
    console.log("Loading %s test suite files...", tasks.length);
    tasks.forEach(function(t){
      t.args.push(host);
      t.args.push(port);
      t.args.push(configPath);
      t.args.push(reporter);
      t.args.push(verbose);
      t.args.push(browserName);
      t.killTimeout = taskTimeout;
    });

    if (!seleniumVerbose) {
      selenium.stderr.on('data', function(data){
        console.log(data.toString().gray);
      });
    }

    // amount of time to wait after the queue has drained before force killing all tests
    var queueTimeout = options.queueTimeout || (60000 * tasks.length) ;

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
          var pendingTasks = F.getNumberOfPendingTasks();
          debug('currently pending tasks '+pendingTasks);

          // check if timeout has been reached
          if ( now - drainTime > DEFAULT_TEST_END_TIMEOUT ) {
            // if so..
            debug('wimp timeout reached');
            // destroy interval
            clearInterval(timer);
            //kill forks TODO: use queue.killAll
            activeForks.forEach(function(f){ f.kill(); });
            //kill selenium
            killSelenium();

            // if there are no more active forks, kill selenium 
          } else if (F.idle() && pendingTasks === 0 && activeForks === 0 && connected.length === 0) {
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
      todo: tasks,
      noLimits: true,
      concurrency: concurrency,
      onfinished: onfinishCallback,
      killTimeout: queueTimeout
    });

    F.on('error', function(err, fork){
      // collect errors in array as they occur
      errors.push(err);
      // collect tasks for retry
      var work = err.domainEmitter.work;
      // add error to hash map of errors by file
      var testFileName = work.args[1];
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
        var t = new Task(work, F);
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
  };
}

function launchSelenium (options, parentStream) {
    return function(){
      seleniumStandalone.install({
        version: seleniumVersion,
        drivers: drivers,
        logger: function(message) {
          console.log(message);
        },
        progressCb: function(totalLength, progressLength, chunkLength) {
          // TODO
        }
      }, seleniumInstallCallback(options, parentStream) );
  };
}


module.exports = function (options) {
  if (!options) { options = {}; }
  var chunks = [];
  // process the file stream passed in by gulp
  var parentStream = through.obj(function(chunk, enc, cb) {
    var fileName = chunk.path || 'no-name';
    tasks.push({
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