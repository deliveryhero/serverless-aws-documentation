[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

# Serverless AWS Models

This is a [Serverless](http://www.serverless.com) 1.0 plugin that adds support for AWS API Gateway
models (e.g. to export a Swagger JSON file with input/output definitions for API documentation).

## Install

This plugin only works for Serverless 1.0 and up. For a plugin that supports 0.5 look at
[this plugin](https://github.com/HyperBrain/serverless-models-plugin).

To install this plugin, add Serverless AWS Models:

```
npm install serverless-aws-models --save-dev
```

After that you need to add the `serverless-aws-models` plugin in to serverless.yml file:
If you don't have a plugins section add it. It should look like this:

```YAML
plugins:
  - serverless-aws-models
```

If you wan't to check if the plugin was added successfully, you can run this in your command line:
```
serverless
```

The plugin should show up in the "Plugins" section of the output.

## Usage

There are two places you need to touch in the `serverless.yml`: *custom variables* to define your
models and the *http* events in your `functions` section to add these models to your requests and
responses.

### Define the models

To use this plugin you first need to configure the models in your project's `serverless.yml` file:

First you need to define the models that you want to use in the custom variables section like this:

```YAML
custom:
  models:
    ErrorResponse:
      ContentType: "application/json"
      Schema: ${file(models/error.json)}
    CreateRequest:
      ContentType: "application/json"
      Schema: ${file(models/create_request.json)}
```

Your models live in the ```models``` section of the custom variables section. If you haven't
defined any custom variables yet you need to add the `custom` section like in the code example above.

You can define multiple models inside the ```models``` section. The property name of each model
defines the name of the model. Inside the model you have two properties that are mandatory:

* `ContentType`: the content type of the described request/response (like `"application/json"` or
`"application/xml"`).
* `Schema`: The JSON Schema that describes the model. In the examples above external files are
imported but you can also define the schema in the YAML file if you want.

### Add the models to your functions

To add the models to your functions you need to add some lines to the `http` events of your functions.

There are two properties you can use:

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

#### methodResponses

In the `methodResponses` property you can define multiple responses for this function as a list.
A response needs the `StatusCode` property containing the HTTP status code for the described response
and the `ResponseModels` property containing the models for the different content types. These response
models are described like the `requestModels` above.

```YAML
methodResponses:
  -
    StatusCode: 200
    ResponseModels:
      "application/json": "CreateResponse"
      "application/xml": "CreateResponseXml"
  -
    StatusCode: 400
    ResponseModels:
      "application/json": "ErrorResponse"
```

Here is a complete example with request models and method responses described for a simple function:

```YAML
createItem:
  handler: handler.create
  events:  
    - http:
        path: create
        method: get
        requestModels:
          "application/json": "CreateRequest"
          "application/xml": "CreateRequestXml"
        methodResponses:
          -
            StatusCode: 200
            ResponseModels:
              "application/json": "CreateResponse"
          -
            StatusCode: 400
            ResponseModels:
              "application/json": "ErrorResponse"
```

### Deploy the models

To deploy the models you described above you just need to use `serverless deploy` as you are used to.

## Contribution

When you think something is missing or found some bug, please add an issue to this repo. If you want
to contribute code, just fork this repo and create a PR when you are finished. Pull Requests are only
accepted when there are unit tests covering your code.

## License

MIT
