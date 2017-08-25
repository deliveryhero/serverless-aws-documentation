#!/usr/bin/env bash
# Deploys the API
cd `dirname "$0"`
set -e

sls deploy

echo "Now run $(tput setaf 2)./download-swagger-json.sh$(tput sgr0) to get your Swagger document"
