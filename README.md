[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com) [![Build Status](https://travis-ci.org/9cookies/serverless-aws-documentation.svg?branch=master)](https://travis-ci.org/9cookies/serverless-aws-documentation) [![codecov](https://codecov.io/gh/9cookies/serverless-aws-documentation/branch/master/graph/badge.svg)](https://codecov.io/gh/9cookies/serverless-aws-documentation) [![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hyperium/hyper/master/LICENSE)

# Serverless AWS Documentation

This is a [Serverless](http://www.serverless.com) v1 plugin that adds support for AWS API Gateway
documentation and models (e.g. to export a Swagger JSON file with input/output definitions and full text
documentation for API documentation).

## What is AWS API Gateway documentation?

Amazon introduced a new documentation feature for it's API Gateway on AWS on December 1st. With this you can add manually written documentation to all parts of API Gateway such as resources, requests, responses or single path or query parameters. When exporting Swagger from API Gateway these documentation is added to the other information to create a more human understandable documentation.

In addition to this documentation this plugin also adds support to add models to API Gateway and use it with the serverless functions. Models are JSON Schemas that define the structure of request or response bodies. This includes property structure, their types and their validation. More about this you'll find here: https://spacetelescope.github.io/understanding-json-schema/

## Install

This plugin only works for Serverless 1.0 and up. For a plugin that supports 0.5 look at
[this plugin](https://github.com/HyperBrain/serverless-models-plugin).

To install this plugin, add `serverless-aws-documentation` to your package.json:

```
npm install serverless-aws-documentation --save-dev
```

Next, add the `serverless-aws-documenation` plugin in to serverless.yml file:
If you don't already have a plugins section, create one that looks like this:

```YAML
plugins:
  - serverless-aws-documentation
```

To verify that the plugin was added successfully, run this in your command line:
```
serverless
```

The plugin should show up in the "Plugins" section of the output as "ServerlessAWSDocumentation"

## Usage

There are two places you need to touch in the `serverless.yml`: *custom variables* to define your
general documentation descriptions and models, and the *http* events in your `functions` section to
add these models to your requests and responses and add description to function relevant parts.

### Define descriptions for your documentation

For manual full text descriptions for the parts of your API you need to describe it's structure.
In the general part you can describe your API in general, authorizers, models and resources.
If you want to find out more about models, you can skip to the next section.

Your general documentation has to be nested in the custom variables section and looks like this:

```YAML
custom:
  documentation:
    version: '1'
    summary: 'My API'
    description: 'This is my API'
    tags:
      -
        name: 'Data Creation'
        description: 'Services to create things'
      -
        name: 'Some other tag'
        description: 'A tag for other things'
    authorizers:
      -
        name: "MyCustomAuthorizer"
        description: "This is an error"
    resources:
      -
        path: "some/path"
        description: "This is the description for some/path"
      -
        path: "some/other/path"
        description: "This is the description for some/other/path"
```

Your documentation has to be nested in the `documentation` custom variable. You describe your
documentation parts with the `description` and `summary` properties. The summary is some sort of
title and the description is for further explanation.

On the upper level (directly in the `documentation` section) you describe your API in general.
In there you also can manually describe the version (needs to be a string). If you don't define the
version, the version that API Gateway needs will automatically be generated. This auto version is a
hash of the documentation you defined, so if you don't change your documentation, the documentation
in API Gateway won't be touched.
Underneath you can define `tags`, `authorizers`, `resources` and `models` which are all lists of descriptions.
In addition to the description and the summary, Authorizers need the name of the authorizer, resources
need the path of the described resource and models need the name of the model. Tags provides the description for tags that are used on `METHOD`s (HTTP events), [more info here](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md#tag-object).


### Define the models

Models have additional information you have to define. Besides the model name, the description and
the summary, you need to define the *content type* for this model in addition to the *schema* that
describes the model:

* `contentType`: the content type of the described request/response (like `"application/json"` or
`"application/xml"`). This is mandatory.
* `schema`: The JSON Schema that describes the model. In the examples below external files are
imported, but you can also define the schema inline using YAML format.

Your models definition could look like this:

```YAML
custom:
  documentation:
    models:
      -
        name: "ErrorResponse"
        description: "This is an error"
        contentType: "application/json"
        schema: ${file(models/error.json)}
      -
        name: "CreateRequest"
        description: "Model for creating something"
        contentType: "application/json"
        schema: ${file(models/create_request.json)}
```

### Function specific documentation

When you want to describe the parts inside a `RESOURCE` you need to do this in the functions
described in your `serverless.yml`. Inside the `http` event of your functions you need to add the
`documentation` property which can hold the following parts:

* The method description which is described directly inside the `documentation` property
* `requestBody`: The body of your HTTP request
* `requestHeaders`: A list of headers for your HTTP request (needs `name` of the header)
* `queryParams`: A list of query parameters (needs `name` of the parameter)
* `pathParams`: A list of path parameters (needs `name` of the parameter)
* `methodResponses`: A list of method responses (needs the `statusCode` of the response)
* `tags`: A list of tags apply to the `METHOD`, which is the HTTP event in serverless. Used in [Swagger-UI](https://swagger.io/swagger-ui/)

The methodResponses itself can have the following parts:

* `responseBody`: The body of the HTTP request
* `responseHeaders`: A list of headers for your HTTP response (needs `name` of the header)

With this your function definition could look like this:

```YAML
createItem:
  handler: handler.create
  events:
    - http:
        path: create
        method: post
        documentation:
          summary: "Create something"
          description: "Creates the thing you need"
          tags:
            - "Data Creation"
            - "Some other tag"
          requestBody:
            description: "Request body description"
          requestHeaders:
            -
              name: "x-header"
              description: "Header description"
            -
              name: "Authorization"
              description: "Auth Header description"
          queryParams:
            -
              name: "sid"
              description: "Session ID"
            -
              name: "theme"
              description: "Theme for for the website"
          pathParams:
            -
              name: "id"
              description: "ID of the thing you want to create"
          requestModels:
            "application/json": "CreateRequest"
            "application/xml": "CreateRequestXml"
          methodResponses:
            -
              statusCode: "200"
              responseBody:
                description: "Response body description"
              responseHeaders:
                -
                  name: "x-superheader"
                  description: "this is a super header"
              responseModels:
                "application/json": "CreateResponse"
            -
              statusCode: "400"
              responseModels:
                "application/json": "ErrorResponse"
```

To add your defined models to the function you also need the following properties.

#### requestModels

In the `requestModels` property you can add models for the HTTP request of the function. You can have
multiple models for different `ContentType`s. Inside the `requestModels` property you define the
content type as the key and the model name defined in the models section above as the value.
Here's short example:

```YAML
requestModels:
  "application/json": "CreateRequest"
  "application/xml": "CreateRequestXml"
```

#### methodResponses.responseModels

In the `methodResponses` property you can define multiple response models for this function.
The response models are described in the `ResponseModels` property which contains the models for the
different content types. These response models are described like the `requestModels` above.

```YAML
methodResponses:
  -
    statusCode: "200"
    responseModels:
      "application/json": "CreateResponse"
      "application/xml": "CreateResponseXml"
  -
    statusCode: "400"
    responseModels:
      "application/json": "ErrorResponse"
```

In the full example above you also can see the definition of the `requestModels` and `responseModels`
in a the context of the documenatation.

### Deploy the documentation

To deploy the models you described above you just need to use `serverless deploy` as you are used to.

If you've defined `requestHeaders` in your documentation this will add those request headers to the CloudFormation being deployed, if you haven't already defined those request parameters yourself. If you don't want this, add the option `--doc-safe-mode` when deploying. If you use that option you need to define the request parameters manually to  have them included in the documentation, e.g.

```YAML
ApiGatewayMethod{normalizedPath}{normalizedMethod}:
  Properties:
    RequestParameters:
      method.request.header.{header-name}: true|false
```

See the Serverless documentation for more information on [resource naming](https://serverless.com/framework/docs/providers/aws/guide/resources/), and the AWS documentation for more information on [request parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-method-integration.html#cfn-apigateway-method-integration-requestparameters).

## Coming soon

A demo `serverless.yml` to help you better understand how to use this plugin.

## Contribution

When you think something is missing or found some bug, please add an issue to this repo. If you want
to contribute code, just fork this repo and create a PR when you are finished. Pull Requests are only
accepted when there are unit tests covering your code.

## License

MIT
