#!/usr/bin/env bash
# Downloads the JSON Swagger document
cd `dirname $0`
set -e
stage=dev
region=us-east-1 # must match serverless.yml:provider.region
apiId=`bash -c "aws apigateway get-rest-apis --output=json --region=$region | /usr/bin/env node ./extract-rest-api-id.js $stage"`
fileType=json
outputFileName=serverless-aws-documentation-example-$STAGE.$fileType
printf "Downloading Swagger definition to ./$outputFileName
  API ID: $apiId
   Stage: $stage
  Accept: $fileType\n\n"

aws apigateway get-export \
  --rest-api-id=$apiId \
  --stage-name=$stage \
  --export-type=swagger \
  --accept=application/$fileType \
  --region=$region \
  $outputFileName

printf "
$(tput setaf 2)Done, your swagger document is: ./$outputFileName$(tput sgr0)
Go to http://editor.swagger.io/ and paste the contents of your swagger document to see it in Swagger UI"
