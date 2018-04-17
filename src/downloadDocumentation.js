'use strict';

module.exports = {
  downloadDocumentation: function () {
    const aws = this.serverless.providers.aws;
    const stackName = aws.naming.getStackName(this.serverless.service.provider.stage);
    return this._getRestApiId(stackName).then((restApiId) => {
      return aws.request('APIGateway', 'getExport', {
        stageName: this.serverless.service.provider.stage,
        restApiId: restApiId,
        exportType: 'swagger',
        accepts: createAWSContentType(this.options.outputFileName),
      });
    }).then((response) => {
      this.fs.writeFileSync(this.options.outputFileName, response.body);
    });
  },

  _getRestApiId: function (stackName) {
    return this.serverless.providers.aws.request('CloudFormation', 'describeStacks', {StackName: stackName},
      this.serverless.service.provider.stage,
      this.serverless.service.provider.region
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

