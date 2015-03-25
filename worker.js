// args
var fileName = process.argv[3];
var host = process.argv[4];
var port = process.argv[5];
var configPath = process.argv[6] !== 'null' ? process.argv[6] : null;
var reporter = process.argv[7];
var verbose = process.argv[8];
var browserName = process.argv[9];

var Driver = require('./driver');
var Mocha = require('mocha');
var async = require('async');
var debug = require('debug')('worker');
var DEFAULT_BROWSER_QUIT_TIMEOUT = 60000;
var DEFAULT_BROWSER_START_TIMEOUT = 60000;

// testing
var wd = require('wd');
var isRetry = false;
var colors = require('colors');
// end testing

var ChildProcessSoftError = require('forq').Errors.ChildProcessSoftError;

var d = new Driver({
  host: host,
  port: port,
  parentProcess: process,
  configPath: configPath,
  reporter: reporter,
  verbose: verbose === 'true' ? true : false,
  browserName: browserName ? browserName : null
});

var browser = d.browser;
var errors = [];
var config = {};
var defaultMochaOpts = {
  reporter: 'spec'
};

try {
  config = require(configPath);
} catch (e) {
  debug('No config file found at "' + configPath + '".  Using defaults.');
}

async.series([
  function(done) {

    // quit browser when tests are done
    var browserStartTimer;
    
    d.on('ready', function(){
      var mochaOpts = config.mocha || defaultMochaOpts;
      var mocha = new Mocha(mochaOpts);
      var started = false;
      var startTimer;
      var runner;

      debug('preparing mocha for test file', fileName);
      clearTimeout(browserStartTimer);
      debug('browser has successfully started. starting mocha');

      mocha.addFile(fileName);
      mocha.suite
        .on('pre-require', function(ctx, file) {

          browserStartTimer = setTimeout(function(){
            console.log(('warning: browser failed to start in '+DEFAULT_BROWSER_QUIT_TIMEOUT+'ms').red);
            done();
            // TODO: implement this
            // done(new Error('Browser Start Error'));
          }, DEFAULT_BROWSER_START_TIMEOUT);

          ctx.wd = wd;
          ctx.browser = browser;
          // prepare context
          if (configPath) {
            ctx.config = config;
            // TODO: remove this
            ctx.c = ctx.config.data;
            ctx.s = ctx.config.steps;
            ctx.CSS = ctx.config.selectors;
            ctx.id = Date.now().toString('16').slice(2);
            ctx.isGulp = true;
            ctx.isRetry = isRetry;
          }
        });

      setTimeout(function(){
        if (!started) {
          console.log(("mocha test "+fileName+"failed to start").red);
          browser.quit();
          done(new Error('mocha test failed to start'));
        }
      }, DEFAULT_BROWSER_START_TIMEOUT );

      runner = mocha.run(function(failures){
        var error;
        if (failures > 0 || errors.length > 0) {
          debug('FAILED: '.red + fileName);
          error = new Error('test failed!');
        } else {
          debug('PASSED: '.green + fileName);
          error = null;
        }
        // quit browser when tests are done
        var timer = setTimeout(function(){
          console.log(('warning: browser failed to quit in '+DEFAULT_BROWSER_QUIT_TIMEOUT+'ms').red);
          done();
          // TODO: implement a specific error type for this
          // done(new Error('Browser Quit Error'));
        }, DEFAULT_BROWSER_QUIT_TIMEOUT);

        browser.quit().then(function(){
          // kill the above timer
          clearTimeout(timer);
          debug('browser has successfully quit. closing worker');
          done(error);
        });
      });

      runner.on('suite', function(){
        clearTimeout(startTimer);
        started = true;
        debug("suite started");
      })

      runner.on('fail', function(ctx, err){
        if (err) {
          new ChildProcessSoftError(err);
          errors.push(err);
        }
        
      });

    });

  d.on('error', function (err) {
    if (err) {
      // handle browser startup errors
      if (err.name === 'Browser Start Error') {
        var e = new ChildProcessSoftError(err);
        errors.push(e);
      } else {
      // go easy on more generic, non-fatal errors
        console.log("Driver Encountered an error: ", err);
      }
    }
  });

  }
], function (err) {
  if (err) {
    var e = new ChildProcessSoftError(err);
    errors.push(e);
    debug('an error occured before exiting fork');
  } else {
    debug('worker callback fired without firing an error');
  }
});