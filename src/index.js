'use strict';
const documentation = require('./documentation');
const models = require('./models');
const fs = require('fs');
const downloadDocumentation = require('./downloadDocumentation');

class ServerlessAWSDocumentation {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws';
    this.fs = fs;

    Object.assign(this, models);
    Object.assign(this, documentation());
    Object.assign(this, downloadDocumentation);

    this.customVars = this.serverless.variables.service.custom;
    const naming = this.serverless.providers.aws.naming;
    this.getMethodLogicalId = naming.getMethodLogicalId.bind(naming);
    this.normalizePath = naming.normalizePath.bind(naming);

    this._beforeDeploy = this.beforeDeploy.bind(this)
    this._afterDeploy = this.afterDeploy.bind(this)
    this._download = downloadDocumentation.downloadDocumentation.bind(this)

    this.hooks = {
      'before:package:finalize': this._beforeDeploy,
      'after:deploy:deploy': this._afterDeploy,
      'downloadDocumentation:downloadDocumentation': this._download
    };

    this.documentationParts = [];

    this.commands = {
        downloadDocumentation: {
            usage: 'Download API Gateway documentation from AWS',
            lifecycleEvents: [
              'downloadDocumentation',
            ],
            options: {
                outputFileName: {
                    required: true,
                },
            },
        }
    };
  }

  beforeDeploy() {
    if (!(this.customVars && this.customVars.documentation)) return;

    this.cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

    // The default rest API reference
    let restApiId = {
      Ref: 'ApiGatewayRestApi',
    };

    // Use the provider API gateway if one has been provided.
    if (this.serverless.service.provider.apiGateway && this.serverless.service.provider.apiGateway.restApiId) {
      restApiId = this.serverless.service.provider.apiGateway.restApiId
    }

    if (this.customVars.documentation.models) {
      const cfModelCreator = this.createCfModel(restApiId);

      // Add model resources
      const models = this.customVars.documentation.models.map(cfModelCreator)
        .reduce((modelObj, model) => {
          modelObj[`${model.Properties.Name}Model`] = model;
          return modelObj;
        }, {});
      Object.assign(this.cfTemplate.Resources, models);
    }

    // Add models to method resources
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName);
      func.events.forEach(this.updateCfTemplateFromHttp.bind(this));
    });

    // Add models
    this.cfTemplate.Outputs.AwsDocApiId = {
      Description: 'API ID',
      Value: restApiId,
    };
  }

  afterDeploy() {
    if (!this.customVars.documentation) return;
    const stackName = this.serverless.providers.aws.naming.getStackName(this.options.stage);
    return this.serverless.providers.aws.request('CloudFormation', 'describeStacks', { StackName: stackName },
      this.options.stage,
      this.options.region
    ).then(this._buildDocumentation.bind(this))
    .catch(err => {
      if (err === 'documentation version already exists, skipping upload') {
        return Promise.resolve();
      }

      return Promise.reject(err);
    });
  }

}

module.exports = ServerlessAWSDocumentation;
