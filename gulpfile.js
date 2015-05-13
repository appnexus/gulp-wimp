var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');
var gulp = require('gulp');
var wimp = require('./index');

gulp.task('default', [ 'test' ]);

gulp.task('lint', function(){
  return gulp.src([ './examples/**/*.js', './index.js', './worker.js', './driver.js' ])
    .pipe(jshint())
    .pipe(jshint.reporter(stylish));
});

gulp.task('test', function(){
    // TODO
});

gulp.task('passing-examples', function () {
  var s = gulp.src('tests/fixtures/*.js', {read: false});
  s.pipe(
    wimp({
      concurrency: 3,
    })
  );
});

gulp.task('failing-examples', function () {
  var s = gulp.src('tests/fixtures/**/*.js', {read: false});
  s.pipe(
    wimp({
      concurrency: 3,
      retryTests: true,
      maxRetries: 3
    })
  );
});