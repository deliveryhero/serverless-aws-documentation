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

    const resources = this.serverless.service.provider;

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName)
      // console.log('function', functionName);
      // func.events.forEach(eventTypes => {
      //   console.log(eventTypes);
      // });
    });
    // console.log('vvvvvvvv');
    // console.log('res', resources.compiledCloudFormationTemplate);
  }

}

module.exports = ServerlessModelPlugin;
