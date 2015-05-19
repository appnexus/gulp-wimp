# gulp-wimp
Run Selenium WebDriver tests faster using parallel instances of Mocha.

## Build Status
Branch  | Build Status | Version
------- | ------------ | ----
 master | [![build status](https://travis-ci.org/appnexus/gulp-wimp.png?branch=master)](https://travis-ci.org/appnexus/gulp-wimp?branch=master)  | 0.0.1

## Install
```bash
npm install gulp-wimp
```
##Usage
###Basic Gulp Task
####Gulpfile
```javascript
var gulp = require('gulp');
var wimp = require('gulp-wimp');

gulp.task('test', function () {
  var s = gulp.src('tests/*.js', {read: false});
  s.pipe(
    wimp({
      concurrency: 3
    })
  );
});
```
####Test Files
```javascript
var assert = require('assert');

describe('Promise-enabled WebDriver', function () {

  describe('injected browser executing a Google Search', function () {

    it('performs as expected', function (done) {
      var searchBox;
      browser.get('http://google.com')
      .elementByName('q').type('webdriver')
      .elementByName('q').getAttribute('value')
      .then(function(val){
        assert.equal(val, 'webdriver');
      }).then(done, done);
    });

  });
});

```
