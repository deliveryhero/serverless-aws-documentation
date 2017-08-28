describe('ServerlessAWSDocumentation', function () {

  const objectUnderTest = require('./documentation.js')()

  beforeEach(() => {
    objectUnderTest.documentationParts = []
    objectUnderTest.restApiId = 'testApiId'
  })

  describe('_createDocumentationPart', () => {
    it('should include the tags property for an API part', () => {
      let part = {
        type: 'API',
        isList: false,
        locationProps: []
      }
      let def = {
        info: {
          title: 'the title',
          description: 'the desc',
          version: 123,
          termsOfService: 'http://www.example.com/terms-of-service',
          contact: {
            name: 'John Smith',
            url: 'http://www.example.com/me',
            email: 'js@example.com'
          },
          license: {
            name: 'Licensing',
            url: 'http://www.example.com/licensing'
          }
        },
        tags: ['tag1']
      }
      let knownLocation = {}
      objectUnderTest._createDocumentationPart(part, def, knownLocation)
      let result = objectUnderTest.documentationParts
      expect(result.length).toBe(1)
      expect(result).toEqual([
        {
          location: {
            type: 'API'
          },
          properties: {
            info: {
              title: 'the title',
              description: 'the desc',
              version: 123,
              termsOfService: 'http://www.example.com/terms-of-service',
              contact: {
                name: 'John Smith',
                url: 'http://www.example.com/me',
                email: 'js@example.com'
              },
              license: {
                name: 'Licensing',
                url: 'http://www.example.com/licensing'
              }
            },
            tags: ['tag1']
          },
          restApiId: 'testApiId'
        }
      ])
    })

    it('should include the tags property for a METHOD part', () => {
      let part = {
        type: 'METHOD',
        isList: false,
        locationProps: ['path', 'method'],
        children: {}
      }
      let def = {
        description: 'the desc',
        summary: 'the summary',
        tags: ['tag1']
      }
      let knownLocation = {
        path: '/some/path',
        method: 'GET'
      }
      objectUnderTest._createDocumentationPart(part, def, knownLocation)
      let result = objectUnderTest.documentationParts
      expect(result.length).toBe(1)
      expect(result).toEqual([
        {
          location: {
            type: 'METHOD',
            path: '/some/path',
            method: 'GET'
          },
          properties: {
            description: 'the desc',
            summary: 'the summary',
            tags: ['tag1']
          },
          restApiId: 'testApiId'
        }
      ])
    })

    it('should not include the tags property for a REQUEST_BODY part (actually anything other than API or METHOD)', () => {
      let part = {
        type: 'QUERY_PARAMETER',
        isList: true,
        locationProps: ['path', 'method', 'name']
      }
      let def = {
        description: 'the desc',
        summary: 'the summary',
        tags: ['tag1'] // should be ignored
      }
      let knownLocation = {
        path: '/some/path',
        method: 'GET',
        name: 'someParam'
      }
      objectUnderTest._createDocumentationPart(part, def, knownLocation)
      let result = objectUnderTest.documentationParts
      expect(result.length).toBe(1)
      expect(result).toEqual([
        {
          location: {
            type: 'QUERY_PARAMETER',
            path: '/some/path',
            method: 'GET',
            name: 'someParam'
          },
          properties: {
            description: 'the desc',
            summary: 'the summary'
          },
          restApiId: 'testApiId'
        }
      ])
    })
  })

  describe('getDocumentationProperties', () => {
    it('should include the tags property when we indicate to include it', () => {
      let def = {
        description: 'the desc',
        summary: 'the summary',
        tags: ['tag1']
      }
      let propertiesToGet = ['description', 'summary', 'tags']
      let result = objectUnderTest._getDocumentationProperties(def, propertiesToGet)
      expect(result.size).toBe(3)
      expect(result.get('description')).toBe('the desc')
      expect(result.get('summary')).toBe('the summary')
      expect(result.get('tags')).toEqual(['tag1'])
    })

    it('should ignore a defined tag when we indicate to not include it', () => {
      let def = {
        description: 'the desc',
        summary: 'the summary',
        tags: ['tag1']
      }
      let propertiesToGet = ['description', 'summary'] // no 'tags'
      let result = objectUnderTest._getDocumentationProperties(def, propertiesToGet)
      expect(result.size).toBe(2)
      expect(result.get('description')).toBe('the desc')
      expect(result.get('summary')).toBe('the summary')
      expect(result.get('tags')).toBeUndefined()
    })
  })
})
