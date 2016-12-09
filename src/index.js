'use strict';
const documentation = require('./documentation');

class ServerlessAwsModels {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws'

    Object.assign(this, documentation);

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

  afterDeploy() {
    if (!this.customVars.documentation || !this.customVars.documentation.version) return;
    const stackName = this.serverless.providers.aws.naming.getStackName(this.options.stage);
    this.serverless.providers.aws.request('CloudFormation', 'describeStacks', { StackName: stackName },
      this.options.stage,
      this.options.region
    ).then(this._buildDocumentation.bind(this));
  }

}

module.exports = ServerlessAwsModels;
