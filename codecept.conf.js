module.exports.config = {
  'tests': './tests/*.js',
  'timeout': 10000,
  'output': './output',
  'helpers': {
    'Nightmare': {
      'url': 'http://localhost:5000',
      'show': process.env.CODECEPTJS_ENV === 'debug',
      'typeInterval': process.env.CODECEPTJS_ENV === 'debug' ? 100 : 10
    }
  },
  'include': {},
  'bootstrap': false,
  'mocha': {},
  'name': 'yandex-form'
}