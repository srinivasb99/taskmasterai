export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Missing "url" query parameter' });
    }

    try {
        const targetUrl = decodeURIComponent(url);
        const response = await fetch(targetUrl);
        const content = await response.text();

        // Add CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        return res.status(200).send(content);
    } catch (error) {
        return res.status(500).json({ error: 'Error fetching the URL' });
    }
}
