'use strict';

var Promise = require('bluebird'),
  _ = require('lodash'),
  contentful = require('contentful-management'),
  logger = require('./logger');


// ES7 polyfill
String.prototype.lpad || (String.prototype.lpad = function( length, pad )
{
  if( length < this.length ) return this;
  pad = pad || ' ';
  var str = this;
  while( str.length < length )
  {
    str = pad + str;
  }

  return str.substr( -length );
});

String.prototype.rpad || (String.prototype.rpad = function( length, pad )
{
  if( length < this.length ) return this;

  pad = pad || ' ';
  var str = this;

  while( str.length < length )
  {
    str += pad;
  }
  return str.substr( 0, length );
});

var ContentClean = function (config) {
  this.config = config;
  this.resolver = Promise.pending();
  this.promise = this.resolver.promise;
};

ContentClean.fromConfig = function (config) {
  return new ContentClean(config);
};

ContentClean.prototype.cleanEntryTypes = function(space) {
  var self = this;

  return space.getContentTypes().then(function (types) {
    var original = Promise.pending();

    // Creates a promise chain.  Each type is cleaned before moving on to the next.  Helps with rate limiting.
    var finalpromise = _.reduce(types, function (promiseChain, type) {
      return promiseChain.then(function(){return self.cleanType(type, space)});
    }, original.promise);

    original.resolve();
    return finalpromise;
  })
};
/**
 * Saves the entries to the space.
 * @param space
 * @param type
 * @param entries
 * @return promise of saved entries
 */
ContentClean.prototype.saveEntries = function(space, type, entries) {
  var promise = Promise.pending();

  if(entries.length>0) {
    logger.info('Type check complete. Invalid entries cleaned.  Saving fixed entries!')
    var chain =  _.reduce(entries, function (promiseChain, entry) {
       return promiseChain.then(function(){
          return space.updateEntry(entry).then(function(){
            return space.getEntry(entry.sys.id).then(function(latestEntry) {
                logger.info('Saved entry: ' + entry.sys.id);
                entry.sys.version = latestEntry.sys.version;
                return space.publishEntry(entry, latestEntry.sys.version);
            });
          });
        });
    }, promise.promise);
    promise.resolve();
    return chain;
  } else{
    logger.info('Type check complete. Entries all valid.');
    promise.resolve();
    return promise.promise;
  }
};

/**
 * Gets all entries of a given content type in a given space and executes validations on entries. Saves fixed entries.
 * @param type
 * @param space
 */
ContentClean.prototype.cleanType = function(type, space) {
  //TODO: pull out saving from this method and have cleanType just return a promise of a list of entries for saving.
  var self = this;
  var typeid = type.sys.id;
  var toSave = []; // holds entries of a type to save.

  logger.info('Cleaning type: ' + type.name + ' :: ' + type.sys.id );
  var query = {
    'content_type': typeid,
  };
  //get entries, clean entries, save entries.
  return space.getEntries(query).then(function(entries) {
    var promise = Promise.pending();

    var finalPromise = _.reduce(entries, function (promiseChain, entry) {
      return promiseChain.then(function (lastResult) {
        return  self._cleanEntry(space, type, entry, toSave)
      });
    }, promise.promise);
    promise.resolve();
    return finalPromise;
  }).then(function () {
    return self.saveEntries(space, type, toSave)
  });

};

ContentClean.prototype._isReferenceField = function (typefield) {
  if(typefield.type === 'Array'){
    if(typefield.items.type === 'Link' && typefield.items.linkType === 'Entry') {
      return true
    }
  } else {
    if (typefield.type === 'Link' && typefield.linkType === 'Entry') {
      return true;
    }
  }
  return false;
};

ContentClean.prototype._getReferences = function(entryfield) {
 if (_.isArray(entryfield)) {
   var sysids = [];
   _.forEach(entryfield, function(item) {
     sysids.push(item.sys.id);
    });
    return sysids;
 } else {
    if(entryfield) {
     return [].push(entryfield);
    }
 }
  return [];
};
/**
 * @param space the space we are logged into.
 * @param entryfieldlang the entry field data. May contain
 * @param referenceIDs
 * @param compareEntities
 * @returns {boolean}
 * @private
 */
ContentClean.prototype._resolveReferences = function(space, entry, typefieldID, fieldlang, referenceIDs, compareEntities) {
  var good = [];
  var needsSave = false;

  /**
   * Retries publishing good entries up to 3 times.
   * This is necessary because a clone of the space will have failures due to "unresolved links"
   * when referenced items are unpublished.  So, to ensure that a space is clean ALL referenced items
   * must be in a published state for transfer.
   */
  function publishValidEntries(good, iteration) {
    var iter = iteration || 1;
    space.getEntries({
      'sys.id[in]':good
    }).then(function (goodEntries) {
      _.forEach(goodEntries, function (entry){
        if(entry.sys.version === entry.sys.publishedVersion+1) {
          console.log("Entry already published : " + entry.sys.id);
          return;
        }
        space.publishEntry(entry, entry.sys.version).then(function(success) {
          logger.info('Publish succeeded for entry: ' + entry.sys.id);
        },function (e) {
          logger.warn('Publish attempt: ' + iter + ' failed for entry: ' + entry.sys.id);
          if(iter<3) {
            iter++;
            console.log('Will try again after 15 second delay for: '+entry.sys.id);
            setTimeout(function(){publishValidEntries([entry.sys.id], iter)}, 15000);
          } else {
            logger.error('TOTAL FAILURE TO PUBLISH ENTRY - '+iter+' tries for '+entry.sys.id);
            logger.error(e);
          }
        });
      });
    });
  };

  _.forEach(compareEntities, function (entity) {
    good.push(entity.sys.id);
  });

  publishValidEntries(good);
  _.forEach(referenceIDs, function(ID) {
    if(!_.contains(good, ID)) {
      if(entry.fields[typefieldID][fieldlang] === ID) {
        entry.fields[typefieldID][fieldlang] = null;
        console.log("Found bad reference: " + ID);
      }
      if(_.isArray(entry.fields[typefieldID][fieldlang])) {
        entry.fields[typefieldID][fieldlang]= entry.fields[typefieldID][fieldlang].filter(function (ele, index, arr) {
          if(ele.sys.id === ID) {
            return false
          }
          console.log("Found bad reference: " + ID);
          return true;
        });
      }
      needsSave = true;
    }
  });
  return needsSave;
}

/**
 * Resolves references in a reference field
 * @param contenttype
 * @param entry
 * @param typefield
 * @param entryfield
 * @return promise of boolean - true if entry needs to be resaved and updated, false otherwise.
 * @private
 */
ContentClean.prototype._resolveFieldReferences = function(space, contenttype, entry){
  var self = this;
  var promise = Promise.pending();
  var needsSave = false;

  var finalPromise = _.reduce(contenttype.fields, function (promiseChain, typefield) {
    if(self._isReferenceField(typefield)) {
      return promiseChain.then(function(lastval) {
        var gotReferences = []; //used to track once we've cleaned everything.
        console.log(entry);
        _.forEach(entry.fields[typefield.id], function (entrylangItem, lang) {

          var referenceNumbers = self._getReferences(entrylangItem);

          if (referenceNumbers.length === 0) {
            gotReferences.push(false);
            return;
          }
          var typefieldID = typefield.id;
          var fieldlang = lang;

          //parallel check of all languages.
          gotReferences.push(space.getEntries({
            'sys.id[in]': referenceNumbers
          }).then(function (referencedEntries) {
            try{
              if(self._resolveReferences(space, entry, typefieldID, fieldlang, referenceNumbers, referencedEntries)) {
                needsSave = true;
              }
            } catch(e) {
              console.log("Possible blank 'fields' key due to blank entry: "+e);
              needsSave = true;
            }
          }));
        });
        return Promise.settle(gotReferences).then(function () {return needsSave});
      });
    } else {
      return promiseChain.then(function(){return needsSave});
    }
  }, promise.promise);
  promise.resolve();
  return finalPromise;
};

/**
 * Checks an entry against its type.
 * @param contentType
 * @param entry
 * @return promise of updated entry or false if no save needed.
 */
ContentClean.prototype._cleanEntry = function (space, contentType, entry, saveList) {
  var self = this;
  var needsSave = false;  //do we need to update entry?
  var cleanedPromise = Promise.pending();

  logger.debug('Inspecting entry: ' + entry.sys.id);
  console.log(entry);
  _.forEach (contentType.fields, function (typefield) {
    // VALIDATIONS on fields:
    console.log('Checking field: ' + typefield.name);

    try {
      if (self.cleanField(contentType, entry, typefield, entry.fields[typefield.id])) {
        needsSave = true;
      }
    } catch(e) {
      console.log(e);
      console.log(entry);
    }
  });
  self._resolveFieldReferences(space, contentType, entry).then(function(updated) {
    if(updated) {
      needsSave = true;
    }
    if(needsSave) {
      saveList.push(entry);
    }

    cleanedPromise.resolve(needsSave);

  });
  return cleanedPromise.promise;
};

ContentClean.prototype.cleanField = function(type, entry, typefield, entryField) {
  var self = this;
  var needsSave = false;
  if (typefield.required && !entryField) {
    logger.error('Field "' + field.name + '" of Entry: ' + entry.sys.id + ' is required but has no value');
    return; //nothing to do here now.  Must be fixed manually
  };
  // VALIDATION: invalid localization entries
  if (!typefield.localization) {
    _.forEach(entryField, function(langEntry, lang) {
      if(lang!=self.config.contentful.defaultLocale) {
        logger.error('Invalid language entry, for language: ' + lang + ', with value: "' + langEntry + '".  Deleting entry for language: "' + lang + '".');
        delete entryField[lang];
        needsSave = true;
      }
    });
  }

  /**
   * For some reason validations are stored in a different place on multi-valued properties.
   */
  var validations = self._getValidations(typefield);
  // VALIDATIONS: Set values, value length, and regex
  if (validations && validations.length>0) {
    /**
     * Validations are stored as an array of objects, each object representing a validation.
     * Each validation type has different key, that then describes the data.
     */
    _.forEach(validations, function(validation) {

      //only used for reference field.
      if(validation['linkContentType']) {

      }

      // Restricted to a set of possibilities.
      if (validation['in']) {
        //validate each language
        _.forEach(entryField, function (langEntry, lang) {
          // Multivalued property
          if (_.isArray(langEntry)) {
            _.forEach(langEntry, function (langEntryItem, index) {
              if (!_.contains(validation['in'], langEntryItem)) {
                logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'has value outside of validation set. using first value of validation.');
                entry.fields[typefield.id][lang][index]  = validation['in'][0];
                needsSave = true;
              }
            });
          }
          // Single valued property.
          else {
            if (!_.contains(validation['in'], langEntry)) {
              logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'has value outside of validation set. using first value of validation.');
              entry.fields[typefield.id][lang] = validation['in'][0];
              needsSave = true;
            }
          }
        });
      }
      // END restricted set validation.

      // BEGIN number range validation.  Only used on number fields.
      if(validation['range']) {
        var min = validation['range'].min;
        var max = validation['range'].max
        _.forEach(entryField, function (langEntry, lang) {
          // Multivalued property
          if (_.isArray(langEntry)) {
            _.forEach(langEntry, function (langEntryItem, index) {
              if (min && langEntryItem.length < min) {
                logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'is under the minimum..');
              };

              if (max && langEntryItem.length > max) {
                logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'is above the maximum.');
              };
            });
          }
          // Single valued property.
          else {
            if (min && langEntry.length < min) {
              logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'is under the minimum..');
            }
            if (max && langEntry.length > max) {
              logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'is above the maximum.');
            }
          }
        });
      }
      // END number range validation.

      // BEGIN size/character length validation
      // Padding is done with periods because spaces don't count.
      if (validation['size']) {
        var min = validation['size'].min;
        var max = validation['size'].max
        _.forEach(entryField, function (langEntry, lang) {
          // Multivalued property
          if (_.isArray(langEntry)) {
            _.forEach(langEntry, function (langEntryItem, index) {
              if (min && langEntryItem.length < min) {
                logger.error('Field item"' + field.name + '" of Entry: ' + entry.sys.id + 'is not long enough.');
                entry.fields[typefield.id][lang][index] = langEntryItem.rpad(min, ' ');
                needsSave = true;
              };

              if (max && langEntryItem.length > max) {
                logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'is too long.  Truncating to max length.');
                entry.fields[typefield.id][lang][index] = langEntryItem.substring(0, max-1);
                needsSave = true;
              };
            });
          }
          // Single valued property.
          else {
            if (min && langEntry.length < min) {
              logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'is not long enough.');
              entry.fields[typefield.id][lang] = langEntry.rpad(min, ' ');
              needsSave = true;
            }
            if (max && langEntry.length > max) {
              logger.error('Field "' + typefield.name + '" of Entry: ' + entry.sys.id + 'is too long.  Truncating to max length.');
              entry.fields[typefield.id][lang] = langEntry.substring(0, max-1);
              needsSave = true;

            }
          }
        });
      } // END size validations.


      if (validation['regexp']) {
      }
    });//END foreach.
  };
  // END Validation set: set, size, regex
  return needsSave;
}

ContentClean.prototype._getValidations = function(typefield) {
  if(typefield.type === "Array") {
   return  typefield.items.validations;
  }
  return typefield.validations;
}


ContentClean.prototype.run = function () {
  var self = this;

  var contentfulClient = contentful.createClient({
    accessToken: self.config.contentful.sourceContentManagementToken
  });

  contentfulClient.getSpace(self.config.contentful.sourceSpace).catch(function (error) {
    logger.error('Could not find Space %s using access token %s ' + error, self.config.contentful.sourceSpace, self.config.contentful.sourceContentManagementToken);
    return error;
  }).then(function (space) {
    logger.info('Connected to the source space', space.name);
    self.cleanEntryTypes(space);
  });
  return self.promise;
};


module.exports = ContentClean;
