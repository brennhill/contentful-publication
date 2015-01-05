'use strict';

var bluebird = require('bluebird'),
  logger = require('./logger'),
  _ = require('lodash');

var EntryService = function(destinationSpace) {
  this.destinationSpace = destinationSpace;
  this.entriesToPublish = [];
};

EntryService.prototype.createOrUpdateEntry = function(data) {
  var deferred = bluebird.pending();

  var self = this;
  var entryType = data.sys.contentType.sys.id;
  var entryId = data.sys.id;

  self.destinationSpace.getEntry(entryId).then(function(entry) {
    console.log('ENTRY FOUND');
    entry.fields = data.fields;
    return self.destinationSpace.updateEntry(entry);

  }).catch(function() {
    logger.debug('Entry %s does not exist yet or cannot be updated', entryId);
    return self.destinationSpace.createEntry(entryType, data);

  }).then(function(entry) {
    self.entriesToPublish.push(entry);
    deferred.resolve();

  }).catch(function(error) {
    logger.error('Cannot create/update entry %s ' + error, entryId);
    deferred.reject(error);
  });

  return deferred.promise;
};

EntryService.prototype.deleteEntry = function(data) {
  var deferred = bluebird.pending();
  var self = this;
  var entryId = data.sys.id;

  console.log('delete entry');

  self.destinationSpace.unpublishEntry(entryId).catch(function () {
    logger.info('Cannot unpublish entry %s', entryId);
  }).then(function () {
    return self.destinationSpace.deleteEntry(entryId);
  }).then(function() {
    deferred.resolve();
  }).catch(function (error) {
    logger.error('Cannot delete entry %s : ' + error, entryId);
    deferred.reject(error);
  });

  return deferred.promise;
};

EntryService.prototype.publishAll = function() {
  var self = this;
  return _.map(self.entriesToPublish, function (entry) {
    return self.destinationSpace.publishEntry(entry);
  });
};

module.exports = EntryService;