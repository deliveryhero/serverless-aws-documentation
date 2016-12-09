'use strict';
const AWS = require('aws-sdk');

class ServerlessAwsModels {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws'

    this.customVars = this.serverless.variables.service.custom;
    const naming = this.serverless.providers.aws.naming;
    this.getMethodLogicalId = naming.getMethodLogicalId.bind(naming);
    this.normalizePath = naming.normalizePath.bind(naming);

    this._beforeDeploy = this.beforeDeploy.bind(this)
    this._afterDeploy = this.afterDeploy.bind(this)

    this.hooks = {
      'before:deploy:deploy': this._beforeDeploy,
      'after:deploy:deploy': this._afterDeploy,
    };

    this.documentationParts = [];
  }

  static transformToCfKeys(resource) {
    const _resource = Object.assign({}, resource);
    Object.keys(_resource).forEach((key) => {
      const cfKey = key.charAt(0).toUpperCase() + key.slice(1);
      _resource[cfKey] = _resource[key];
      delete _resource[key];
    });

    return _resource;
  }

  createCfModel(model) {
    return {
      Type: 'AWS::ApiGateway::Model',
      Properties: {
        RestApiId: {
          Ref: 'ApiGatewayRestApi',
        },
        ContentType: model.contentType,
        Name: model.name,
        Schema: model.schema,
      },
    };
  }

  addModelDependencies(models, resource) {
    Object.keys(models).forEach(contentType => {
      resource.DependsOn.add(`${models[contentType]}Model`);
    });
  }

  addMethodResponses(resource, httpEvt) {
    if (httpEvt.methodResponses) {
      resource.Properties.MethodResponses = [];

      httpEvt.methodResponses.forEach(response => {
        const _response = {
          StatusCode: response.statusCode,
          ResponseModels: response.responseModels,
        };

        this.addModelDependencies(_response.ResponseModels, resource);
        resource.Properties.MethodResponses.push(_response);
      });
    }
  }

  addRequestModels(resource, httpEvt) {
    if (httpEvt.requestModels) {
      this.addModelDependencies(httpEvt.requestModels, resource);
      resource.Properties.RequestModels = httpEvt.requestModels;
    }
  }

  updateCfTemplateFromHttp(eventTypes) {
    if (eventTypes.http && eventTypes.http.documentation) {
      const resourceName = this.normalizePath(eventTypes.http.path);
      const methodLogicalId = this.getMethodLogicalId(resourceName, eventTypes.http.method);
      const resource = this.cfTemplate.Resources[methodLogicalId];

      resource.DependsOn = new Set();
      this.addMethodResponses(resource, eventTypes.http.documentation);
      this.addRequestModels(resource, eventTypes.http.documentation);
      resource.DependsOn = Array.from(resource.DependsOn);
      if (resource.DependsOn.length === 0) {
        delete resource.DependsOn;
      }
    }
  }

  beforeDeploy() {
    if (!(this.customVars && this.customVars.documentation.models)) return;

    this.cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

    // Add model resources
    const models = this.customVars.documentation.models.map(this.createCfModel)
      .reduce((modelObj, model) => {
        modelObj[`${model.Properties.Name}Model`] = model;
        return modelObj;
      }, {});
    Object.assign(this.cfTemplate.Resources, models);

    // Add models to method resources
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName);
      func.events.forEach(this.updateCfTemplateFromHttp.bind(this));
    });
  }

  static _getDocumentationProperties(def) {
    const docProperties = new Map();
    ServerlessAwsModels._documentationProperties.forEach((key) => {
      if (def[key]) {
        docProperties.set(key, def[key]);
      }
    });
    return docProperties;
  }

  static _mapToObj(map) {
    const returnObj = {};
    map.forEach((val, key) => {
      returnObj[key] = val;
    });

    return returnObj;
  }

  _createDocumentationPart(part, def, knownLocation) {
    const location = part.locationProps.reduce((loc, property) => {
      loc[property] = knownLocation[property] || def[property];
      return loc;
    }, {});
    location.type = part.type;

    const props = ServerlessAwsModels._getDocumentationProperties(def);
    if (props.size > 0) {
      this.documentationParts.push({
        location,
        properties: ServerlessAwsModels._mapToObj(props),
        restApiId: this.restApiId,
      });
    }

    if (part.children) {
      this.createDocumentationParts(part.children, def, location);
    }
  }

  createDocumentationPart(part, def, knownLocation) {
    if (part.isList) {
      if (!(def instanceof Array)) {
        throw new Error(`definition for type "${part.type}" is not an array`);
      }
      def.forEach((singleDef) => this._createDocumentationPart(part, singleDef, knownLocation));
    } else {
      this._createDocumentationPart(part, def, knownLocation);
    }
  }

  createDocumentationParts(parts, def, knownLocation) {
    Object.keys(parts).forEach((part) => {
      if (def[part]) {
        this.createDocumentationPart(parts[part], def[part], knownLocation);
      }
    });
  }

  _updateDocumentation() {
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
      .then(promises => Promise.all(promises));
  }

  getGlobalDocumentationParts() {
    const globalDocumentation = this.customVars.documentation || {};
    this.createDocumentationParts(ServerlessAwsModels._globalDocumentationParts, globalDocumentation, {});
  }

  getFunctionDocumentationParts() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName);
      func.events.forEach(eventTypes => {
        if (eventTypes.http && eventTypes.http.documentation) {
          const path = eventTypes.http.path;
          const method = eventTypes.http.method.toUpperCase();
          this.createDocumentationParts(ServerlessAwsModels._functionDocumentationParts, eventTypes.http, { path, method });
        }
      });
    });
  }

  _buildDocumentation(result) {
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

  afterDeploy() {
    if (!this.customVars.documentation || !this.customVars.documentation.version) return;
    const stackName = this.serverless.providers.aws.naming.getStackName(this.options.stage);
    this.serverless.providers.aws.request('CloudFormation', 'describeStacks', { StackName: stackName },
      this.options.stage,
      this.options.region
    ).then(this._buildDocumentation.bind(this));
  }

}

ServerlessAwsModels._documentationProperties = ['description'];

ServerlessAwsModels._globalDocumentationParts = require('./globalDocumentationParts.json');
ServerlessAwsModels._functionDocumentationParts = require('./functionDocumentationParts.json');

module.exports = ServerlessAwsModels;
