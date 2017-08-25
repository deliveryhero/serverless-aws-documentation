'use strict'

const reponseHeadersJson = {
  'Access-Control-Allow-Origin': '*', // Required for CORS support to work
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Expose-Headers': 'link',
  'Content-Type': "'application/json'"
}

module.exports.router = (event, context, callback) => {
  const routes = {
    '/example/message': exampleMessageGet,
    '/example/do-something': exampleDoSomethingPost
  }
  let handler = routes[event.path]
  const response = handler(event, context, callback)
  callback(null, response)
}

function exampleMessageGet (event, context, callback) {
  let headers = reponseHeadersJson
  let scheme = event.headers['X-Forwarded-Proto']
  let host = event.headers.Host
  let path = event.requestContext.path.replace('example/message','example/do-something')
  headers.link = `<${scheme}://${host}${path}>; rel="related"`
  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({
      message: 'Hello, World!',
    })
  }
}

function exampleDoSomethingPost (event, context, callback) {
  let body = JSON.parse(event.body)
  if (body.constructor !== Array) {
    return {
      statusCode: 400,
      headers: reponseHeadersJson,
      body: JSON.stringify({
        message: 'The supplied request body must be a JSON array',
        statusCode: '400'
      })
    }
  }
  let itemCount = body.length
  return {
    statusCode: 200,
    headers: reponseHeadersJson,
    body: JSON.stringify({
      result: 'Thanks for sending that data',
      submittedItems: itemCount
    })
  }
}
