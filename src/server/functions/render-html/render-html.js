const mime = require('mime-types');
const middy = require('@middy/core');
const httpErrorHandler = require('@middy/http-error-handler');
const httpEventNormalizer = require('@middy/http-event-normalizer');
const httpSecurityHeaders = require('@middy/http-security-headers');
const validator = require('@middy/validator');

const { loadData } = require('lib/data-loader');
const { render } = require('lib/renderer');
const { matchRoute } = require('lib/router');
const serverTimer = require('lib/server-timer');
const { inputSchema, outputSchema } = require('./schema');

require('dotenv').config();

const isProduction = (process.env.NODE_ENV === 'production');
const pageNotFound = () => ({
    statusCode: 404,
    headers: { 'content-type': 'text/html' },
    //body: render(`404`, { _data: {}, _route: {} }),
    body: '<h1>404</h1>',
});
const serverError = (error) => ({
    statusCode: 500,
    headers: { 'content-type': 'text/html' },
    body: isProduction
        ? 'Server Error (500)'
        : `<h1>Server Error (500)</h1><pre><code>${JSON.stringify({ statusCode: 500, error }, null, 2)}</code></pre>`, // @todo: display stack trace
});

const handler = async (event) => {
    try {
        const { withTiming, timingsToString } = serverTimer('Request (total)');

        const route = await withTiming('Routing', matchRoute({
            urlPath: event.path,
            queryParams: event.queryStringParameters
        }));
        if (!route.isMatch) return pageNotFound();

        const data = await withTiming('Load data', loadData({ route }));
        const html = await withTiming('Rendering', render(route.name, { 
            ...data, 
            _data: data, 
            _route: route, 
            _params: route.params
        }));
        const contentType = mime.lookup(route.urlPath) || 'text/html';
        return {
            statusCode: 200,
            headers: { 
                'Content-Type': contentType,
                'Server-Timing': timingsToString(),
            },
            body: html,
        };
    } catch(error) {
        console.error(error);
        return serverError(error.toString());
    }
};

exports.handler = middy(handler)
    .use(httpEventNormalizer())
    .use(validator({ inputSchema, outputSchema }))
    .use(httpErrorHandler())
    .use(httpSecurityHeaders());
