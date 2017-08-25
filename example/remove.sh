#!/usr/bin/env bash
# Removes the API
cd `dirname "$0"`
set -e

sls remove

echo 'Done, all cleaned up'
