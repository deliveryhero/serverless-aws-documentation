[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com) [![Build Status](https://travis-ci.org/9cookies/serverless-aws-models.svg?branch=master)](https://travis-ci.org/9cookies/serverless-aws-models) [![codecov](https://codecov.io/gh/9cookies/serverless-aws-models/branch/master/graph/badge.svg)](https://codecov.io/gh/9cookies/serverless-aws-models) [![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hyperium/hyper/master/LICENSE)

# Serverless AWS Documentation

This is a [Serverless](http://www.serverless.com) v1 plugin that adds support for AWS API Gateway
documentation and models (e.g. to export a Swagger JSON file with input/output definitions and full text
documentation for API documentation).

## Install

This plugin only works for Serverless 1.0 and up. For a plugin that supports 0.5 look at
[this plugin](https://github.com/HyperBrain/serverless-models-plugin).

To install this plugin, add `serverless-aws-documentation` to your package.json:

```
npm install serverless-aws-documentation --save-dev
```

After that you need to add the `serverless-aws-documenation` plugin in to serverless.yml file:
If you don't have a plugins section add it. It should look like this:

```YAML
plugins:
  - serverless-aws-documenation
```

If you wan't to check if the plugin was added successfully, you can run this in your command line:
```
serverless
```

The plugin should show up in the "Plugins" section of the output.

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
    summary: 'My API'
    description: 'This is my API'
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
Underneath you can define `authorizers`, `resources` and `models` which are all lists of descriptions.
In addition to the description and the summary, Authorizers need the name of the authorizer, resources
need the path of the described resource and models need the name of the model.


### Define the models

Models have additional information you have to define. Beside the model name, the description and
the summary, you need to define the *content type* this model is for and the *schema* that describes
the model. Both are mandatory:

* `contentType`: the content type of the described request/response (like `"application/json"` or
`"application/xml"`).
* `schema`: The JSON Schema that describes the model. In the examples above external files are
imported but you can also define the schema in the YAML file if you want.

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
              statusCode: 200
              responseBody:
                description: "Response body description"
              responseHeaders:
                -
                  name: "x-superheader"
                  description: "this is a super header"
              responseModels:
                "application/json": "CreateResponse"
            -
              statusCode: 400
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
    statusCode: 200
    responseModels:
      "application/json": "CreateResponse"
      "application/xml": "CreateResponseXml"
  -
    statusCode: 400
    responseModels:
      "application/json": "ErrorResponse"
```

In the full example above you also can see the definition of the `requestModels` and `responseModels`
in a the context of the documenatation.

### Deploy the documenatation

To deploy the models you described above you just need to use `serverless deploy` as you are used to.

## Contribution

When you think something is missing or found some bug, please add an issue to this repo. If you want
to contribute code, just fork this repo and create a PR when you are finished. Pull Requests are only
accepted when there are unit tests covering your code.

## License

MIT
