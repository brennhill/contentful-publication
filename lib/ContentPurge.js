'use strict';

var Promise = require('bluebird'),
  _ = require('lodash'),
  contentful = require('contentful-management'),
  logger = require('./logger');

var ContentPurge = function (config) {
  this.config = config;
  this.resolver = Promise.pending();
  this.promise = this.resolver.promise;
};

ContentPurge.fromConfig = function (config) {
  return new ContentPurge(config);
};

ContentPurge.prototype.purgeContentTypes = function(space, batchnum) {
  var self = this;
  var deleted = [];
  var batch = batchnum || 1;
  logger.debug('Purging destination space of entry types.  Entry type batch: '+batch);

  return space.getContentTypes().then(function (types) {
    _.forEach(types, function (type) {
      var id = type.name;
      deleted.push(space.unpublishContentType(type).then(
              function () {
                space.deleteContentType(type).then(function () {
                  console.log('deleted type: ' + id);
                  var timeout =  Promise.pending();
                  setTimeout(function() {
                    return timeout.resolve();
                  },150)
                  return timeout.promise;
                });
              },
              function () {
                space.deleteContentType(type).then(function () {
                  console.log('deleted type: ' + id);
                  var timeout =  Promise.pending();
                  setTimeout(function() {
                    return timeout.resolve();
                  },150)
                  return timeout.promise;
                })
              })
              .catch(function (error) {
                logger.error("error deleting type: "+ id + error);
              }) //end promise chain.
      );//end push.
    });
    return Promise.settle(deleted).then(function() {
      console.log("Finished purging content types");
      return Promise.settle(deleted);
    })
  });
};

ContentPurge.prototype.purgeEntries = function(space, batchnum) {
  var self = this;
  var deleted = [];
  var batch = batchnum || 1;
  logger.debug('Purging destination space of content entries.  Entry batch: '+batch);


  return space.getEntries().then(function (entries) {
    _.forEach(entries, function (entry) {
      var id = entry.sys.id;
      deleted.push(space.unpublishEntry(entry).then(
              function () {
                return space.deleteEntry(entry).then(function () {
                  console.log('deleted entry: ' + id);
                  var timeout =  Promise.pending();
                  setTimeout(function() {
                    return timeout.resolve();
                  },250)
                  return timeout.promise;
                });
              },
              function () {
                return space.deleteEntry(entry).then(function () {
                  console.log('deleted entry: ' + id);
                  var timeout =  Promise.pending();
                  setTimeout(function() {
                    return timeout.resolve();
                  },250);
                  return timeout.promise;
                })
              })
            .catch(function(error){
                logger.error("error purging item: "+id+error);
              }) //end promise chain.
      );//end push.
    });
    return Promise.settle(deleted);
  }).then(function() { // call until there are no entries left.
    logger.debug('Finished batch.  Waiting to avoid rate limit.');
    space.getEntries().then(function(entries) {
      if (entries.length===0) {
        self.resolver.resolve();
      } else {
        setTimeout(function() {
          self.purgeEntries(space, batch+1);
        }, 100);
      }
    })
    return self.promise;
  });
};

ContentPurge.prototype.run = function () {
  var self = this;

  var contentfulClient = contentful.createClient({
    accessToken: self.config.contentful.contentManagementAccessToken
  });

  contentfulClient.getSpace(self.config.contentful.destinationSpace).catch(function (error) {
    logger.error('Could not find Space %s using access token %s ' + error, self.config.contentful.destinationSpace, self.config.contentful.contentManagementAccessToken);
    return error;
  }).then(function (space) {
    logger.info('Connected to the destination space', space.name);
    self.destinationSpace = space;

    self.purgeEntries(self.destinationSpace).then(function(){
      self.purgeContentTypes(self.destinationSpace);
    });
  });
  return self.promise;
};


module.exports = ContentPurge;
