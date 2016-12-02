'use strict';

class ServerlessModelPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws'

    this.hooks = {
      'before:deploy:deploy': this.beforeDeployFunctions.bind(this),
    };
  }

  beforeDeployFunctions() {

    const naming = this.serverless.providers.aws.naming;
    const getMethodLogicalId = naming.getMethodLogicalId.bind(naming);
    const normalizePath = naming.normalizePath.bind(naming);

    let models;
    if (this.serverless.variables.service.custom) {
      models = this.serverless.variables.service.custom.models;
    }

    const provider = this.serverless.service.provider;
    const cfTemplate = provider.compiledCloudFormationTemplate;

    // Add model resources
    for (const modelName in models) {
      if (models.hasOwnProperty(modelName)) {
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
        cfTemplate.Resources[modelName + 'Model'] = model;
      }
    }

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName)
      func.events.forEach(eventTypes => {
        if (eventTypes.http && eventTypes.http.methodResponses) {
          const methodResponses = eventTypes.http.methodResponses;
          const resourceName = normalizePath(eventTypes.http.path);
          const methodLogicalId = getMethodLogicalId(resourceName, eventTypes.http.method);
          const resource = cfTemplate.Resources[methodLogicalId];
          resource.Properties.MethodResponses = [];
          methodResponses.forEach(response => {
            const ResponseModels = response.Models;
            const StatusCode = response.StatusCode;
            resource.Properties.MethodResponses.push({
              ResponseModels,
              StatusCode,
            });
          });
        }
      });
    });


    // console.log('############');
    // console.log(this.serverless.providers.aws);

    // console.log('res', provider.compiledCloudFormationTemplate.Resources);

  }

}

module.exports = ServerlessModelPlugin;
