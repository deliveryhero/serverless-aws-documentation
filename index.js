'use strict';

class ServerlessModelPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws'

    // this.commands = {
    //   deploy: {
    //     lifecycleEvents: [
    //       'resources',
    //       'functions',
    //     ]
    //   }
    // };

    this.hooks = {
      'before:deploy:deploy': this.beforeDeployFunctions.bind(this),
    };
  }

  beforeDeployFunctions() {
    let models;
    if (this.serverless.variables.service.custom) {
      models = this.serverless.variables.service.custom.models;
    }

    const provider = this.serverless.service.provider;

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName)
      // console.log('function', functionName);
      // func.events.forEach(eventTypes => {
      //   console.log(eventTypes);
      // });
    });

    const cfTemplate = provider.compiledCloudFormationTemplate;
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
            Schema: models[modelName].schema,
          },
        };
        cfTemplate.Resources[modelName + 'Model'] = model;
      }
    }

    // console.log('res', provider.compiledCloudFormationTemplate);

  }

}

module.exports = ServerlessModelPlugin;
