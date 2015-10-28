#!/usr/bin/env node

'use strict';

var ContentSync = require('../lib/ContentSync'),
    ContentClean = require('../lib/ContentClean'),
    ContentClone = require('../lib/ContentClone'),
    ContentPurge = require('../lib/ContentPurge'),
    Migrate = require('../lib/Migrate'),
  ModelSync = require('../lib/ModelSync'),
  argv = require('minimist')(process.argv.slice(2)),
  logger = require('../lib/logger'),
  fs = require('fs');

if (!argv.c || argv.help || argv.h) {
  console.log([
    'USAGE: contentful-publication -c <CONFIG_FILE> [OPTIONS]',
    '',
    'Options:',
    '',
    '  -t          Select the type of data to sync. "model" will only copy',
    '              content types while "content" will sync entries and assets.',
    '',
    '  -h, --help  Show this help.'
  ].join('\n'));
  process.exit(argv.c ? 0 : 1);
}

var config = JSON.parse(fs.readFileSync(argv.c)),
  contentSync = ContentSync.fromConfig(config),
  contentClean = ContentClean.fromConfig(config),
  contentPurge = ContentPurge.fromConfig(config),
  migrate = Migrate.fromConfig(config),
  modelSync = new ModelSync(config);

var type = argv.t ? argv.t : '';
var contentType = argv.i ? argv.i : '';

switch (type) {
  case 'model':
    modelSync.run()
      .then(function () {
        logger.info('Synchronization is over');
      })
      .catch(function (error) {
        logger.error('Synchronization error ', error);
      });
    ;
    break;
  case 'content' :
    contentSync.run()
      .then(function () {
        logger.info('Synchronization is over');
      })
      .catch(function (error) {
        logger.error('Synchronization error ', error);
      });
    break;
  case 'repair':
    contentClean.run()
        .then(function () {
          logger.info('Content repair is over');
        })
        .catch(function (error) {
          logger.error('Content repair error ', error);
        });
    break;
  case 'migrate':
      migrate.run(contentType).then(function(){
        console.log("ran migrate");
      })
    break;
  case 'purge':
    contentPurge.run().then(function () {
      logger.info('Purge is complete');
    })
    .catch(function (error) {
      logger.error('Content purge error ', error);
    });
    break;
  case 'clone':
    var contentClone = new ContentClone.fromConfig(config);
    modelSync.run().then(function(){
      contentClone.run().then(function(){
        console.log("Clone complete");
      })
    });
    break;
  case 'forceCopy':
      contentClean.run().then(function() {
        return contentPurge.run().then(function(){
          logger.info('Purge is complete. Beginning copy.');
          return contentSync.run();
        }, function(error){
          logger.error('Content purge error ', error);
        })
      }).catch(function(error) {
        logger.error('Content clean error ', error);
      })
    break;
  default:
    modelSync.run()
      .then(function () {
        return contentSync.run();
      })
      .then(function () {
        logger.info('Synchronization is over');
      })
      .catch(function (error) {
        logger.error('Synchronization error ', error);
      });
    break;
}
