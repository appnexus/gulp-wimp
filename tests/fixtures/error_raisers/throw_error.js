var assert = require('assert');

describe('Promise-enabled WebDriver test that fails', function () {

  this.timeout(10000);

  describe('injected browser executing a Google Search', function () {

    it('performs as expected', function (done) {
      throw new Error('this should fail');
    });

  });
});

