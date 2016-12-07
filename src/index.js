'use strict';

class ServerlessAwsModels {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws'

    this._beforeDeploy = this.beforeDeploy.bind(this)
    this._afterDeploy = this.afterDeploy.bind(this)

    this.hooks = {
      'before:deploy:deploy': this._beforeDeploy,
      'after:deploy:deploy': this._afterDeploy,
    };

    this.documentationParts = [];
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

  beforeDeploy() {
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
        if (eventTypes.http && eventTypes.http.documentation) {
          const resourceName = normalizePath(eventTypes.http.path);
          const methodLogicalId = getMethodLogicalId(resourceName, eventTypes.http.method);
          const resource = cfTemplate.Resources[methodLogicalId];
          resource.DependsOn = new Set();
          this.addMethodResponses(resource, eventTypes.http.documentation);
          this.addRequestModels(resource, eventTypes.http.documentation);
          resource.DependsOn = Array.from(resource.DependsOn);
          if (resource.DependsOn.length === 0) {
            delete resource.DependsOn;
          }
        }
      });
    });
  }

  static _getDocumentationProperties(def) {
    const docProperties = new Map();
    ServerlessAwsModels._documentationProperties.forEach((key) => {
      if (def[key]) {
        docProperties.set(key, def[key]);
      }
    });
    return docProperties;
  }

  static _mapToObj(map) {
    const returnObj = {};
    map.forEach((key, val) => {
      returnObj[key] = val;
    });

    return returnObj;
  }

  _createDocumentationPart(part, def, knownLocation) {
    const location = part.locationProps.reduce((loc, property) => {
      loc[property] = knownLocation[property] || part.property;
      return loc;
    }, {});
    location.type = part.type;

    const props = ServerlessAwsModels._getDocumentationProperties(def);
    if (props.size > 0) {
      this.documentationParts.push({
        location,
        properties: ServerlessAwsModels._mapToObj(props),
        restApiId: this.restApiId,
      });
    }

    if (part.children) {
      this.createDocumentationParts(part.children, def, location);
    }
  }

  createDocumentationPart(part, def, knownLocation) {
    if (part.isList) {
      if (!(def instanceof Array)) {
        throw new Error(`definition for type "${part.type}" is not an array`);
      }
      def.forEach((singleDef) => this._createDocumentationPart(part, singleDef, knownLocation));
    } else {
      this._createDocumentationPart(part, def, knownLocation);
    }
  }

  createDocumentationParts(parts, def, knownLocation) {
    Object.keys(parts).forEach((part) => {
      if (def[part]) {
        this.createDocumentationPart(parts[part], def[part], knownLocation);
      }
    });
  }


  afterDeploy() {
    const customVars = this.serverless.variables.service.custom;
    const generalDocumentation = customVars.documentation || {};

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName);
      func.events.forEach(eventTypes => {
        if (eventTypes.http && eventTypes.http.documentation) {
          const path = eventTypes.http.path;
          const method = eventTypes.http.method;
          this.createDocumentationParts(ServerlessAwsModels._functionDocumentationParts, eventTypes.http, { path, method });
        }
      });
    });

    console.log('docParts', this.documentationParts);
  }

}

ServerlessAwsModels._documentationProperties = ['description'];

ServerlessAwsModels._functionDocumentationParts = {
  documentation: {
    type: 'METHOD',
    isList: false,
    locationProps: ['path', 'method'],
    children: {
      requestBody: {
        type: 'REQUEST_BODY',
        isList: false,
        locationProps: ['path', 'method'],
      },
      requestHeaders: {
        type: 'REQUEST_HEADER',
        isList: true,
        locationProps: ['path', 'method', 'name'],
      },
      queryParams: {
        type: 'QUERY_PARAMETER',
        isList: true,
        locationProps: ['path', 'method', 'name'],
      },
      pathParams: {
        type: 'PATH_PARAMETER',
        isList: true,
        locationProps: ['path', 'method', 'name'],
      },
      methodResponses: {
        type: 'PATH_PARAMETER',
        isList: true,
        locationProps: ['path', 'method', 'StatusCode'],
        children: {
          ResponseHeaders: {
            type: 'RESPONSE_HEADER',
            isList: true,
            locationProps: ['path', 'method', 'name', 'StatusCode'],
          },
          ResponseBody: {
            type: 'RESPONSE_BODY',
            isList: false,
            locationProps: ['path', 'method', 'StatusCode'],
          }
        }
      }
    }
  }
};

module.exports = ServerlessAwsModels;
