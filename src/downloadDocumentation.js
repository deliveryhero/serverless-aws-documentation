'use strict';

module.exports = {
  downloadDocumentation: function () {
    const aws = this.serverless.providers.aws;
    const stackName = aws.naming.getStackName(aws.getStage());
    return this._getRestApiId(stackName).then((restApiId) => {
      return aws.request('APIGateway', 'getExport', {
        stageName: aws.getStage(),
        restApiId: restApiId,
        exportType: this.options.exportType? this.options.exportType: 'swagger',
        parameters: {
          extensions: extensionType(this.options.extensions),
        },
        accepts: createAWSContentType(this.options.outputFileName),
      });
    }).then((response) => {
      this.fs.writeFileSync(this.options.outputFileName, response.body);
    });
  },

  _getRestApiId: function (stackName) {
    const aws = this.serverless.providers.aws;
    return aws.request('CloudFormation', 'describeStacks', {StackName: stackName},
      aws.getStage(),
      aws.getRegion()
    ).then((result) => {
      return result.Stacks[0].Outputs
        .filter(output => output.OutputKey === 'AwsDocApiId')
        .map(output => output.OutputValue)[0];
    });
  },
};

function getFileExtension(filename) {
  const path = require('path');
  let ext = path.extname(filename || '').split('.');

  return ext[ext.length - 1];
}

function createAWSContentType(outputFileName) {
  const fileExtension = getFileExtension(outputFileName);
  let awsContentType = 'application/json';
  if (fileExtension === 'yml' || fileExtension === 'yaml') {
    awsContentType = 'application/yaml';
  }

  return awsContentType;
}

function extensionType(extensionArg) {
  const possibleExtensions = ['integrations', 'apigateway', 'authorizers', 'postman'];

  if (possibleExtensions.includes(extensionArg)) {
    return extensionArg;
  } else {
    return 'integrations';
  }
}

