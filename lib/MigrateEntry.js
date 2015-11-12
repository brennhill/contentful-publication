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
    this.itemId = '';
    this.complete = false;
};

Migrate.fromConfig = function(config) {
    return new Migrate(config);
};

Migrate.prototype.migrateEntry = function(entry) {
 var self = this;
}

Migrate.prototype.run = function(itemId) {
    var self = this;
    if(!itemId) {
        self.resolver.resolve();
        return self.promise;
    }
    console.log('=== Migrating item: ' + itemId + ' ===');

    self.itemId = itemId;
    this.dClient = contentful.createClient({accessToken: self.config.contentful.contentManagementAccessToken});
    this.sourceClient = contentful.createClient({accessToken: self.config.contentful.sourceContentManagementToken});


    var logError = function(e) {
        console.log(e);
        return Promise.deferred().settle(e);
    }

    var getMigrateItems = function() {
       return self.sourceClient.getSpace(self.config.contentful.sourceSpace).then(function(space, start) {
            logger.info('Connected to the source space', space.name);
            console.log("Getting entry: "+self.itemId);
            return space.getEntry(self.itemId).then(function (entry) {
                console.log("Got entry");
                return self.dClient.getSpace(self.config.contentful.destinationSpace).then(
                    function(dspace) {
                        console.log("Connected to destination");
                        return dspace.createEntry(entry.sys.contentType.sys.id, entry).then(function (newEntry) {
                            console.log("created");
                            return dspace.publishEntry(newEntry).then(function () {
                                console.log("transfered");
                                self.resolver.resolve();
                            }, function (e) {
                                console.log(e);
                            })
                        }, function() {
                            console.log("entry exists already");
                            return dspace.getEntry(self.itemId).then(function(newEntry) {
                                console.log("entry exists, updating");
                                entry.sys.version = newEntry.sys.version;
                                self.resolver.resolve();
                                return dspace.updateEntry(entry).then(function(updated) {
                                    console.log("updated.")
                                    return dspace.publishEntry(updated).then(function(){
                                        console.log("Entry published")
                                    }, console.log);
                                }, function() {

                                });
                            })
                        })
                    },
                    function(e){
                        console.log(e);
                    })

                }, console.log);

            }, logError);
    };
    getMigrateItems();
    return self.promise;
}

module.exports = Migrate;