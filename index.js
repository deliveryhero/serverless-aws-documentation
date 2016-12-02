'use strict';

class ServerlessAwsModels {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws'

    this._beforeDeployFunctions = this.beforeDeployFunctions.bind(this)

    this.hooks = {
      'before:deploy:deploy': this._beforeDeployFunctions,
    };
  }

  addModels(resources, models, modelName) {
    const model = {
      Type: 'AWS::ApiGateway::Model',
      Properties: {
        RestApiId: {
          Ref: 'ApiGatewayRestApi',
        },
        ContentType: models[modelName].ContentType,
        Name: modelName,
        Schema: models[modelName].Schema,
      },
    };
    resources[`${modelName}Model`] = model;
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
        this.addModelDependencies(response.ResponseModels, resource);
        resource.Properties.MethodResponses.push(response);
      });
    }
  }

  addRequestModels(resource, httpEvt) {
    if (httpEvt.requestModels) {
      this.addModelDependencies(httpEvt.requestModels, resource);
      resource.Properties.RequestModels = httpEvt.requestModels;
    }
  }

  beforeDeployFunctions() {
    const naming = this.serverless.providers.aws.naming;
    const getMethodLogicalId = naming.getMethodLogicalId.bind(naming);
    const normalizePath = naming.normalizePath.bind(naming);
    const customVars = this.serverless.variables.service.custom;

    if (!(customVars && customVars.models)) {
      return;
    }

    const provider = this.serverless.service.provider;
    const cfTemplate = provider.compiledCloudFormationTemplate;

    // Add model resources
    Object.keys(customVars.models).forEach(modelName => {
      this.addModels(cfTemplate.Resources, customVars.models, modelName);
    });

    // Add models to method resources
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName);
      func.events.forEach(eventTypes => {
        if (eventTypes.http) {
          const resourceName = normalizePath(eventTypes.http.path);
          const methodLogicalId = getMethodLogicalId(resourceName, eventTypes.http.method);
          const resource = cfTemplate.Resources[methodLogicalId];
          resource.DependsOn = new Set();
          this.addMethodResponses(resource, eventTypes.http);
          this.addRequestModels(resource, eventTypes.http);
          resource.DependsOn = Array.from(resource.DependsOn);
          if (resource.DependsOn.length === 0) {
            delete resource.DependsOn;
          }
        }
      });
    });
  }

}

module.exports = ServerlessAwsModels;
