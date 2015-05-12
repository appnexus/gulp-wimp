var assert = require('assert');

describe('Promise-enabled WebDriver test that fails', function () {

  this.timeout(10000);

  describe('injected browser executing a Google Search', function () {

    before(function(done){
        throw new Error('fails!');
    });

    it('should never fire this', function (done) {
      done();
    });

  });
});

