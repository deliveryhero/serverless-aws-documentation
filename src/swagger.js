'use strict'

function replaceSwaggerRefs (swagger) {
  function replaceRefs (obj) {
    if (!obj) {
      return
    }
    for (let key of Object.keys(obj)) {
      if (key === '$ref') {
        let match
        if (match = /#\/definitions\/([\-\w]+)/.exec(obj[key])) {
          obj[key] = '{{model: ' + match[1] + '}}'
        }
      } else if (typeof obj[key] === 'object') {
        replaceRefs(obj[key])
      }
    }
  }

  replaceRefs(swagger)
}

function extractModelDefinition(param, models) {
  // if the schema is just a $ref, set it to that value
  // otherwise create a model to handle this response
  if (param.schema['$ref']) {
    let match
    if (match = /#\/definitions\/([\-\w]+)/.exec(param.schema['$ref'])) {
      return match[1];
    }
  } else {
    replaceSwaggerRefs(param.schema)
    models.push({
      name: param.name,
      description: param.description,
      contentType: 'application/json',
      schema: param.schema
    })
    return param.name;
  }
}

module.exports = {
  replaceSwaggerDefinitions: function replaceSwaggerDefinitions (swagger) {
    return replaceSwaggerRefs(swagger)
  },
  extractModel: function extractModel(param, models) {
    return extractModelDefinition(param, models)
  }
}
