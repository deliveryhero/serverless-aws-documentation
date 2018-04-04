'use strict';

function replaceModelRefs(restApiId, cfModel) {
    if (!cfModel.Properties || !cfModel.Properties.Schema || Object.keys(cfModel.Properties.Schema).length == 0) {
      return cfModel;
    }

    function replaceRefs(obj) {
        for (let key of Object.keys(obj)) {
            if (key === '$ref') {
                let match;
                if (match = /{{model:\s*([\-\w]+)}}/.exec(obj[key])) {
                    obj[key] = {
                        'Fn::Join': [
                            '/',
                            [
                                'https://apigateway.amazonaws.com/restapis',
                                restApiId,
                                'models',
                                match[1]
                            ]
                        ]
                    };
                    if (!cfModel.DependsOn) {
                        cfModel.DependsOn = new Set();
                    }
                    cfModel.DependsOn.add(match[1]+'Model');
                }
            } else if (typeof obj[key] === 'object') {
                replaceRefs(obj[key]);
            }
        }
    }

    replaceRefs(cfModel.Properties.Schema);
    if (cfModel.DependsOn) {
        cfModel.DependsOn = Array.from(cfModel.DependsOn);
    }
    return cfModel;
}

module.exports = {
  createCfModel: function createCfModel(restApiId) {
    return function(model) {
      return replaceModelRefs(restApiId,
        {
          Type: 'AWS::ApiGateway::Model',
          Properties: {
            RestApiId: restApiId,
            ContentType: model.contentType,
            Name: model.name,
            Schema: model.schema || {},
          },
        }
      );
    }
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
        const statusCode = response.statusCode.toString();
        let _response = resource.Properties.MethodResponses
          .find(originalResponse => originalResponse.StatusCode.toString() === statusCode);

        if (!_response) {
          _response = {
            StatusCode: statusCode,
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
  }

};
