describe('ServerlessAWSDocumentation', function() {
    const objectUnderTest = require('./models.js')

    describe('createCfModel', () => {
        it('should replace model ref with valid URI', () => {
            let modelInput = {
                contentType: 'application/json',
                name: 'TestModel',
                schema: {
                    type: 'object',
                    properties: {
                        prop: {
                            '$ref': '{{model: OtherModelName}}'
                        }
                    }
                }
            };

            let modelOutput = objectUnderTest.createCfModel({
                Ref: 'ApiGatewayRestApi',
            })(modelInput);
            expect(modelOutput).toEqual({
                Type: 'AWS::ApiGateway::Model',
                Properties: {
                    RestApiId: {
                        Ref: 'ApiGatewayRestApi',
                    },
                    ContentType: 'application/json',
                    Name: 'TestModel',
                    Schema: {
                        type: 'object',
                        properties: {
                            prop: {
                                '$ref': {
                                    'Fn::Join': [
                                        '/',
                                        [
                                            'https://apigateway.amazonaws.com/restapis',
                                            {
                                                'Ref': 'ApiGatewayRestApi'
                                            },
                                            'models',
                                            'OtherModelName'
                                        ]
                                    ]
                                }
                            }
                        }
                    }
                },
                DependsOn: [
                    'OtherModelNameModel'
                ]
            });
        });

        it('should use provided rest api setting', () => {
            let modelInput = {
                contentType: 'application/json',
                name: 'TestModel',
                schema: {
                    type: 'object',
                    properties: {
                        prop: {
                            '$ref': '{{model: OtherModelName}}'
                        }
                    }
                }
            };

            let modelOutput = objectUnderTest.createCfModel({
                'Fn::ImportValue': 'PublicApiGatewayRestApi',
            })(modelInput);
            expect(modelOutput).toEqual({
                Type: 'AWS::ApiGateway::Model',
                Properties: {
                    RestApiId: {
                        'Fn::ImportValue': 'PublicApiGatewayRestApi',
                    },
                    ContentType: 'application/json',
                    Name: 'TestModel',
                    Schema: {
                        type: 'object',
                        properties: {
                            prop: {
                                '$ref': {
                                    'Fn::Join': [
                                        '/',
                                        [
                                            'https://apigateway.amazonaws.com/restapis',
                                            {
                                                'Fn::ImportValue': 'PublicApiGatewayRestApi'
                                            },
                                            'models',
                                            'OtherModelName'
                                        ]
                                    ]
                                }
                            }
                        }
                    }
                },
                DependsOn: [
                    'OtherModelNameModel'
                ]
            });
        });

        it('should not mess with non-ref model definitions', () => {
            let modelInput = {
                contentType: 'application/json',
                name: 'TestModel',
                schema: {
                    type: 'object',
                    properties: {
                        prop: {
                            type: 'string'
                        }
                    }
                }
            };

            let modelOutput = objectUnderTest.createCfModel({
                Ref: 'ApiGatewayRestApi',
            })(modelInput);
            expect(modelOutput).toEqual({
                Type: 'AWS::ApiGateway::Model',
                Properties: {
                    RestApiId: {
                        Ref: 'ApiGatewayRestApi',
                    },
                    ContentType: 'application/json',
                    Name: 'TestModel',
                    Schema: {
                        type: 'object',
                        properties: {
                            prop: {
                                type: 'string'
                            }
                        }
                    }
                }
            });
        });

    });
})
