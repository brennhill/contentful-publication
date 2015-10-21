var Promise = require('bluebird'),
    _ = require('lodash'),
    contentful = require('contentful-management'),
    logger = require('./logger');


function sleep(seconds)
{
    var e = new Date().getTime() + (seconds * 1000);
    while (new Date().getTime() <= e) {}
}


var Migrate = function (config) {
    this.config = config;
    this.resolver = Promise.pending();
    this.promise = this.resolver.promise;
    this.migrate = this.config.migrate;

};

Migrate.fromConfig = function(config) {
    return new Migrate(config);
};

Migrate.prototype.migrateEntry = function(entry) {
 var self = this;
}

Migrate.prototype.run = function(typeId) {
    console.log("running");
    console.log("migrating type: "+typeId);
    var self = this;
    this.dClient = contentful.createClient({accessToken: self.config.contentful.contentManagementAccessToken});
    this.sourceClient = contentful.createClient({accessToken: self.config.contentful.contentManagementAccessToken});

   self.sourceClient.getSpace(self.config.contentful.sourceSpace).then(function(space) {
        logger.info('Connected to the source space', space.name);
        space.getEntries({
            'content_type':typeId,
            'limit':200
        }).then(function (entries) {
            console.log("got entries");
            console.log(entries.length);
            self.dClient.getSpace(self.config.contentful.destinationSpace).then(function(dspace){
                logger.info('Connected to the destination space', dspace.name);
                _.forEach(entries, function(entry){
                    dspace.createEntry(typeId, entry).then(function(res){
                        console.log("Migrated entry:" +res.sys.id);
                        dspace.publishEntry(res);
                    },function(e){
                        logger.error(e);
                    });
                })
            })

        },function(e){
            console.log(e);
        });
    },function(e){
        console.log(e);
    });
    return self.promise;
};

module.exports = Migrate;