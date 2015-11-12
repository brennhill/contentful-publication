var Promise = require('bluebird'),
    _ = require('lodash'),
    contentful = require('contentful'),
    deep = require('deep-diff'),
    eql = require('deep-equal'),
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



var Audit = function (config) {
    var self = this;
    this.missing = [];
    this.config = config;
    this.resolver = Promise.pending();
    this.promise = this.resolver.promise;
    this.skip = 0;
    this.complete = false;
    this.sourceClient = contentful.createClient({
        "accessToken": self.config.contentful.sourceContentDeliveryToken,
        "host": "cdn.contentful.com",
        "space":self.config.contentful.sourceSpace
    });
    this.dClient = contentful.createClient({
        "accessToken": self.config.contentful.destinationContentDeliveryToken,
        "host": "cdn.contentful.com",
        "space":self.config.contentful.destinationSpace
    });


};

Audit.fromConfig = function(config) {
    return new Audit(config);
};


Audit.prototype.checkEntry = function(entry) {
    var self = this;
    if(!entry){
        console.log("missing entry");
    }
   return this.dClient.entry(entry.sys.id).then(function(dentry){
       var same = eql(entry.fields, dentry.fields);
       if(!same) {
           console.log("Updated: " + dentry.sys.id);
       } else {
           console.log("Valid: " + dentry.sys.id);
       }
    }, function(error){
        console.log(error);
       console.log(entry);
        logger.error("Missing entry:" + entry.sys.id);
        self.missing.push(entry.sys.id);
    }).catch(function(e){
       console.log(e);
   })
}

Audit.prototype.getNextEntries = function () {
    var self = this;
    var query = {
        order: '-sys.createdAt',
        limit: 100,
        skip: self.skip*100
    };
    return this.sourceClient.entries(query).then(function(entries){
        if(entries.length<100) {
            self.complete=true;
        }
        var checked = [];
        _.forEach(entries,function(entry) {
            checked.push(self.checkEntry(entry));
        });
        return Promise.settle(checked);
    })
};

Audit.prototype.run = function() {
    var self = this;

    logger.info('=== Auditing spaces: ' + self.config.contentful.sourceSpace + ' vs ' + self.config.contentful.destinationSpace + ' ===');
    this.sourceClient.space().then(function(space) {
        console.log("Logged into source space: "+space.sys.id);
        self.sourceSpace = space;

        try {
            return self.dClient.space().then(function (space) {
                console.log("Logged into destination space: " + space.sys.id);
                self.destinationSpace = space;
                return promiseWhile(function () {
                    if (self.complete) {
                        self.resolver.resolve();
                        return false;
                    }
                    self.skip++;
                    return true;
                }, function(){return self.getNextEntries.call(self)})
            }, function (e) {
                console.trace(e);
            });
        }catch(e){
            console.trace(e);
        }
    }, function(e){
        console.trace(e);
    });

    return self.promise;
}





module.exports = Audit;