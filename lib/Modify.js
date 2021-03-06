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
    this.sourceClient = contentful.createClient({accessToken: self.config.contentful.contentManagementAccessToken});

    var doMigrate = function (entries) {
            return self.sourceClient.getSpace(self.config.contentful.destinationSpace).then(function(dspace){
                var promises = [];
                logger.info('Connected to the destination space', dspace.name);
                _.forEach(entries, function(entry){
                    promises.push(sourcespace.createEntry(typeId, entry).then(function(res){
                        console.log("Migrated entry: " +res.sys.id);
                        return dspace.publishEntry(res).catch(function(e) {
                            logger.error(e);
                        });
                    },function(e){
                        logger.error("Couldn't migrate item: " + entry.sys.id + ".  Item may already exist. Reason: " + e.name || e);

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