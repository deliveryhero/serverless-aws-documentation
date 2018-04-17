describe('ServerlessAWSDocumentation', function () {
  let objectUnderTest;

  beforeEach(() => {
    objectUnderTest = require('./downloadDocumentation.js');
    objectUnderTest.fs = {
      writeFileSync: jasmine.createSpy('fs')
    };
    objectUnderTest.serverless = {
      providers: {
        aws: {
          naming: {
            getStackName: () => {
              return 'testStackName';
            }
          },
          request: jasmine.createSpy('aws request'),
        }
      },
      service: {
        provider: {
          stage: 'testStage',
          region: 'testRegion',
        }
      }
    };
  });

  afterEach(() => {
    delete require.cache[require.resolve('./downloadDocumentation.js')];
  });

  describe('downloadDocumentation', () => {
    it('should successfully download documentation, unknown file extension', (done) => {
      objectUnderTest.options = {
        outputFileName: 'test.txt',
      };
      objectUnderTest._getRestApiId = () => {
        return Promise.resolve('testRestApiId')
      };

      objectUnderTest.serverless.providers.aws.request.and.returnValue(Promise.resolve({
        body: 'some body',
      }));
      return objectUnderTest.downloadDocumentation().then(() => {
        expect(objectUnderTest.serverless.providers.aws.request).toHaveBeenCalledWith('APIGateway', 'getExport', {
          stageName: 'testStage',
          restApiId: 'testRestApiId',
          exportType: 'swagger',
          accepts: 'application/json',
        });
        expect(objectUnderTest.fs.writeFileSync).toHaveBeenCalledWith('test.txt', 'some body');

        done();
      });
    });

    it('should successfully download documentation, yaml extension', (done) => {
      objectUnderTest.options = {
        outputFileName: 'test.yml',
      };
      objectUnderTest._getRestApiId = () => {
        return Promise.resolve('testRestApiId')
      };

      objectUnderTest.serverless.providers.aws.request.and.returnValue(Promise.resolve({
        body: 'some body',
      }));
      return objectUnderTest.downloadDocumentation().then(() => {
        expect(objectUnderTest.serverless.providers.aws.request).toHaveBeenCalledWith('APIGateway', 'getExport', {
          stageName: 'testStage',
          restApiId: 'testRestApiId',
          exportType: 'swagger',
          accepts: 'application/yaml',
        });
        expect(objectUnderTest.fs.writeFileSync).toHaveBeenCalledWith('test.yml', 'some body');

        done();
      });
    });

    it('should throw an error', (done) => {
      objectUnderTest.options = {
        outputFileName: 'test.json',
      };
      objectUnderTest._getRestApiId = () => {
        return Promise.resolve('testRestApiId');
      };
      objectUnderTest.serverless.providers.aws.request.and.returnValue(Promise.reject('reason'));
      return objectUnderTest.downloadDocumentation().catch(() => {
        done();
      });
    });

    it('should get rest api id', (done) => {
      objectUnderTest.serverless.providers.aws.request.and.returnValue(Promise.resolve({
        Stacks: [{
          Outputs: [{
            OutputKey: 'some-key-1',
            OutputValue: 'some-value-1',
          }, {
            OutputKey: 'AwsDocApiId',
            OutputValue: 'testRestApiId',
          }, {
            OutputKey: 'some-key-2',
            OutputValue: 'some-value-2',
          }]
        }]
      }));

      return objectUnderTest._getRestApiId('testStackName').then((restApiId) => {
        expect(restApiId).toBe('testRestApiId');
        expect(objectUnderTest.serverless.providers.aws.request).toHaveBeenCalledWith(
          'CloudFormation',
          'describeStacks',
          jasmine.objectContaining({StackName: 'testStackName'}), 'testStage', 'testRegion'
        );

        done();
      });
    });
  });
});
