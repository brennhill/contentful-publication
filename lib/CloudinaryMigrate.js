var cloudinary = require('cloudinary');

var CloudinaryMigrate = function (config) {
    this.config = config;
    this.resolver = Promise.pending();
    this.promise = this.resolver.promise;
    cloudinary.config()
};

CloudinaryMigrate.fromConfig = function(config) {
    return new CloudinaryMigrate(config);
}

CloudinaryMigrate.prototype.run = function() {
    cloud_name, api_key, api_secret
   var uploaded = cloudinary.api.resources(function(result){},{ type: 'upload', prefix: 'asroma_uat/' });
    console.log(uploaded);
}