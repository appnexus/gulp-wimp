var assert = require('assert');
var async = require('async');

describe('A Mocha test run by grunt-mocha-sauce', function () {

  it('has a browser injected into it', function () {
    assert.ok(browser);
  });

});

describe('A basic Webdriver example', function () {

  this.timeout(10000);

  describe('injected browser executing a Google Search', function () {

    it('performs as expected', function (done) {
      var searchBox;
      done();
      async.waterfall([
        function(cb) {
          browser.get('http://google.com', cb);
        },
        function(cb) {
          browser.elementByName('q', cb);
        }
      ], done);
    });
  });
});