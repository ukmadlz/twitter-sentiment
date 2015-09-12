var Hapi = require('hapi');

var server = new Hapi.Server({ debug: { request: ['error'] } });
process.env.VCAP_APP_HOST || 'localhost', process.env.VCAP_APP_PORT || 3000,
server.connection({
  host: process.env.VCAP_APP_HOST || 'localhost',
  port: process.env.VCAP_APP_PORT || 3000,
});

server.start(function() {
  console.log('Server running at:', server.info.uri);
});
