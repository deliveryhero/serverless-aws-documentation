'use strict';

module.exports = {
  createCfModel: function createCfModel(model) {
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
  },

  addModelDependencies: function addModelDependencies(models, resource) {
    Object.keys(models).forEach(contentType => {
      resource.DependsOn.add(`${models[contentType]}Model`);
    });
  },

  addMethodResponses: function addMethodResponses(resource, documentation) {
    if (documentation.methodResponses) {
      resource.Properties.MethodResponses.forEach(originalResponse => {
        documentation.methodResponses.forEach(response => {
          if(originalResponse.StatusCode === response.statusCode) {
            originalResponse.ResponseModels = response.responseModels;
          }
        });
      });
    }
  },

  addRequestModels: function addRequestModels(resource, documentation) {
    if (documentation.requestModels && Object.keys(documentation.requestModels).length > 0) {
      this.addModelDependencies(documentation.requestModels, resource);
      resource.Properties.RequestModels = documentation.requestModels;
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
      resource.DependsOn = Array.from(resource.DependsOn);
      if (resource.DependsOn.length === 0) {
        delete resource.DependsOn;
      }
    }
  },
};
