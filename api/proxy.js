export default async function handler(req, res) {
    const { url } = req.query;

    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    if (!url) {
        return res.status(400).json({ error: 'Missing "url" query parameter' });
    }

    try {
        const targetUrl = decodeURIComponent(url);
        const fetchOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': req.headers['accept'] || '*/*',
            },
            redirect: 'follow'
        };

        const response = await fetch(targetUrl, fetchOptions);

        if (!response.ok) {
            return res.status(response.status).json({
                error: `Upstream server responded with ${response.status}`,
                status: response.status
            });
        }

        // Forward headers from the target response
        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type');

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        // Forward important headers from the target response
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        // Stream the response instead of loading it all into memory
        const buffer = await response.arrayBuffer();
        res.status(200).send(Buffer.from(buffer));

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ 
            error: 'Error fetching the URL',
            details: error.message
        });
    }
}
