
ServerlessAwsModels = require('./index.js');

describe('ServerlessAwsModels', function () {
  beforeEach(function () {
    this.baseExpectedTemplate = {
      Resources: {
        ExistingResource: {
          with: 'configuration',
        },
        TestModelModel: {
          Type: 'AWS::ApiGateway::Model',
          Properties: {
            RestApiId: {
              Ref: 'ApiGatewayRestApi',
            },
            ContentType: 'application/json',
            Name: 'TestModel',
            Schema: 'some complex schema',
          },
        },
        OtherModelModel: {
          Type: 'AWS::ApiGateway::Model',
          Properties: {
            RestApiId: {
              Ref: 'ApiGatewayRestApi',
            },
            ContentType: 'application/json',
            Name: 'OtherModel',
            Schema: 'some even more complex schema',
          },
        },
      },
    };

    this.serverlessMock = {
      providers: {
        aws: {
          naming: jasmine.createSpyObj(['getMethodLogicalId', 'normalizePath']),
        },
      },
      service: {
        _functions: {},
        _functionNames: [],
        provider: {
          compiledCloudFormationTemplate: {
            Resources: {
              ExistingResource: {
                with: 'configuration',
              },
            }
          }
        },
        getFunction: jasmine.createSpy('getFunction').and.callFake((functionName) => {
          return this.serverlessMock.service._functions[functionName];
        }),
        getAllFunctions: jasmine.createSpy('getAllFunctions').and.callFake(() => {
          return this.serverlessMock.service._functionNames;
        }),
      },
      variables: {
        service: {
          custom: {
            models: {
              TestModel: {
                ContentType: 'application/json',
                Schema: 'some complex schema',
              },
              OtherModel: {
                ContentType: 'application/json',
                Schema: 'some even more complex schema',
              },
            },
          }
        },
      },
    };

    this.serverlessMock.providers.aws.naming.getMethodLogicalId.and.callFake((resourcename, method) => {
      return `${resourcename}_${method}`;
    });

    this.serverlessMock.providers.aws.naming.normalizePath.and.callFake((path) => {
      return path.replace(/\//g, '');
    });

    this.optionsMock = {};

    this.plugin = new ServerlessAwsModels(this.serverlessMock, this.optionsMock);
  });

  it('should init', function () {
    delete this.serverlessMock.variables.service.custom;

    expect(this.plugin.provider).toBe('aws');
    expect(this.plugin.serverless).toBe(this.serverlessMock);
    expect(this.plugin.options).toBe(this.optionsMock);

    expect(this.plugin.hooks).toEqual({
      'before:deploy:deploy': this.plugin._beforeDeployFunctions,
    });
  });

  it('shouldn\'t do anything if there are no models in custom variables', function () {
    delete this.serverlessMock.variables.service.custom;
    this.plugin.beforeDeployFunctions();
    expect(this.serverlessMock.service.getAllFunctions).not.toHaveBeenCalled();
  });

  it('should add models but not add them to http events', function () {
    this.plugin.beforeDeployFunctions();
    expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual(this.baseExpectedTemplate);
  });

  it('should not do anything if a function has no http ApiGateway trigger', function () {
    this.serverlessMock.variables.service.custom.models = {};
    this.serverlessMock.service._functionNames = ['test', 'blub'];
    this.serverlessMock.service._functions = {
      test: {
        events: [{
          sns: {},
        }],
      },
      blub: {
        events: [{
          schedule: {},
        }],
      }
    };
    this.plugin.beforeDeployFunctions();
    expect(this.serverlessMock.service.getAllFunctions).toHaveBeenCalledTimes(1);
    expect(this.serverlessMock.service.getFunction).toHaveBeenCalledTimes(2);
    expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
      Resources: {
        ExistingResource: {
          with: 'configuration',
        },
      },
    });
  });

  it('should only add response methods to ApiGateway methods', function () {
    this.serverlessMock.variables.service.custom.models = {};
    this.serverlessMock.service._functionNames = ['test', 'blub'];
    this.serverlessMock.service._functions = {
      test: {
        events: [{
          http: {
            path: 'some/path',
            method: 'post',
            cors: true,
            private: true,
            methodResponses: [
              {
                StatusCode: 200,
                ResponseModels: {
                  'application/json': 'CreateResponse',
                },
              },
              {
                StatusCode: 400,
                ResponseModels: {
                  'application/json': 'ErrorResponse'
                },
              },
              {
                StatusCode: 404,
                ResponseModels: {
                  'application/json': 'ErrorResponse'
                },
              },
            ],
          },
        }],
      },
      blub: {
        events: [{
          http: {
            path: 'some/other/path',
            method: 'get',
            cors: true,
            private: true,
            methodResponses: [
              {
                StatusCode: 204,
                ResponseModels: {
                  'application/json': 'CrazyResponse',
                },
              },
            ],
          },
        }],
      },
    };

    const resources = this.serverlessMock.service.provider.compiledCloudFormationTemplate.Resources;
    resources.someotherpath_get = {
      some: 'other_configuration',
      Properties: {},
    };
    resources.somepath_post = {
      some: 'configuration',
      Properties: {},
    };

    this.plugin.beforeDeployFunctions();

    expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
      Resources: {
        ExistingResource: {
          with: 'configuration',
        },
        somepath_post: {
          some: 'configuration',
          DependsOn: ['CreateResponseModel', 'ErrorResponseModel'],
          Properties: {
            MethodResponses: [{
              StatusCode: 200,
              ResponseModels: {
                'application/json': 'CreateResponse',
              },
            },
            {
              StatusCode: 400,
              ResponseModels: {
                'application/json': 'ErrorResponse'
              },
            },
            {
              StatusCode: 404,
              ResponseModels: {
                'application/json': 'ErrorResponse'
              },
            }],
          },
        },
        someotherpath_get: {
          some: 'other_configuration',
          DependsOn: ['CrazyResponseModel'],
          Properties: {
            MethodResponses: [{
              StatusCode: 204,
              ResponseModels: {
                'application/json': 'CrazyResponse',
              },
            }],
          }
        },
      },
    });
  });

  it('should only add request models to ApiGateway methods', function () {
    this.serverlessMock.variables.service.custom.models = {};
    this.serverlessMock.service._functionNames = ['test', 'blub'];
    this.serverlessMock.service._functions = {
      test: {
        events: [{
          http: {
            path: 'some/path',
            method: 'post',
            cors: true,
            private: true,
            requestModels: {
              'application/json': 'CreateRequest',
              'application/xml': 'CreateRequestXml',
            },
          },
        }],
      },
      blub: {
        events: [{
          http: {
            path: 'some/other/path',
            method: 'get',
            cors: true,
            private: true,
            requestModels: {
              'application/json': 'GetRequest',
            },
          },
        }],
      },
    };

    const resources = this.serverlessMock.service.provider.compiledCloudFormationTemplate.Resources;
    resources.someotherpath_get = {
      some: 'other_configuration',
      Properties: {},
    };
    resources.somepath_post = {
      some: 'configuration',
      Properties: {},
    };

    this.plugin.beforeDeployFunctions();

    expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
      Resources: {
        ExistingResource: {
          with: 'configuration',
        },
        somepath_post: {
          some: 'configuration',
          DependsOn: ['CreateRequestModel', 'CreateRequestXmlModel'],
          Properties: {
            RequestModels: {
              'application/json': 'CreateRequest',
              'application/xml': 'CreateRequestXml',
            },
          },
        },
        someotherpath_get: {
          some: 'other_configuration',
          DependsOn: ['GetRequestModel'],
          Properties: {
            RequestModels: {
              'application/json': 'GetRequest',
            },
          }
        },
      },
    });
  });

  it('should add response methods and request models to ApiGateway methods', function () {
    this.serverlessMock.variables.service.custom.models = {};
    this.serverlessMock.service._functionNames = ['test', 'blub'];
    this.serverlessMock.service._functions = {
      test: {
        events: [{
          http: {
            path: 'some/path',
            method: 'post',
            cors: true,
            private: true,
            requestModels: {
              'application/json': 'CreateResponse',
              'application/xml': 'CreateRequestXml',
            },
            methodResponses: [
              {
                StatusCode: 200,
                ResponseModels: {
                  'application/json': 'CreateResponse',
                },
              },
              {
                StatusCode: 400,
                ResponseModels: {
                  'application/json': 'ErrorResponse'
                },
              },
            ],
          },
        }],
      },
      blub: {
        events: [{
          http: {
            path: 'some/other/path',
            method: 'get',
            cors: true,
            private: true,
            methodResponses: [
              {
                StatusCode: 204,
                ResponseModels: {
                  'application/json': 'CrazyResponse',
                },
              },
            ],
          },
        }],
      },
    };

    const resources = this.serverlessMock.service.provider.compiledCloudFormationTemplate.Resources;
    resources.someotherpath_get = {
      some: 'other_configuration',
      Properties: {},
    };
    resources.somepath_post = {
      some: 'configuration',
      Properties: {},
    };

    this.plugin.beforeDeployFunctions();

    expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
      Resources: {
        ExistingResource: {
          with: 'configuration',
        },
        somepath_post: {
          some: 'configuration',
          DependsOn: ['CreateResponseModel', 'ErrorResponseModel', 'CreateRequestXmlModel'],
          Properties: {
            RequestModels: {
              'application/json': 'CreateResponse',
              'application/xml': 'CreateRequestXml',
            },
            MethodResponses: [{
              StatusCode: 200,
              ResponseModels: {
                'application/json': 'CreateResponse',
              },
            },
            {
              StatusCode: 400,
              ResponseModels: {
                'application/json': 'ErrorResponse'
              },
            }],
          },
        },
        someotherpath_get: {
          some: 'other_configuration',
          DependsOn: ['CrazyResponseModel'],
          Properties: {
            MethodResponses: [{
              StatusCode: 204,
              ResponseModels: {
                'application/json': 'CrazyResponse',
              },
            }],
          },
        },
      },
    });
  });

  it('should not add any models to ApiGateway methods when http event is there but no models attached', function () {
    this.serverlessMock.variables.service.custom.models = {};
    this.serverlessMock.service._functionNames = ['test', 'blub'];
    this.serverlessMock.service._functions = {
      test: {
        events: [{
          http: {
            path: 'some/path',
            method: 'post',
            cors: true,
            private: true,
          },
        }],
      },
      blub: {
        events: [{
          http: {
            path: 'some/other/path',
            method: 'get',
            cors: true,
            private: true,
          },
        }],
      },
    };

    const resources = this.serverlessMock.service.provider.compiledCloudFormationTemplate.Resources;
    resources.someotherpath_get = {
      some: 'other_configuration',
      Properties: {},
    };
    resources.somepath_post = {
      some: 'configuration',
      Properties: {},
    };

    this.plugin.beforeDeployFunctions();

    expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
      Resources: {
        ExistingResource: {
          with: 'configuration',
        },
        somepath_post: {
          some: 'configuration',
          Properties: {},
        },
        someotherpath_get: {
          some: 'other_configuration',
          Properties: {},
        },
      },
    });
  });
});
