var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');
var gulp = require('gulp');
var wimp = require('./index');

gulp.task('default', [ 'test' ]);

gulp.task('lint', function(){
  return gulp.src([ './tests/**/*.js', './index.js', './worker.js', './driver.js' ])
    .pipe(jshint())
    .pipe(jshint.reporter(stylish));
});

gulp.task('test', function () {
  var s = gulp.src('tests/*.js', {read: false});
  s.pipe(
    wimp({
      concurrency: 3
    })
  );
});