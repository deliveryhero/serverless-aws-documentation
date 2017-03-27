'use strict';

const objectHash = require('object-hash');

const documentationProperties = ['description', 'summary'];

const globalDocumentationParts = require('./globalDocumentationParts.json');
const functionDocumentationParts = require('./functionDocumentationParts.json');

function  getDocumentationProperties(def) {
  const docProperties = new Map();
  documentationProperties.forEach((key) => {
    if (def[key]) {
      docProperties.set(key, def[key]);
    }
  });
  return docProperties;
}

function _mapToObj(map) {
  const returnObj = {};
  map.forEach((val, key) => {
    returnObj[key] = val;
  });

  return returnObj;
}

var autoVersion;

module.exports = function(AWS) {
  return {
    _createDocumentationPart: function _createDocumentationPart(part, def, knownLocation) {
      const location = part.locationProps.reduce((loc, property) => {
        loc[property] = knownLocation[property] || def[property];
        return loc;
      }, {});
      location.type = part.type;

      const props = getDocumentationProperties(def);
      if (props.size > 0) {
        this.documentationParts.push({
          location,
          properties: _mapToObj(props),
          restApiId: this.restApiId,
        });
      }

      if (part.children) {
        this.createDocumentationParts(part.children, def, location);
      }
    },

    createDocumentationPart: function createDocumentationPart(part, def, knownLocation) {
      if (part.isList) {
        if (!(def instanceof Array)) {
          const msg = `definition for type "${part.type}" is not an array`;
          console.info('-------------------');
          console.info(msg);
          throw new Error(msg);
        }

        def.forEach((singleDef) => this._createDocumentationPart(part, singleDef, knownLocation));
      } else {
        this._createDocumentationPart(part, def, knownLocation);
      }
    },

    createDocumentationParts: function createDocumentationParts(parts, def, knownLocation) {
      Object.keys(parts).forEach((part) => {
        if (def[part]) {
          this.createDocumentationPart(parts[part], def[part], knownLocation);
        }
      });
    },

    _updateDocumentation: function _updateDocumentation() {
      const apiGateway = new AWS.APIGateway(this.serverless.providers.aws.getCredentials());
      return apiGateway.getDocumentationVersion({
        restApiId: this.restApiId,
        documentationVersion: this.getDocumentationVersion(),
      }).promise()
        .then(() => {
          const msg = 'documentation version already exists, skipping upload';
          console.info('-------------------');
          console.info(msg);
          return Promise.reject(msg);
        }, err => {
          if (err.message === 'Invalid Documentation version specified') {
            return Promise.resolve();
          }

          return Promise.reject(err);
        })
        .then(() => apiGateway.getDocumentationParts({
          restApiId: this.restApiId,
          limit: 9999,
        }).promise())
        .then(results => results.items.map(part => apiGateway.deleteDocumentationPart({
          documentationPartId: part.id,
          restApiId: this.restApiId,
        }).promise()))
        .then(promises => Promise.all(promises))
        .then(() => this.documentationParts.reduce((promise, part) => {
          return promise.then(() => {
            part.properties = JSON.stringify(part.properties);
            return apiGateway.createDocumentationPart(part).promise();
          });
        }, Promise.resolve()))
        .then(() => apiGateway.createDocumentationVersion({
          restApiId: this.restApiId,
          documentationVersion: this.getDocumentationVersion(),
          stageName: this.options.stage,
        }).promise());
    },

    getGlobalDocumentationParts: function getGlobalDocumentationParts() {
      const globalDocumentation = this.customVars.documentation;
      this.createDocumentationParts(globalDocumentationParts, globalDocumentation, {});
    },


    getFunctionDocumentationParts: function getFunctionDocumentationParts() {
      const httpEvents = this._getHttpEvents();
      Object.keys(httpEvents).forEach(funcName => {
        const httpEvent = httpEvents[funcName];
        const path = httpEvent.path;
        const method = httpEvent.method.toUpperCase();
        this.createDocumentationParts(functionDocumentationParts, httpEvent, { path, method });
      });
    },

    _getHttpEvents: function _getHttpEvents() {
      return this.serverless.service.getAllFunctions().reduce((documentationObj, functionName) => {
        const func = this.serverless.service.getFunction(functionName);
        const funcHttpEvent = func.events
        .filter((eventTypes) => eventTypes.http && eventTypes.http.documentation)
        .map((eventTypes) => eventTypes.http)[0];

        if (funcHttpEvent) {
          documentationObj[functionName] = funcHttpEvent;
        }

        return documentationObj;
      }, {});
    },

    generateAutoDocumentationVersion: function generateAutoDocumentationVersion() {
      const versionObject = {
        globalDocs: this.customVars.documentation,
        functionDocs: {},
      }

      const httpEvents = this._getHttpEvents();
      Object.keys(httpEvents).forEach(funcName => {
        versionObject.functionDocs[funcName] = httpEvents[funcName].documentation;
      });

      autoVersion = objectHash(versionObject);

      return autoVersion;
    },

    getDocumentationVersion: function getDocumentationVersion() {
      return this.customVars.documentation.version || autoVersion || this.generateAutoDocumentationVersion();
    },

    _buildDocumentation: function _buildDocumentation(result) {
      this.restApiId = result.Stacks[0].Outputs
        .filter(output => output.OutputKey === 'AwsDocApiId')
        .map(output => output.OutputValue)[0];

      this.getGlobalDocumentationParts();
      this.getFunctionDocumentationParts();

      if (this.options.noDeploy) {
        console.info('-------------------');
        console.info('documentation parts:');
        console.info(this.documentationParts);
        return;
      }

      return this._updateDocumentation();
    },

    addRequestHeaders: function addRequestHeaders(resource, documentation) {
      if (documentation.requestHeaders && Object.keys(documentation.requestHeaders).length > 0) {
        //this.addModelDependencies(documentation.requestModels, resource);
        if (!resource.Properties.RequestParameters) {
          resource.Properties.RequestParameters = {};
        }
        documentation.requestHeaders.forEach(function(rh){
          var source = 'method.request.header.'+rh.name;
          resource.Properties.RequestParameters[source] = rh.required || false;
        })
      }
    },

    updateCfTemplateFromHttp: function updateCfTemplateFromHttp(eventTypes) {
      if (eventTypes.http && eventTypes.http.documentation) {
        const resourceName = this.normalizePath(eventTypes.http.path);
        const methodLogicalId = this.getMethodLogicalId(resourceName, eventTypes.http.method);
        const resource = this.cfTemplate.Resources[methodLogicalId];

        resource.DependsOn = new Set();
        this.addMethodResponses(resource, eventTypes.http.documentation);
        this.addRequestModels(resource, eventTypes.http.documentation);
        this.addRequestHeaders(resource, eventTypes.http.documentation);
        resource.DependsOn = Array.from(resource.DependsOn);
        if (resource.DependsOn.length === 0) {
          delete resource.DependsOn;
        }
      }
    }
  };
};
