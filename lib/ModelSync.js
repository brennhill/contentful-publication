'use strict';

var contentful = require('contentful-management'),
  Q = require('q'),
  _ = require('lodash'),
  logger = require('./logger');

var ModelSync = function(config) {
  this.config = config.contentful;
  this.failedModels = [];
  this.newModels = [];
};

ModelSync.prototype.createOrUpdateContentType = function(contentType, spaceDestination) {
  var contentTypeId = contentType.sys.id;
  var self = this;

  logger.info('Create or update model %s', contentTypeId);

  return spaceDestination.getContentType(contentTypeId).then(function(destinationContentType) {
    destinationContentType.fields = contentType.fields;
    return spaceDestination.updateContentType(destinationContentType);
  }).catch(function() {
    logger.debug('Cannot update, try to create content type: '+ contentTypeId);
    self.newModels.push(contentTypeId)
    return spaceDestination.createContentType(contentType);
  }).then(function(contentType) {
    return spaceDestination.publishContentType(contentType);
  }).catch(function(error) {
    self.failedModels.push(contentTypeId);
    logger.error('Cannot publish content type %s %s', contentTypeId, error);
  });
};

ModelSync.prototype.run = function() {
  var self = this;
  var spaceSource, spaceDestination;

  var contentManagementClient = contentful.createClient({
    accessToken: self.config.contentManagementAccessToken
  });
  var sourcecontentManagementClient = contentful.createClient({
    accessToken: self.config.sourceContentManagementToken
  });


  logger.info('Start models synchronization');

  return contentManagementClient.getSpace(self.config.destinationSpace)
    .catch(function(error) {
    logger.error('Could not find Space %s using access token %s', self.config.destinationSpace, self.config.contentManagementAccessToken);
    return error;
  }).then(function(space) {
    spaceDestination = space;
    return sourcecontentManagementClient.getSpace(self.config.sourceSpace);
  }).catch(function(error) {
    logger.error('Could not find Space %s using access token %s', self.config.sourceSpace, self.config.contentManagementAccessToken);
    return error;
  }).then(function(space) {
    spaceSource = space;
    return spaceSource.getContentTypes();
  }).catch(function(error) {
    logger.error('Could not get content types');
    return error;
  }).then(function(contentTypes) {
     var promises = contentTypes.map(function(contentType) {
       return self.createOrUpdateContentType(contentType, spaceDestination);
     });
     return Q.allSettled(promises);
  }).then(function(){
        _.forEach(self.failedModels, function(model){
          logger.error("Model failed: " + model);
        });
        _.forEach(self.newModels, function(model) {
          logger.info("New Model attempted: " + model);
        });
     return Q.resolve();
  }).then(function() {
    logger.info('All content types have been created or updated');
    return Q.resolve();
  });
};

module.exports = ModelSync;
