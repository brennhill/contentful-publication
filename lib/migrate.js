var Promise = require('bluebird'),
    _ = require('lodash'),
    contentful = require('contentful-management'),
    logger = require('./logger');


function sleep(seconds)
{
    var e = new Date().getTime() + (seconds * 1000);
    while (new Date().getTime() <= e) {}
}


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



var Migrate = function (config) {
    this.config = config;
    this.resolver = Promise.pending();
    this.promise = this.resolver.promise;
    this.migrate = this.config.migrate;
    this.skip = 0;
    this.typeId = '';
    this.complete = false;
};

Migrate.fromConfig = function(config) {
    return new Migrate(config);
};

Migrate.prototype.migrateEntry = function(entry) {
 var self = this;
}

Migrate.prototype.run = function(typeId) {
    var self = this;
    if(!typeId) {
        self.resolver.resolve();
        return self.promise;
    }
    console.log('=== Migrating type: ' + typeId + ' ===');

    self.typeId = typeId;
    this.dClient = contentful.createClient({accessToken: self.config.contentful.contentManagementAccessToken});
    this.sourceClient = contentful.createClient({accessToken: this.config.contentful.sourceContentManagementToken});

    var doMigrate = function (entries) {
            return self.dClient.getSpace(self.config.contentful.destinationSpace).then(function(dspace){
                var promises = [];
                logger.info('Connected to the destination space', dspace.name);
                _.forEach(entries, function(entry){
                    promises.push(dspace.createEntry(typeId, entry).then(function(res){
                        console.log("Migrated entry: " +res.sys.id);
                        return dspace.publishEntry(res).catch(function(e) {
                            logger.error(e);
                        });
                    },function(e){
                        console.log("Item "+entry.sys.id+" exists.");
                        return dspace.getEntry(entry.sys.id).then(function (newEntry) {
                            console.log("Got current version of "+entry.sys.id);
                            //entry = modifier(entry);
                            entry.sys.version = newEntry.sys.version;

                            return dspace.updateEntry(entry).then(function (updated) {
                                console.log(updated.sys.id + " updated.")
                                return dspace.publishEntry(updated).then(function () {
                                    console.log(updated.sys.id + "Entry published.")
                                },function(e){
                                    logger.error(entry.sys.id + "failed publish.");
                                });
                            }, function (e) {
                               logger.error("Failed update "+entry.sys.id);
                                return null;
                            });
                        }, function(e){
                            logger.error("Failed to get entry "+entry.sys.id);
                        })

                    }));
                });
                //this is the last batch.
                if(entries.length<200) {
                    self.complete = true;
                } else {
                    self.skip=self.skip+200;
                }
                return Promise.settle(promises);
            });
    };
    var logError = function(e) {
        console.log(e);
        return Promise.deferred().settle(e);
    }

    var getMigrateItems = function() {
       return self.sourceClient.getSpace(self.config.contentful.sourceSpace).then(function(space, start) {
            logger.info('Connected to the source space', space.name);
            return space.getEntries({
                'content_type':typeId,
                'limit':200,
                'skip': self.skip
            }).then(doMigrate, logError);
        });
    };
    promiseWhile(function() {
        if(self.complete) {
            self.resolver.resolve();
            return false;
        }
        return true;
    }, getMigrateItems)

    return self.promise;
}

module.exports = Migrate;