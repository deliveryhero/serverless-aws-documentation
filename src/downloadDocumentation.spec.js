describe('ServerlessAWSDocumentation', function () {
  const objectUnderTest = require('./downloadDocumentation.js');

  beforeEach(() => {
    objectUnderTest.restApiId = 'testApiId';

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

  describe('downloadDocumentation', () => {
    it('should successfully download documentation', (done) => {
      objectUnderTest.options = {
        outputFileName: 'test.json',
      };
      objectUnderTest._getRestApiId = () => {
        return Promise.resolve('testRestApiId')
      };

      objectUnderTest.serverless.providers.aws.request.and.returnValue(Promise.resolve({
        body: 'some body',
      }));
      return objectUnderTest.downloadDocumentation().then(() => {
        expect(objectUnderTest.fs.writeFileSync).toHaveBeenCalledWith('test.json', 'some body');

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
  });
});
