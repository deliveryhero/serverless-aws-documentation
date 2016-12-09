'use strict';
const AWS = require('aws-sdk');

const documentationProperties = ['description'];

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

module.exports = {
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
        throw new Error(`definition for type "${part.type}" is not an array`);
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
    return apiGateway.getDocumentationParts({
      restApiId: this.restApiId,
      limit: 9999,
    }).promise()
      .then(results => results.items.map(part => apiGateway.deleteDocumentationPart({
        documentationPartId: part.id,
        restApiId: this.restApiId,
      }).promise()))
      .then(promises => Promise.all(promises))
      .then(() => this.documentationParts.map(part => {
        part.properties = JSON.stringify(part.properties);
        return apiGateway.createDocumentationPart(part).promise();
      }))
      .then(promises => Promise.all(promises))
      .then(() => apiGateway.getDocumentationVersion({
        restApiId: this.restApiId,
        documentationVersion: this.customVars.documentation.version,
      }).promise())
      .then(version => {
        console.info('-------------------');
        console.info('documentation version already exists, skipping upload');
      }, err => {
        if (err.message === 'Invalid Documentation version specified') {
          return apiGateway.createDocumentationVersion({
            restApiId: this.restApiId,
            documentationVersion: this.customVars.documentation.version,
            stageName: this.options.stage,
          }).promise();
        }

        return Promise.reject(err);
      });
  },

  getGlobalDocumentationParts: function getGlobalDocumentationParts() {
    const globalDocumentation = this.customVars.documentation || {};
    this.createDocumentationParts(globalDocumentationParts, globalDocumentation, {});
  },

  getFunctionDocumentationParts: function getFunctionDocumentationParts() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName);
      func.events.forEach(eventTypes => {
        if (eventTypes.http && eventTypes.http.documentation) {
          const path = eventTypes.http.path;
          const method = eventTypes.http.method.toUpperCase();
          this.createDocumentationParts(functionDocumentationParts, eventTypes.http, { path, method });
        }
      });
    });
  },

  _buildDocumentation: function _buildDocumentation(result) {
    this.restApiId = result.Stacks[0].Outputs
      .filter(output => output.OutputKey === 'ApiId')
      .map(output => output.OutputValue)[0];

    this.getGlobalDocumentationParts();
    this.getFunctionDocumentationParts();

    if (this.options.noDeploy) {
      console.info('-------------------');
      console.info('documentation parts:');
      console.info(this.documentationParts);
      return;
    }

    this._updateDocumentation();
  }
}
