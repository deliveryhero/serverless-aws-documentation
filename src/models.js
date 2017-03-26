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
        Schema: model.schema || {},
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
      if (!resource.Properties.MethodResponses) {
        resource.Properties.MethodResponses = [];
      }

      documentation.methodResponses.forEach(response => {
        let _response = resource.Properties.MethodResponses
          .find(originalResponse => originalResponse.StatusCode === response.statusCode);

        if (!_response) {
          _response = {
            StatusCode: response.statusCode,
          };

          if (response.responseHeaders) {
            const methodResponseHeaders = {};
            response.responseHeaders.forEach(header => {
              methodResponseHeaders[`method.response.header.${header.name}`] = true
            });
            _response.ResponseParameters = methodResponseHeaders;
          }

          resource.Properties.MethodResponses.push(_response);
        }

        if (response.responseModels) {
          _response.ResponseModels = response.responseModels;
          this.addModelDependencies(_response.ResponseModels, resource);
        }
      });
    }
  },

  addRequestModels: function addRequestModels(resource, documentation) {
    if (documentation.requestModels && Object.keys(documentation.requestModels).length > 0) {
      this.addModelDependencies(documentation.requestModels, resource);
      resource.Properties.RequestModels = documentation.requestModels;
    }
  },

  addRequestHeaders: function addRequestHeaders(resource, documentation) {
    if (documentation.requestHeaders && Object.keys(documentation.requestHeaders).length > 0) {
      //this.addModelDependencies(documentation.requestModels, resource);
      if (!resource.Properties.RequestParameters) {
        resource.Properties.RequestParameters = {};
      }
      documentation.requestHeaders.forEach(function(rh){
        var source = 'method.request.header.'+rh.name;
        resource.Properties.RequestParameters[source] = rh.required || false;
      })
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
      this.addRequestHeaders(resource, eventTypes.http.documentation);
      resource.DependsOn = Array.from(resource.DependsOn);
      if (resource.DependsOn.length === 0) {
        delete resource.DependsOn;
      }
    }
  },
};
