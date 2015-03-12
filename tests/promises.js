var assert = require('assert');

describe('Promise-enabled WebDriver', function () {

  describe('injected browser executing a Google Search', function () {

    it('performs as expected', function (done) {
      var searchBox;
      browser.get('http://google.com')
        .then(function () {
          return browser.elementByName('q');
        })
        .then(function (el) {
          searchBox = el;
          return searchBox.type('webdriver');
        })
        .then(function () {
          return searchBox.getAttribute('value');
        })
        .then(function (val) {
          return assert.equal(val, 'webdriver');
        })
        .then(done, done);
    });
  });
});

