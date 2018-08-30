'use strict';

const objectHash = require('object-hash');

const globalDocumentationParts = require('./globalDocumentationParts.json');
const functionDocumentationParts = require('./functionDocumentationParts.json');

function getDocumentationProperties(def, propertiesToGet) {
  const docProperties = new Map();
  propertiesToGet.forEach((key) => {
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

/*
 * Different types support different extra properties beyond
 * the basic ones, so we need to make sure we only look for
 * the appropriate properties.
 */
function determinePropertiesToGet (type) {
  const defaultProperties = ['description', 'summary']
  let result = defaultProperties
  switch (type) {
    case 'API':
      result.push('tags', 'info')
      break;
    case 'METHOD':
      result.push('tags')
      break;
    case 'PATH_PARAMETER':
    case 'QUERY_PARAMETER':
    case 'REQUEST_HEADER':
    case 'REQUEST_BODY':
      result.push('required')
      break;
  }
  return result

}

function mapPathLogicalPart(path) {
  return path.split('/').map((x) => {
    if (x.startsWith('{') && x.endsWith('}'))
      return x.slice(1, x.length - 1);
    return x[0].toUpperCase() + x.slice(1);
  }).join('')
}

function mapStringToSafeHex(string) {
  return string.split().map((x) => x.charCodeAt(0).toString(16)).join('');
}

function logicalIdCompatible(text) {
  const alphanumericRegex = /[^A-Za-z0-9]/g;
  return text.replace(alphanumericRegex, mapStringToSafeHex);
}

function logicalIdForPart(location) {
  switch (location.type) {
  case 'API':
    return 'RestApiDocPart';
  case 'RESOURCE':
    return mapPathLogicalPart(location.path) + 'ResourceDocPart';
  case 'METHOD':
    return mapPathLogicalPart(location.path) + location.method + 'MethodDocPart';
  case 'QUERY_PARAMETER':
    return mapPathLogicalPart(location.path) + location.method + logicalIdCompatible(location.name) + 'QueryParamDocPart';
  case 'REQUEST_BODY':
    return mapPathLogicalPart(location.path) + location.method + 'ReqBodyDocPart';
  case 'REQUEST_HEADER':
    return mapPathLogicalPart(location.path) + location.method + logicalIdCompatible(location.name) + 'ReqHeadDocPart';
  case 'PATH_PARAMETER':
    return mapPathLogicalPart(location.path) + location.method + logicalIdCompatible(location.name) + 'PathParamDocPart';
  case 'RESPONSE':
    return mapPathLogicalPart(location.path) + location.method + location.statusCode + 'ResDocPart';
  case 'RESPONSE_HEADER':
    return mapPathLogicalPart(location.path) + location.method + logicalIdCompatible(location.name) + location.statusCode + 'ResHeadDocPart';
  case 'RESPONSE_BODY':
    return mapPathLogicalPart(location.path) + location.method + location.statusCode + 'ResBodyDocPart';
  case 'AUTHORIZER':
    return logicalIdCompatible(location.name) + 'AuthorizerDocPart';
  case 'MODEL':
    return logicalIdCompatible(location.name) + 'ModelDocPart';
  default:
    throw new Error('Unknown location type ' + location.type);
  }
}

var autoVersion;

module.exports = function() {
  return {
    _createDocumentationPart: function _createDocumentationPart(part, def, knownLocation) {
      const location = part.locationProps.reduce((loc, property) => {
        loc[property] = knownLocation[property] || def[property];
        return loc;
      }, {});
      location.type = part.type;
      const propertiesToGet = determinePropertiesToGet(location.type)

      const props = getDocumentationProperties(def, propertiesToGet);
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
      const aws = this.serverless.providers.aws;
      return aws.request('APIGateway', 'getDocumentationVersion', {
        restApiId: this.restApiId,
        documentationVersion: this.getDocumentationVersion(),
      }).then(() => {
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
        .then(() => aws.request('APIGateway', 'createDocumentationVersion', {
          restApiId: this.restApiId,
          documentationVersion: this.getDocumentationVersion(),
          stageName: this.options.stage,
        }));
    },

    getGlobalDocumentationParts: function getGlobalDocumentationParts() {
      const globalDocumentation = this.customVars.documentation;
      this.createDocumentationParts(globalDocumentationParts, globalDocumentation, {});
    },

    getFunctionDocumentationParts: function getFunctionDocumentationParts() {
      const httpEvents = this._getHttpEvents();
      Object.keys(httpEvents).forEach(funcNameAndPath => {
        const httpEvent = httpEvents[funcNameAndPath];
        const path = httpEvent.path;
        const method = httpEvent.method.toUpperCase();
        this.createDocumentationParts(functionDocumentationParts, httpEvent, { path, method });
      });
    },

    _getHttpEvents: function _getHttpEvents() {
      return this.serverless.service.getAllFunctions().reduce((documentationObj, functionName) => {
        const func = this.serverless.service.getFunction(functionName);
        func.events
          .filter((eventTypes) => eventTypes.http && eventTypes.http.documentation)
          .map((eventTypes) => eventTypes.http)
          .forEach(currEvent => {
            let key = functionName + currEvent.method + currEvent.path;
            documentationObj[key] = currEvent;
          });
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

      return this._updateDocumentation();
    },

    updateCfTemplateWithEndpoints: function updateCfTemplateWithEndpoints(restApiId) {
      this.restApiId = restApiId;

      this.getGlobalDocumentationParts();
      this.getFunctionDocumentationParts();

      if (this.options.noDeploy) {
        console.info('-------------------');
        console.info('documentation parts:');
        console.info(this.documentationParts);
        return;
      }

      const documentationPartResources = this.documentationParts.reduce((docParts, docPart) => {
        docParts[logicalIdForPart(docPart.location)] = {
          Type: 'AWS::ApiGateway::DocumentationPart',
          Properties: {
            Location: {
              Type: docPart.location.type,
              Name: docPart.location.name,
              Path: docPart.location.path,
              StatusCode: docPart.location.statusCode,
              Method: docPart.location.method,
            },
            Properties: JSON.stringify(docPart.properties),
            RestApiId: docPart.restApiId,
          }
        };
        return docParts;
      }, {});

      Object.assign(this.cfTemplate.Resources, documentationPartResources);
    },

    addDocumentationToApiGateway: function addDocumentationToApiGateway(resource, documentationPart, mapPath) {
      if (documentationPart && Object.keys(documentationPart).length > 0) {
        if (!resource.Properties.RequestParameters) {
          resource.Properties.RequestParameters = {};
        }

        documentationPart.forEach(function(qp) {
          const source = `method.request.${mapPath}.${qp.name}`;
          if (resource.Properties.RequestParameters.hasOwnProperty(source)) return; // don't mess with existing config
          resource.Properties.RequestParameters[source] = qp.required || false;
        });
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
        if (!this.options['doc-safe-mode']) {
          this.addDocumentationToApiGateway(
            resource,
            eventTypes.http.documentation.requestHeaders,
            'header'
          );
          this.addDocumentationToApiGateway(
            resource,
            eventTypes.http.documentation.queryParams,
            'querystring'
          );
          this.addDocumentationToApiGateway(
              resource,
              eventTypes.http.documentation.pathParams,
              'path'
          );
        }
        resource.DependsOn = Array.from(resource.DependsOn);
        if (resource.DependsOn.length === 0) {
          delete resource.DependsOn;
        }
      }
    },

    _getDocumentationProperties: getDocumentationProperties
  };
};
