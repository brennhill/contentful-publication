'use strict';

var Promise = require('bluebird'),
  _ = require('lodash'),
  contentful = require('contentful-management'),
  logger = require('./logger');

var ContentClone = function (config) {
  this.config = config;
  this.resolver = Promise.pending();
  this.priorityTypes = self.config.priorityTypes;
  this.delayTypes  = self.config.delayTypes;
  this.promise = this.resolver.promise;
  this.destinationClient = contentful.createClient({accessToken: self.config.contentful.contentManagementAccessToken});
  this.sourceClient = contentful.createClient({accessToken: self.config.contentful.sourceContentDeliveryToken});
};

ContentClone.fromConfig = function (config) {
  return new ContentClone(config);
};

ContentClone.prototype.updateContentTypes = function(space) {
  var self = this;
  var deleted = [];
  var batch = batchnum || 1;
  var original  = Promise.deferred();

  var priorityPromise = _.reduce(priorityTypes, function (promiseChain, type) {
    return promiseChain.then(function(type){

    });
  }, original.promise);

  original.resolve();

};


ContentClone.prototype.run = function () {
  var self = this;
  var contentfulClient =



  contentfulClient.getSpace(self.config.contentful.destinationSpace).catch(function (error) {
    logger.error('Could not find Space %s using access token %s ' + error, self.config.contentful.destinationSpace, self.config.contentful.contentManagementAccessToken);
    return error;
  }).then(function (space) {

  });
  return self.promise;
};


module.exports = ContentClone;
