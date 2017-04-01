const proxyquire = require('proxyquire');

describe('ServerlessAWSDocumentation', function () {
  const awsMock = {
    APIGateway: {}
  };

  const ServerlessAWSDocumentation = proxyquire('./index.js', {
    './aws.js': () => awsMock,
  });

  beforeEach(function () {
    this.serverlessMock = {
      providers: {
        aws: {
          request: jasmine.createSpy('aws request'),
          naming: jasmine.createSpyObj(['getStackName', 'getMethodLogicalId', 'normalizePath']),
          getCredentials: jasmine.createSpy('aws get credentials'),
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
            },
            Outputs: {},
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
            documentation: {
              version: '1',
              models: [{
                name: 'TestModel',
                contentType: 'application/json',
                schema: 'some complex schema',
                description: 'the test model schema',
              }, {
                name: 'OtherModel',
                contentType: 'application/json',
                schema: 'some even more complex schema',
                description: 'the other test model schema',
              }],
            },
          }
        }
      },
    };

    this.serverlessMock.providers.aws.naming.getMethodLogicalId.and.callFake((resourcename, method) => {
      return `${resourcename}_${method}`;
    });

    this.serverlessMock.providers.aws.naming.normalizePath.and.callFake((path) => {
      return path.replace(/\//g, '');
    });

    this.optionsMock = {};

    this.plugin = new ServerlessAWSDocumentation(this.serverlessMock, this.optionsMock);
  });

  describe('before deploy', function () {

    it('should init', function () {
      delete this.serverlessMock.variables.service.custom;

      expect(this.plugin.provider).toBe('aws');
      expect(this.plugin.serverless).toBe(this.serverlessMock);
      expect(this.plugin.options).toBe(this.optionsMock);

      expect(this.plugin.hooks).toEqual({
        'before:deploy:deploy': this.plugin._beforeDeploy,
        'after:deploy:deploy': this.plugin._afterDeploy,
      });
    });

    it('shouldn\'t do anything if there are no custom variables', function () {
      delete this.plugin.customVars;
      this.plugin.beforeDeploy();
      expect(this.serverlessMock.service.getAllFunctions).not.toHaveBeenCalled();
    });

    it('shouldn\'t do anything if there is no documentation part in custom variables', function () {
      delete this.plugin.customVars.documentation;
      this.plugin.beforeDeploy();
      expect(this.serverlessMock.service.getAllFunctions).not.toHaveBeenCalled();
    });

    it('should work even if there are no models in custom variables', function () {
      delete this.plugin.customVars.documentation.models;
      this.plugin.beforeDeploy();
      expect(this.serverlessMock.service.getAllFunctions).toHaveBeenCalled();
      expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
        Resources: {
          ExistingResource: {
            with: 'configuration',
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should add models but not add them to http events', function () {
      // also add a model with no schema
      this.serverlessMock.variables.service.custom.documentation.models.push({
        name: 'NoSchemaModel',
        contentType: 'application/json',
        description: 'the other test model schema',
      });

      this.plugin.beforeDeploy();
      expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
        Resources: {
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
          NoSchemaModelModel: {
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              ContentType: 'application/json',
              Name: 'NoSchemaModel',
              Schema: {},
            },
          },
          ExistingResource: {
            with: 'configuration',
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should not do anything if a function has no http ApiGateway trigger', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
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
      this.plugin.beforeDeploy();
      expect(this.serverlessMock.service.getAllFunctions).toHaveBeenCalledTimes(1);
      expect(this.serverlessMock.service.getFunction).toHaveBeenCalledTimes(2);
      expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
        Resources: {
          ExistingResource: {
            with: 'configuration',
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should only add response methods to ApiGateway methods', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test', 'blub'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              cors: true,
              private: true,
              documentation: {
                methodResponses: [
                  {
                    statusCode: 200,
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                  },
                  {
                    statusCode: 400,
                    responseModels: {
                      'application/json': 'ErrorResponse'
                    },
                  },
                  {
                    statusCode: 404,
                    responseModels: {
                      'application/json': 'ErrorResponse'
                    },
                  },
                ],
              }
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
              documentation: {
                methodResponses: [
                  {
                    statusCode: 204,
                    responseModels: {
                      'application/json': 'CrazyResponse',
                    },
                  },
                ],
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

      this.plugin.beforeDeploy();

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
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should only add response methods with existing MethodResponses to ApiGateway methods', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              cors: true,
              private: true,
              documentation: {
                methodResponses: [
                  {
                    statusCode: 200,
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                  },
                  {
                    statusCode: 404,
                    responseModels: {
                      'application/json': 'ErrorResponse'
                    },
                  },
                ],
              }
            },
          }],
        },
      };

      const resources = this.serverlessMock.service.provider.compiledCloudFormationTemplate.Resources;
      resources.somepath_post = {
        some: 'configuration',
        Properties: {
          MethodResponses: [{
            StatusCode: 200,
            id: 9001,
          },
          {
            StatusCode: 404,
            id: 9002,
          }],
        },
      };

      this.plugin.beforeDeploy();

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
                id: 9001,
                ResponseModels: {
                  'application/json': 'CreateResponse',
                },
              },
              {
                StatusCode: 404,
                id: 9002,
                ResponseModels: {
                  'application/json': 'ErrorResponse'
                },
              }],
            },
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should only add response methods with existing and new MethodResponses to ApiGateway methods', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              cors: true,
              private: true,
              documentation: {
                methodResponses: [
                  {
                    statusCode: 200,
                    should: 'not be included',
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                  },
                  {
                    statusCode: 404,
                    should: 'not be included',
                    responseModels: {
                      'application/json': 'ErrorResponse'
                    },
                  },
                ],
              }
            },
          }],
        },
      };

      const resources = this.serverlessMock.service.provider.compiledCloudFormationTemplate.Resources;
      resources.somepath_post = {
        some: 'configuration',
        Properties: {
          MethodResponses: [{
            StatusCode: 200,
            id: 9001,
          },],
        },
      };

      this.plugin.beforeDeploy();

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
                id: 9001,
                ResponseModels: {
                  'application/json': 'CreateResponse',
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
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should only add response methods with existing empty MethodResponses to ApiGateway methods', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              cors: true,
              private: true,
              documentation: {
                methodResponses: [
                  {
                    statusCode: 200,
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                  },
                  {
                    statusCode: 404,
                    responseModels: {
                      'application/json': 'ErrorResponse'
                    },
                  },
                ],
              }
            },
          }],
        },
      };

      const resources = this.serverlessMock.service.provider.compiledCloudFormationTemplate.Resources;
      resources.somepath_post = {
        some: 'configuration',
        Properties: {
          MethodResponses: [],
        },
      };

      this.plugin.beforeDeploy();

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
                StatusCode: 404,
                ResponseModels: {
                  'application/json': 'ErrorResponse'
                },
              }],
            },
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });


    it('should only add response methods with response headers to ApiGateway methods', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test', 'blub'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              cors: true,
              private: true,
              documentation: {
                methodResponses: [
                  {
                    statusCode: 200,
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                    responseHeaders: [{
                      name: 'x-header',
                      description: 'THE header',
                    }, {
                      name: 'x-other-header',
                      description: 'THE other header',
                    }],
                  },
                  {
                    statusCode: 400,
                    responseModels: {
                      'application/json': 'ErrorResponse'
                    },
                    responseHeaders: [{
                      name: 'x-header',
                      description: 'THE header',
                    }],
                  },
                  {
                    statusCode: 404,
                    responseModels: {
                      'application/json': 'ErrorResponse'
                    },
                    responseHeaders: [{
                      name: 'x-header',
                      description: 'THE header',
                    }],
                  },
                ],
              }
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
              documentation: {
                methodResponses: [
                  {
                    statusCode: 204,
                    responseModels: {
                      'application/json': 'CrazyResponse',
                    },
                    responseHeaders: [{
                      name: 'x-header',
                      description: 'THE header',
                    }, {
                      name: 'x-other-header',
                      description: 'THE other header',
                    }],
                  },
                ],
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

      this.plugin.beforeDeploy();

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
                ResponseParameters: {
                  'method.response.header.x-header': true,
                  'method.response.header.x-other-header': true,
                },
              },
              {
                StatusCode: 400,
                ResponseModels: {
                  'application/json': 'ErrorResponse'
                },
                ResponseParameters: {
                  'method.response.header.x-header': true,
                },
              },
              {
                StatusCode: 404,
                ResponseModels: {
                  'application/json': 'ErrorResponse'
                },
                ResponseParameters: {
                  'method.response.header.x-header': true,
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
                ResponseParameters: {
                  'method.response.header.x-header': true,
                  'method.response.header.x-other-header': true,
                },
              }],
            }
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should only add request models to ApiGateway methods', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test', 'blub'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              cors: true,
              private: true,
              documentation: {
                requestModels: {
                  'application/json': 'CreateRequest',
                  'application/xml': 'CreateRequestXml',
                },
              }
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
              documentation: {
                requestModels: {
                  'application/json': 'GetRequest',
                },
              }
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

      this.plugin.beforeDeploy();

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
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should only add documentation but no request models to ApiGateway methods', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test', 'blub'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              cors: true,
              private: true,
              documentation: {
                requestModels: {},
              }
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
              documentation: {}
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

      this.plugin.beforeDeploy();

      expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
        Resources: {
          ExistingResource: {
            with: 'configuration',
          },
          somepath_post: {
            some: 'configuration',
            Properties: {
              // RequestModels: {
              //   'application/json': 'CreateRequest',
              //   'application/xml': 'CreateRequestXml',
              // },
            },
          },
          someotherpath_get: {
            some: 'other_configuration',
            Properties: {
              // RequestModels: {
              //   'application/json': 'GetRequest',
              // },
            }
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should add response methods and request models to ApiGateway methods', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test', 'blub'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              cors: true,
              private: true,
              documentation: {
                requestModels: {
                  'application/json': 'CreateResponse',
                  'application/xml': 'CreateRequestXml',
                },
                methodResponses: [
                  {
                    statusCode: 200,
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                  },
                  {
                    statusCode: 400,
                    responseModels: {
                      'application/json': 'ErrorResponse'
                    },
                  },
                ],
              }
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
              documentation: {
                methodResponses: [
                  {
                    statusCode: 204,
                    responseModels: {
                      'application/json': 'CrazyResponse',
                    },
                  },
                ],
              }
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

      this.plugin.beforeDeploy();

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
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });

    it('should not add any models to ApiGateway methods when http event is there but no models attached', function () {
      this.serverlessMock.variables.service.custom.documentation.models = [];
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

      this.plugin.beforeDeploy();

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
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });
    it('should add request headers', function() {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test', 'blub'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              documentation: {
                requestHeaders: [
                  {
                    name: 'x-my-header',
                    description: 'x-my-header description'
                  }
                ]
              }
            },
          }],
        },
        blub: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get'
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

      this.plugin.beforeDeploy();

      expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
        Resources: {
          ExistingResource: {
            with: 'configuration',
          },
          somepath_post: {
            some: 'configuration',
            Properties: {
              RequestParameters: {
                'method.request.header.x-my-header': false
              }
            },
          },
          someotherpath_get: {
            some: 'other_configuration',
            Properties: {},
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });
    it('should add request headers with required=false by default', function() {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test', 'blub'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              documentation: {
                requestHeaders: [
                  {
                    name: 'x-my-header',
                    description: 'x-my-header description',
                    required: true
                  },
                  {
                    name: 'x-my-header2',
                    description: 'x-my-header2 description'
                  }
                ]
              }
            },
          }],
        },
        blub: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get'
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

      this.plugin.beforeDeploy();

      expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
        Resources: {
          ExistingResource: {
            with: 'configuration',
          },
          somepath_post: {
            some: 'configuration',
            Properties: {
              RequestParameters: {
                'method.request.header.x-my-header': true,
                'method.request.header.x-my-header2': false
              }
            },
          },
          someotherpath_get: {
            some: 'other_configuration',
            Properties: {},
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });
    it('should only add request headers, not modify existing', function() {
      this.serverlessMock.variables.service.custom.documentation.models = [];
      this.serverlessMock.service._functionNames = ['test', 'blub'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              documentation: {
                requestHeaders: [
                  {
                    name: 'x-my-header',
                    description: 'x-my-header description'
                  }
                ]
              }
            },
          }],
        },
        blub: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get'
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
        Properties: {
          RequestParameters: {
            'method.request.header.x-my-header': true
          }
        },
      };

      this.plugin.beforeDeploy();

      expect(this.serverlessMock.service.provider.compiledCloudFormationTemplate).toEqual({
        Resources: {
          ExistingResource: {
            with: 'configuration',
          },
          somepath_post: {
            some: 'configuration',
            Properties: {
              RequestParameters: {
                'method.request.header.x-my-header': true
              }
            },
          },
          someotherpath_get: {
            some: 'other_configuration',
            Properties: {},
          },
        },
        Outputs: {
          AwsDocApiId: {
            Description: 'API ID',
            Value: {
              Ref: 'ApiGatewayRestApi',
            },
          }
        },
      });
    });
  });

  describe('after deploy', function () {
    beforeEach(function () {
      this.apiGatewayMock = jasmine.createSpyObj([
        'getDocumentationParts',
        'deleteDocumentationPart',
        'createDocumentationPart',
        'getDocumentationVersion',
        'createDocumentationVersion',
      ])
      awsMock.APIGateway = jasmine.createSpy('API Gateway').and.returnValue(this.apiGatewayMock);
    });

    it('should not deploy documentation if there is no documentation in custom variables', function () {
      this.plugin.customVars = {};
      this.plugin.afterDeploy();
      expect(this.serverlessMock.providers.aws.request).not.toHaveBeenCalled();
    });

    it('should get stack description', function () {
      this.optionsMock.stage = 'megastage';
      this.optionsMock.region = 'hyperregion';
      this.serverlessMock.providers.aws.request.and.returnValue(new Promise(() => { }));
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');
      this.plugin.afterDeploy();
      expect(this.serverlessMock.providers.aws.request).toHaveBeenCalledWith('CloudFormation', 'describeStacks', { StackName: 'superstack' }, 'megastage', 'hyperregion');
    });

    it('should build documentation with deploying and upload to api gateway', function (done) {
      this.serverlessMock.variables.service.custom.documentation.api = {
        description: 'this is an api',
      };
      this.serverlessMock.variables.service.custom.documentation.authorizers = [{
        name: 'an-authorizer',
        description: 'this is an authorizer',
      }, {
        name: 'no-authorizer',
        description: 'this is not an authorizer',
      }];
      this.serverlessMock.variables.service.custom.documentation.resources = [{
        path: 'super/path',
        description: 'this is a super path',
      }, {
        path: 'hidden/path',
        description: 'this is a super secret hidden path',
      }];

      this.serverlessMock.service._functionNames = ['test', 'blub', 'blib', 'blab'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              documentation: {
                summary: 'hello',
                description: 'hello hello',
                unknownProperty: 'should not be displayed',
                requestBody: {
                  description: 'is it me',
                },
                requestHeaders: [{
                  name: 'x-you',
                  description: 'are looking for',
                }, {
                  name: 'x-hello',
                  description: 'again',
                }],
                methodResponses: [
                  {
                    statusCode: '200',
                    description: 'This is a good response',
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                  },
                  {
                    statusCode: '400',
                    description: 'You failed',
                  },
                  {
                    statusCode: '404',
                  },
                ],
              }
            },
          }],
        },
        blub: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get',
              documentation: {
                queryParams: [{
                  name: 'supername',
                  description: 'this is your super name',
                }, {
                  name: 'not-supername',
                  description: 'this is not your super name',
                }],
                pathParams: [{
                  name: 'id',
                  description: 'this is the id',
                }, {
                  name: 'super-id',
                  description: 'this is the secret super id',
                }],
                methodResponses: [
                  {
                    statusCode: '204',
                    description: 'super response',
                    responseBody: {
                      description: 'hiiiii',
                    },
                    responseHeaders: [{
                      name: 'x-header',
                      description: 'THE header',
                    }, {
                      name: 'x-other-header',
                      description: 'THE other header',
                    }],
                  },
                ],
              },
            },
          }],
        },
        blab: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get',
            },
          }],
        },
        blib: {
          events: [{
            sns: {
              documentation: {},
            },
          }],
        },
      };

      this.optionsMock.stage = 'megastage';
      this.optionsMock.region = 'hyperregion';
      this.serverlessMock.providers.aws.request.and.returnValue(Promise.resolve({
        Stacks: [{
          Outputs: [{
            OutputKey: 'ApiKey',
            OutputValue: 'nothing',
          }, {
            OutputKey: 'AwsDocApiId',
            OutputValue: 'superid',
          }],
        }],
      }));
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');
      this.serverlessMock.providers.aws.getCredentials.and.returnValue('awesome credentials');
      this.apiGatewayMock.getDocumentationParts.and.returnValue({
        promise: () => Promise.resolve({
          items: [{
            id: '123',
          }, {
            id: '456',
          }],
        }),
      });
      this.apiGatewayMock.deleteDocumentationPart.and.returnValue({
        promise: () => Promise.resolve(),
      });
      this.apiGatewayMock.createDocumentationPart.and.returnValue({
        promise: () => Promise.resolve(),
      });

      this.apiGatewayMock.getDocumentationVersion.and.returnValue({
        promise: () => Promise.reject(new Error('Invalid Documentation version specified')),
      });

      this.apiGatewayMock.createDocumentationVersion.and.returnValue({
        promise: () => Promise.resolve(),
      });

      this.plugin.afterDeploy();
      setTimeout(() => {
        expect(awsMock.APIGateway).toHaveBeenCalledWith('awesome credentials');
        expect(this.apiGatewayMock.getDocumentationParts).toHaveBeenCalledWith({
          restApiId: 'superid',
          limit: 9999,
        });

        // Delete documentation parts
        expect(this.apiGatewayMock.deleteDocumentationPart).toHaveBeenCalledTimes(2);
        expect(this.apiGatewayMock.deleteDocumentationPart).toHaveBeenCalledWith({
          documentationPartId: '123',
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.deleteDocumentationPart).toHaveBeenCalledWith({
          documentationPartId: '456',
          restApiId: 'superid',
        });

        // Create documentation parts
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledTimes(21);
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { type: 'API' },
          properties: JSON.stringify({ description: 'this is an api' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { type: 'AUTHORIZER', name: 'an-authorizer' },
          properties: JSON.stringify({ description: 'this is an authorizer' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { type: 'AUTHORIZER', name: 'no-authorizer' },
          properties: JSON.stringify({ description: 'this is not an authorizer' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { type: 'RESOURCE', path: 'super/path' },
          properties: JSON.stringify({ description: 'this is a super path' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { type: 'RESOURCE', path: 'hidden/path' },
          properties: JSON.stringify({ description: 'this is a super secret hidden path' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { name: 'TestModel', type: 'MODEL' },
          properties: JSON.stringify({ description: 'the test model schema' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { name: 'OtherModel', type: 'MODEL' },
          properties: JSON.stringify({ description: 'the other test model schema' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/path', method: 'POST', type: 'METHOD' },
          properties: JSON.stringify({ description: 'hello hello', summary: 'hello' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/path', method: 'POST', type: 'REQUEST_BODY' },
          properties: JSON.stringify({ description: 'is it me' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/path', method: 'POST', type: 'REQUEST_HEADER', name: 'x-you' },
          properties: JSON.stringify({ description: 'are looking for' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/path', method: 'POST', type: 'REQUEST_HEADER', name: 'x-hello' },
          properties: JSON.stringify({ description: 'again' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/path', method: 'POST', statusCode: '200', type: 'RESPONSE' },
          properties: JSON.stringify({ description: 'This is a good response' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/path', method: 'POST', statusCode: '400', type: 'RESPONSE' },
          properties: JSON.stringify({ description: 'You failed' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/other/path', method: 'GET', statusCode: '204', type: 'RESPONSE' },
          properties: JSON.stringify({ description: 'super response' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/other/path', method: 'GET', statusCode: '204', type: 'RESPONSE_BODY' },
          properties: JSON.stringify({ description: 'hiiiii' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/other/path', method: 'GET', statusCode: '204', type: 'RESPONSE_HEADER', name: 'x-header' },
          properties: JSON.stringify({ description: 'THE header' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/other/path', method: 'GET', statusCode: '204', type: 'RESPONSE_HEADER', name: 'x-other-header' },
          properties: JSON.stringify({ description: 'THE other header' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/other/path', method: 'GET', type: 'QUERY_PARAMETER', name: 'supername' },
          properties: JSON.stringify({ description: 'this is your super name' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/other/path', method: 'GET', type: 'QUERY_PARAMETER', name: 'not-supername' },
          properties: JSON.stringify({ description: 'this is not your super name' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/other/path', method: 'GET', type: 'PATH_PARAMETER', name: 'id' },
          properties: JSON.stringify({ description: 'this is the id' }),
          restApiId: 'superid',
        });
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalledWith({
          location: { path: 'some/other/path', method: 'GET', type: 'PATH_PARAMETER', name: 'super-id' },
          properties: JSON.stringify({ description: 'this is the secret super id' }),
          restApiId: 'superid',
        });
        done();
      });
    });

    it('should not deploy when documentation version is not updated', function (done) {
      spyOn(console, 'info');
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');
      this.serverlessMock.providers.aws.getCredentials.and.returnValue('awesome credentials');
      this.serverlessMock.providers.aws.request.and.returnValue(Promise.resolve({
        Stacks: [{
          Outputs: [{
            OutputKey: 'ApiId',
            OutputValue: 'superid',
          }],
        }],
      }));
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');
      this.apiGatewayMock.getDocumentationVersion.and.returnValue({
        promise: () => Promise.resolve(),
      });
      this.plugin.afterDeploy().then(() => {
        expect(this.apiGatewayMock.getDocumentationParts).not.toHaveBeenCalled();
        expect(this.apiGatewayMock.deleteDocumentationPart).not.toHaveBeenCalled();
        expect(this.apiGatewayMock.createDocumentationPart).not.toHaveBeenCalled();
        expect(console.info).toHaveBeenCalledWith('documentation version already exists, skipping upload');
        done();
      });
    });

    it('should not deploy when documentation version failed otherwise', function (done) {
      spyOn(console, 'info');
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');
      this.serverlessMock.providers.aws.getCredentials.and.returnValue('awesome credentials');
      this.serverlessMock.providers.aws.request.and.returnValue(Promise.resolve({
        Stacks: [{
          Outputs: [{
            OutputKey: 'ApiId',
            OutputValue: 'superid',
          }],
        }],
      }));
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');
      this.apiGatewayMock.getDocumentationVersion.and.returnValue({
        promise: () => Promise.reject(new Error('other error')),
      });
      this.plugin.afterDeploy().catch(() => {
        expect(this.apiGatewayMock.getDocumentationParts).not.toHaveBeenCalled();
        expect(this.apiGatewayMock.deleteDocumentationPart).not.toHaveBeenCalled();
        expect(this.apiGatewayMock.createDocumentationPart).not.toHaveBeenCalled();
        done();
      });
    });

    it('should generate documentation version when no version is there', function (done) {
      spyOn(console, 'info');

      this.serverlessMock.variables.service.custom.documentation.api = {
        description: 'this is an api',
      };
      this.serverlessMock.variables.service.custom.documentation.authorizers = [{
        name: 'an-authorizer',
        description: 'this is an authorizer',
      }, {
        name: 'no-authorizer',
        description: 'this is not an authorizer',
      }];
      this.serverlessMock.variables.service.custom.documentation.resources = [{
        path: 'super/path',
        description: 'this is a super path',
      }, {
        path: 'hidden/path',
        description: 'this is a super secret hidden path',
      }];

      this.serverlessMock.service._functionNames = ['test', 'blub', 'blib', 'blab'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              documentation: {
                summary: 'hello',
                description: 'hello hello',
                unknownProperty: 'should not be displayed',
                requestBody: {
                  description: 'is it me',
                },
                requestHeaders: [{
                  name: 'x-you',
                  description: 'are looking for',
                }, {
                  name: 'x-hello',
                  description: 'again',
                }],
                methodResponses: [
                  {
                    statusCode: '200',
                    description: 'This is a good response',
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                  },
                  {
                    statusCode: '400',
                    description: 'You failed',
                  },
                  {
                    statusCode: '404',
                  },
                ],
              }
            },
          }],
        },
        blub: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get',
              documentation: {
                queryParams: [{
                  name: 'supername',
                  description: 'this is your super name',
                }, {
                  name: 'not-supername',
                  description: 'this is not your super name',
                }],
                pathParams: [{
                  name: 'id',
                  description: 'this is the id',
                }, {
                  name: 'super-id',
                  description: 'this is the secret super id',
                }],
                methodResponses: [
                  {
                    statusCode: '204',
                    description: 'super response',
                    responseBody: {
                      description: 'hiiiii',
                    },
                    responseHeaders: [{
                      name: 'x-header',
                      description: 'THE header',
                    }, {
                      name: 'x-other-header',
                      description: 'THE other header',
                    }],
                  },
                ],
              },
            },
          }],
        },
        blab: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get',
            },
          }],
        },
        blib: {
          events: [{
            sns: {
              documentation: {},
            },
          }],
        },
      };

      spyOn(this.plugin, 'generateAutoDocumentationVersion').and.callThrough();

      this.optionsMock.stage = 'megastage';
      this.optionsMock.region = 'hyperregion';
      this.serverlessMock.providers.aws.request.and.returnValue(Promise.resolve({
        Stacks: [{
          Outputs: [{
            OutputKey: 'ApiKey',
            OutputValue: 'nothing',
          }, {
            OutputKey: 'AwsDocApiId',
            OutputValue: 'superid',
          }],
        }],
      }));

      delete this.serverlessMock.variables.service.custom.documentation.version;
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');
      this.serverlessMock.providers.aws.getCredentials.and.returnValue('awesome credentials');
      this.apiGatewayMock.getDocumentationParts.and.returnValue({
        promise: () => Promise.resolve({
          items: [{
            id: '123',
          }, {
            id: '456',
          }],
        }),
      });
      this.apiGatewayMock.deleteDocumentationPart.and.returnValue({
        promise: () => Promise.resolve(),
      });
      this.apiGatewayMock.createDocumentationPart.and.returnValue({
        promise: () => Promise.resolve(),
      });
      this.apiGatewayMock.getDocumentationVersion.and.returnValue({
        promise: () => Promise.reject(new Error('Invalid Documentation version specified')),
      });

      this.apiGatewayMock.createDocumentationVersion.and.returnValue({
        promise: () => Promise.resolve(),
      });

      this.plugin.afterDeploy().then(() => {
        expect(this.apiGatewayMock.getDocumentationParts).toHaveBeenCalled();
        expect(this.apiGatewayMock.deleteDocumentationPart).toHaveBeenCalled();
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalled();
        expect(this.apiGatewayMock.getDocumentationVersion).toHaveBeenCalledTimes(1);
        expect(this.apiGatewayMock.getDocumentationVersion).toHaveBeenCalledWith({
          restApiId: 'superid',
          documentationVersion: jasmine.any(String),
        });

        const getDocVersion = this.apiGatewayMock.getDocumentationVersion.calls.argsFor(0)[0].documentationVersion;
        expect(this.apiGatewayMock.createDocumentationVersion).toHaveBeenCalledTimes(1);
        expect(this.apiGatewayMock.createDocumentationVersion).toHaveBeenCalledWith({
          restApiId: 'superid',
          documentationVersion: getDocVersion,
          stageName: 'megastage',
        });

        expect(this.plugin.generateAutoDocumentationVersion).toHaveBeenCalledTimes(1);

        done();
      });
    });

    it('should build documentation without deploying and display parts', function (done) {
      this.optionsMock.noDeploy = true;
      spyOn(console, 'info');
      this.serverlessMock.providers.aws.request.and.returnValue(Promise.resolve({
        Stacks: [{
          Outputs: [{
            OutputKey: 'ApiId',
            OutputValue: 'superid',
          }],
        }],
      }));
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');

      this.plugin.afterDeploy().then(() => {
        expect(awsMock.APIGateway).not.toHaveBeenCalled();
        expect(this.apiGatewayMock.getDocumentationParts).not.toHaveBeenCalled();
        expect(this.apiGatewayMock.deleteDocumentationPart).not.toHaveBeenCalled();
        expect(this.apiGatewayMock.createDocumentationPart).not.toHaveBeenCalled();
        expect(console.info).toHaveBeenCalledWith('documentation parts:');
        expect(console.info).toHaveBeenCalledWith(this.plugin.documentationParts);
        done();
      });
    });

    it('should not do anything if an list documentation part is not an array', function (done) {
      spyOn(console, 'info');
      this.serverlessMock.variables.service.custom.documentation.models = {
        this: 'is wrong',
      };
      this.serverlessMock.providers.aws.request.and.returnValue(Promise.resolve({
        Stacks: [{
          Outputs: [{
            OutputKey: 'ApiId',
            OutputValue: 'superid',
          }],
        }],
      }));
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');

      this.plugin.afterDeploy().catch(() => {
        expect(console.info).toHaveBeenCalledWith('definition for type "MODEL" is not an array');
        done();
      });
    });

    it('should not do not delete any documentation parts if there are none', function (done) {
      this.serverlessMock.providers.aws.request.and.returnValue(Promise.resolve({
        Stacks: [{
          Outputs: [{
            OutputKey: 'ApiId',
            OutputValue: 'superid',
          }],
        }],
      }));
      this.serverlessMock.providers.aws.naming.getStackName.and.returnValue('superstack');

      this.apiGatewayMock.getDocumentationParts.and.returnValue({
        promise: () => Promise.resolve({
          items: [],
        }),
      });
      this.apiGatewayMock.deleteDocumentationPart.and.returnValue({
        promise: () => Promise.reject(),
      });
      this.apiGatewayMock.createDocumentationPart.and.returnValue({
        promise: () => Promise.resolve(),
      });

      this.apiGatewayMock.getDocumentationVersion.and.returnValue({
        promise: () => Promise.reject({
          message: 'Invalid Documentation version specified',
        }),
      });

      this.apiGatewayMock.createDocumentationVersion.and.returnValue({
        promise: () => Promise.resolve(),
      });

      this.plugin.afterDeploy().then(() => {
        expect(this.apiGatewayMock.getDocumentationParts).toHaveBeenCalled();
        expect(this.apiGatewayMock.deleteDocumentationPart).not.toHaveBeenCalled();
        expect(this.apiGatewayMock.createDocumentationPart).toHaveBeenCalled();
        done();
      });
    });

    it('should generate different documentation versions for different documentation content', function() {
      this.serverlessMock.variables.service.custom.documentation.api = {
        description: 'this is an api',
      };
      this.serverlessMock.variables.service.custom.documentation.authorizers = [{
        name: 'an-authorizer',
        description: 'this is an authorizer',
      }, {
        name: 'no-authorizer',
        description: 'this is not an authorizer',
      }];
      this.serverlessMock.variables.service.custom.documentation.resources = [{
        path: 'super/path',
        description: 'this is a super path',
      }, {
        path: 'hidden/path',
        description: 'this is a super secret hidden path',
      }];

      this.serverlessMock.service._functionNames = ['test', 'blub', 'blib', 'blab'];
      this.serverlessMock.service._functions = {
        test: {
          events: [{
            http: {
              path: 'some/path',
              method: 'post',
              documentation: {
                summary: 'hello',
                description: 'hello hello',
                unknownProperty: 'should not be displayed',
                requestBody: {
                  description: 'is it me',
                },
                requestHeaders: [{
                  name: 'x-you',
                  description: 'are looking for',
                }, {
                  name: 'x-hello',
                  description: 'again',
                }],
                methodResponses: [
                  {
                    statusCode: '200',
                    description: 'This is a good response',
                    responseModels: {
                      'application/json': 'CreateResponse',
                    },
                  },
                  {
                    statusCode: '400',
                    description: 'You failed',
                  },
                  {
                    statusCode: '404',
                  },
                ],
              }
            },
          }],
        },
        blub: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get',
              documentation: {
                queryParams: [{
                  name: 'supername',
                  description: 'this is your super name',
                }, {
                  name: 'not-supername',
                  description: 'this is not your super name',
                }],
                pathParams: [{
                  name: 'id',
                  description: 'this is the id',
                }, {
                  name: 'super-id',
                  description: 'this is the secret super id',
                }],
                methodResponses: [
                  {
                    statusCode: '204',
                    description: 'super response',
                    responseBody: {
                      description: 'hiiiii',
                    },
                    responseHeaders: [{
                      name: 'x-header',
                      description: 'THE header',
                    }, {
                      name: 'x-other-header',
                      description: 'THE other header',
                    }],
                  },
                ],
              },
            },
          }],
        },
        blab: {
          events: [{
            http: {
              path: 'some/other/path',
              method: 'get',
            },
          }],
        },
        blib: {
          events: [{
            sns: {
              documentation: {},
            },
          }],
        },
      };

      delete this.serverlessMock.variables.service.custom.documentation.version;

      this.plugin.generateAutoDocumentationVersion();
      const v1 = this.plugin.getDocumentationVersion();

      // change the global documentation content
      delete this.serverlessMock.variables.service.custom.documentation.api;
      this.plugin.generateAutoDocumentationVersion();
      const v2 = this.plugin.getDocumentationVersion();
      expect(v2).not.toBe(v1);

      // change the function documentation content
      this.serverlessMock.service._functions.blub.events[0].http.documentation.methodResponses[0].statusCode = '201';
      this.plugin.generateAutoDocumentationVersion();
      const v3 = this.plugin.getDocumentationVersion();
      expect(v3).not.toBe(v2);

      // add function without documentation for event, should not generate new version
      this.serverlessMock.service._functions.sup = {
        events: [{
          http: {
          },
        }],
      };

      this.plugin.generateAutoDocumentationVersion();
      const v4 = this.plugin.getDocumentationVersion();
      expect(v4).toBe(v3);
    });

  });
});
