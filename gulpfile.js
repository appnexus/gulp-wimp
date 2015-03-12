var gulp = require('gulp');
var wimp = require('./index');

gulp.task('default', [ 'test' ]);

gulp.task('test', function () {
  var s = gulp.src('tests/*.js', {read: false});
  s.pipe(
    wimp({
      concurrency: 3
    })
  );
});