'use strict';

if (!process.env.VCAP_SERVICES) {
  require('dotenv').load();
}

var vcapServices = JSON.parse(process.env.VCAP_SERVICES);

var Hapi = require('hapi');
var Twitter = require('twitter');
var Cloudant = require('cloudant');
var request = require('request');

var server = new Hapi.Server({ debug: { request: ['error'] } });

server.connection({
  host: process.env.VCAP_APP_HOST || 'localhost',
  port: process.env.VCAP_APP_PORT || 3000,
});

var TWITTER = JSON.parse(process.env.TWITTER);

server.route({
  method: 'GET',
  path: '/',
  handler: function(req, reply) {

    var client = new Twitter({
      consumer_key: TWITTER.consumer_key,
      consumer_secret: TWITTER.consumer_secret,
      // This can be generated via OAuth or from the http://apps.twitter.com dashboard
      access_token_key: req.query.authKey,
      access_token_secret: req.query.authToken
    });

    var twitterHandle = req.query.account.toLowerCase();

    var params = {
      screen_name: twitterHandle,
      count: 200,
      include_rts: false,
    };

    client.get('statuses/user_timeline', params, function(error, tweets, response){
        if (!error) {
          Cloudant({account:vcapServices.cloudantNoSQLDB[0].credentials.username, password:vcapServices.cloudantNoSQLDB[0].credentials.password}, function(er, cloudant) {
            cloudant.db.create(twitterHandle, function(err, body) {

              if(err)
                console.log(err);

              var database = cloudant.db.use(twitterHandle);

              database.get('_design/lookups', function(err, body) {
                if (!err)
                  console.log(body);
                database.insert({"views": { "timestamps": { "map": "function (doc) {\n  var d = new Date(doc.created_at);\n  emit(d.getTime(), 1);\n}" } } }, '_design/lookups', function(err, body, header) {});
              });

              for(var i=0;i<tweets.length;i++){
                database.insert(tweets[i], tweets[i].id_str, function(err, body, header) {
                  if (err)
                    return console.log('['+twitterHandle+'.insert] ', err.message)
                  //
                  // console.log('you have inserted the tweet.')
                  // console.log(body)
                });
              }

              // https://f65d7aca-996b-43b6-b273-8d7feb6dbb07-bluemix.cloudant.com/ukmadlz/_design/lookups/_view/timestamps?limit=20&reduce=false&inclusive_end=true&start_key=1440583652000&end_key=1440683652000
              var viewParams = {
                  inclusive_end: true,
                  include_docs:true
                };

              if(req.query.start_date)
                viewParams.start_key = req.query.start_date*1000;
              if(req.query.end_date)
                viewParams.end_key = req.query.end_date*1000;

              database.view('lookups', 'timestamps', viewParams, function(err, body) {
                if (!err) {
                  var tweetText = ''
                  body.rows.forEach(function(doc) {
                    tweetText = tweetText + ' ' + doc.doc.text;
                  });

                  var frequency = body.rows.length;

                  var opts = {
                    url: 'http://battlehack.jakelprice.com/api/nlp',
                    form:{
                      payload: tweetText,
                    },
                  };

                  request.post({
                    headers: {'content-type' : 'application/x-www-form-urlencoded'},
                    url:     'http://battlehack.jakelprice.com/api/nlp',
                    body:    "payload=" + tweetText
                  }, function(error, response, body){
                    body = JSON.parse(body);
                    body.frequency = frequency;
                    reply(body);
                  });

                } else {
                  console.log(err);
                }
              });

            });
          });

        } else {
          console.log(error);
          console.log(response);
          reply('index', { title: 'ERROR' });
        }
      });

  },
});

server.start(function() {
  console.log('Server running at:', server.info.uri);
});
