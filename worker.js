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
    
    d.on('ready', function(){
      var mochaOpts = config.mocha || defaultMochaOpts;
      var mocha = new Mocha(mochaOpts);
      mocha.addFile(fileName);
      mocha.suite
        .on('pre-require', function(ctx, file) {
          ctx.wd = wd;
          ctx.browser = browser;
          // prepare context
          if (configPath) {
            ctx.config = config;
            // TODO: remove this
            ctx.c = ctx.config.data;
            ctx.s = ctx.config.steps;
            ctx.CSS = ctx.config.selectors;
            ctx.id = Date.now().toString('16');
            ctx.isGulp = true;
            ctx.isRetry = isRetry;
          }
        });

      var runner = mocha.run(function(failures){
        var error;
        if (failures > 0 || errors.length > 0) {
          debug('FAILED: '.red + fileName);
          error = new Error('test failed!');
        } else {
          debug('PASSED: '.green + fileName);
          error = null;
        }
        // quit browser when tests are done
        browser.quit().then(function(){
          done(error);
        });
      });

      runner.on('fail', function(ctx, err){
        if (err) {
          new ChildProcessSoftError(err);
          errors.push(err);
        }
        
      });

    });

  d.on('error', function (err) {
    // handle browser startup errors
    browser.quit().then(function(quitErr){
      done(err);
    });
  });

  }
], function (err) {
  if (err) { throw err; }
  debug('worker callback fired');
});