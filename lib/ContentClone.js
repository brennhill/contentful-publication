'use strict';

var Promise = require('bluebird'),
  _ = require('lodash'),
  contentful = require('contentful-management'),
  logger = require('./logger'),
  Migrate = require('./Migrate');

var ContentClone = function (config) {
  this.config = config;
  this.resolver = Promise.pending();
  this.priorityTypes = this.config.priorityTypes;
  this.delayTypes  = this.config.delayTypes;
  this.promise = this.resolver.promise;
  this.idIndex = 0;

};


var promiseWhile = function(condition, action) {
  var resolver = Promise.defer();

  var loop = function() {
    if (!condition()) return resolver.resolve();
    return Promise.cast(action())
        .then(loop)
        .catch(resolver.reject);
  };

  process.nextTick(loop);

  return resolver.promise;
};


ContentClone.fromConfig = function (config) {
  return new ContentClone(config);
};

ContentClone.prototype._createTypeList= function(types) {
  var typeIds = [];
  _.forEach(types, function(type) {
    typeIds.push(type.sys.id);
  });
  return typeIds;
}

ContentClone.prototype._createIdSet = function(idList) {
  var self = this;
  _.forEach(self.priorityTypes, function(type){
    _.remove(idList, function(id) {
      return id == type;
    })
  })
  _.forEach(self.delayTypes, function(type){
    _.remove(idList, function(id) {
      return id == type;
    })
  });

  var newList = self.priorityTypes.concat(idList).concat(self.delayTypes);
  return newList;
}

ContentClone.prototype.run = function () {
  this.destinationClient = contentful.createClient({accessToken: this.config.contentful.contentManagementAccessToken});
  this.sourceClient = contentful.createClient({accessToken: this.config.contentful.contentManagementAccessToken});
  var self = this;

  this.sourceClient.getSpace(self.config.contentful.sourceSpace).then(function(space) {
    logger.info('Connected, getting source type list from ', space.name);
    return space.getContentTypes().then(function (types) {


    self.finalIDList = self._createIdSet(self._createTypeList(types));
    console.log("compiled type sequence");

    //iterate through each type and run the migrator
    promiseWhile(function(){
      if(self.idIndex< self.finalIDList.length) {
        return true
      }
      console.log("Finished type migrations");
      self.resolver.resolve();
      return false;
    }, function() {
      try {
        var curr = self.idIndex+1;
        console.log("Migrating entrytype #" + curr + "of " + self.finalIDList.length);
        var migrator = new Migrate.fromConfig(self.config);
        var promise = migrator.run(self.finalIDList[self.idIndex]);
      }catch(e){
        console.log(e);
      }
      self.idIndex++;
      return promise;
    });


    }, function(e){
      console.log(e);
    })
  },function(e){
    console.log(e);
  });
  return this.promise;
};


module.exports = ContentClone;
